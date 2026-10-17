import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  CreateWindowInput,
  InputWindow,
  InteractionEvent,
  ModerationDecision,
  Resolution,
  Submission,
  SubmissionStatus,
  SubmitIntentInput,
  WindowState,
} from "../types.js";
import {
  canonical,
  integer,
  InteractionError,
  record,
  requireValue,
  text,
  timestamp,
  validateIntent,
  validateTransition,
  validateWindow,
} from "../validation.js";

type Row = QueryResultRow;
export type NewInteractionEvent = Omit<InteractionEvent, "sequence" | "id">;
const iso = (value: string | Date): string => new Date(value).toISOString();
function windowFromRow(r: Row): InputWindow {
  return {
    id: r.id,
    revision: r.revision,
    worldId: r.world_id,
    branchId: r.branch_id,
    baseCommitHash: r.base_commit_hash,
    conflictKey: r.conflict_key,
    state: r.state,
    allowedInputKinds: r.allowed_input_kinds,
    arbitrationPolicy: r.arbitration_policy,
    arbitrationPolicyConfig: r.arbitration_policy_config ?? {},
    billingPolicy: r.billing_policy,
    billingTerms: r.billing_terms ?? undefined,
    maxSubmissionsPerUser: r.max_submissions_per_user,
    maxSelectedInputs: r.max_selected_inputs,
    opensAt: iso(r.opens_at),
    closesAt: r.closes_at ? iso(r.closes_at) : null,
    contentRating: r.content_rating,
    moderationPolicyVersion: r.moderation_policy_version ?? "1.0.0",
    rulesetVersion: r.ruleset_version ?? "1.0.0",
    priceQuoteId: r.price_quote_id ?? undefined,
    appMetadata: r.app_metadata ?? {},
  };
}
function submissionFromRow(r: Row): Submission {
  return {
    id: r.id,
    windowId: r.window_id,
    actorId: r.actor_id,
    idempotencyKey: r.idempotency_key,
    kind: r.kind,
    targetEntityIds: r.target_entity_ids ?? [],
    baseCommitHash: r.base_commit_hash,
    payload: r.payload,
    status: r.status,
    moderationDecisionId: r.moderation_decision_id ?? undefined,
    entitlementId: r.entitlement_id ?? undefined,
    admittedAt: iso(r.admitted_at),
    admissionSequence: r.admission_sequence,
    appMetadata: r.app_metadata ?? {},
  };
}
function resolutionFromRow(r: Row): Resolution {
  return {
    id: r.id,
    windowId: r.window_id,
    selectedSubmissionIds: r.selected_submission_ids,
    rejectedSubmissionIds: r.rejected_submission_ids,
    arbitrationPolicy: r.arbitration_policy,
    policyVersion: r.policy_version,
    resolutionSequence: r.resolution_sequence,
    baseCommitHash: r.base_commit_hash,
    status: r.status,
    modelExecutionId: r.model_execution_id ?? undefined,
    resultingCommitHash: r.resulting_commit_hash ?? undefined,
    appMetadata: r.app_metadata ?? {},
  };
}
function eventFromRow(r: Row): InteractionEvent {
  return {
    id: r.id,
    worldId: r.world_id,
    windowId: r.window_id ?? undefined,
    sequence: r.sequence,
    eventType: r.event_type,
    data: r.payload,
    occurredAt: iso(r.occurred_at),
  };
}

/** Owns persistence, lock ordering, counters and transactional outbox writes. */
export class InteractionRepository {
  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient
  ) {}

  /** Internal transaction seam: callbacks must use the supplied repository and do no network I/O. */
  async transaction<T>(
    work: (repository: InteractionRepository) => Promise<T>
  ): Promise<T> {
    if (this.client) return work(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new InteractionRepository(this.pool, client));
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }
  async query(sql: string, values: unknown[] = []) {
    return (this.client ?? this.pool).query(sql, values);
  }
  async now(): Promise<number> {
    return new Date(
      (await this.query("SELECT clock_timestamp() AS now")).rows[0].now
    ).getTime();
  }
  async getWindow(id: string, lock = false): Promise<InputWindow | null> {
    const r = await this.query(
      `SELECT * FROM input_windows WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id]
    );
    // All lifecycle transactions acquire the world event lock before any credit grants.
    // This prevents a grant -> outbox / outbox -> grant deadlock across windows.
    if (lock && r.rows[0])
      await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `interaction-world:${r.rows[0].world_id}`,
      ]);
    return r.rows[0] ? windowFromRow(r.rows[0]) : null;
  }
  async createWindow(input: CreateWindowInput): Promise<InputWindow> {
    validateWindow(input);
    return this.transaction(async (r) => {
      const result = await r.query(
        `INSERT INTO input_windows(id,world_id,branch_id,base_commit_hash,conflict_key,state,allowed_input_kinds,arbitration_policy,arbitration_policy_config,billing_policy,max_submissions_per_user,max_selected_inputs,opens_at,closes_at,content_rating,moderation_policy_version,ruleset_version,app_metadata,billing_terms)
        VALUES($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [
          randomUUID(),
          input.worldId,
          input.branchId,
          input.baseCommitHash,
          input.conflictKey,
          JSON.stringify(input.allowedInputKinds),
          input.arbitrationPolicy,
          JSON.stringify(input.arbitrationPolicyConfig ?? {}),
          input.billingPolicy,
          input.maxSubmissionsPerUser,
          input.maxSelectedInputs,
          input.opensAt,
          input.closesAt,
          input.contentRating,
          input.moderationPolicyVersion ?? "1.0.0",
          input.rulesetVersion ?? "1.0.0",
          JSON.stringify(input.appMetadata ?? {}),
          input.billingTerms ? JSON.stringify(input.billingTerms) : null,
        ]
      );
      const window = windowFromRow(result.rows[0]);
      await r.emit(window, "window_created", { state: window.state });
      return window;
    });
  }
  async listWindows(
    worldId: string,
    state?: WindowState
  ): Promise<InputWindow[]> {
    const r = await this.query(
      "SELECT * FROM input_windows WHERE world_id=$1 AND ($2::text IS NULL OR state=$2) ORDER BY created_at,id",
      [worldId, state ?? null]
    );
    return r.rows.map(windowFromRow);
  }
  async listOpenWindowsDueToClose(): Promise<InputWindow[]> {
    const r = await this.query(
      "SELECT * FROM input_windows WHERE state='open' AND closes_at <= clock_timestamp() ORDER BY closes_at,id LIMIT 100"
    );
    return r.rows.map(windowFromRow);
  }
  async updateWindowState(
    id: string,
    state: WindowState,
    expectedRevision?: number
  ): Promise<void> {
    await this.transaction(async (r) => {
      const w = requireValue(await r.getWindow(id, true), "Window");
      if (expectedRevision !== undefined && w.revision !== expectedRevision)
        throw new InteractionError(
          "REVISION_CONFLICT",
          "Window revision changed"
        );
      validateTransition(w, state);
      if (w.state === state) return;
      const now = await r.now();
      if (
        state === "open" &&
        (Date.parse(w.opensAt) > now ||
          (w.closesAt !== null && Date.parse(w.closesAt) <= now))
      )
        throw new InteractionError(
          "INVALID_STATE",
          "Window is outside its opening schedule"
        );
      if (state === "open") {
        const active = await r.query(
          "SELECT id FROM input_windows WHERE world_id=$1 AND branch_id=$2 AND conflict_key=$3 AND id<>$4 AND state IN ('open','qualifying','resolving','executing','committing')",
          [w.worldId, w.branchId, w.conflictKey, w.id]
        );
        if (active.rows.length)
          throw new InteractionError(
            "CONFLICT",
            "Another active window owns this conflict key"
          );
      }
      if (state === "qualifying") {
        const active = await r.query(
          "SELECT id FROM resolutions WHERE window_id=$1 AND status IN ('selected','executing')",
          [w.id]
        );
        if (active.rows.length)
          throw new InteractionError(
            "RESOLUTION_IN_PROGRESS",
            "Complete the active queue resolution before closing intake"
          );
      }
      await r.query(
        "UPDATE input_windows SET state=$2, revision=revision+1, updated_at=now() WHERE id=$1 AND revision=$3",
        [id, state, w.revision]
      );
      await r.emit(w, "window_state_changed", {
        state,
        previousState: w.state,
        revision: w.revision + 1,
      });
    });
  }
  async advanceHead(id: string, hash: string): Promise<void> {
    text(hash, "resultingCommitHash");
    await this.query(
      "UPDATE input_windows SET base_commit_hash=$2,revision=revision+1,updated_at=now() WHERE id=$1",
      [id, hash]
    );
  }
  async getSubmission(id: string, lock = false): Promise<Submission | null> {
    const r = await this.query(
      `SELECT * FROM submissions WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id]
    );
    return r.rows[0] ? submissionFromRow(r.rows[0]) : null;
  }
  async listSubmissions(
    windowId: string,
    status?: SubmissionStatus
  ): Promise<Submission[]> {
    const r = await this.query(
      "SELECT * FROM submissions WHERE window_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY admission_sequence,id",
      [windowId, status ?? null]
    );
    return r.rows.map(submissionFromRow);
  }
  async withSubmission<T>(
    id: string,
    work: (
      r: InteractionRepository,
      s: Submission,
      w: InputWindow
    ) => Promise<T>
  ): Promise<T> {
    return this.transaction(async (r) => {
      const s = requireValue(await r.getSubmission(id), "Submission");
      const w = requireValue(await r.getWindow(s.windowId, true), "Window");
      return work(
        r,
        requireValue(await r.getSubmission(id, true), "Submission"),
        w
      );
    });
  }
  /** Serializes retries before acquiring the window lock. Sequence and quota are allocated together. */
  async admit(input: SubmitIntentInput): Promise<Submission> {
    validateIntent(input);
    return this.transaction(async (r) => {
      await r.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `interaction-actor:${input.actorId}`,
      ]);
      const existing = await r.query(
        "SELECT * FROM submissions WHERE actor_id=$1 AND idempotency_key=$2",
        [input.actorId, input.idempotencyKey]
      );
      if (existing.rows[0]) {
        const s = submissionFromRow(existing.rows[0]);
        if (
          s.windowId !== input.windowId ||
          s.kind !== input.kind ||
          canonical(s.payload) !== canonical(input.payload) ||
          canonical(s.targetEntityIds) !==
            canonical(input.targetEntityIds ?? []) ||
          canonical(s.appMetadata) !== canonical(input.appMetadata ?? {}) ||
          (input.baseCommitHash !== undefined &&
            input.baseCommitHash !== s.baseCommitHash)
        )
          throw new InteractionError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was used for a different intent"
          );
        return s;
      }
      const w = requireValue(await r.getWindow(input.windowId, true), "Window");
      const now = await r.now();
      if (
        w.state !== "open" ||
        Date.parse(w.opensAt) > now ||
        (w.closesAt !== null && Date.parse(w.closesAt) <= now)
      )
        throw new InteractionError("WINDOW_CLOSED", "Window is not open");
      if (!w.allowedInputKinds.includes(input.kind))
        throw new InteractionError("INVALID_INPUT", "Input kind not allowed");
      if (
        input.baseCommitHash !== undefined &&
        input.baseCommitHash !== w.baseCommitHash
      )
        throw new InteractionError(
          "STALE_BASE",
          "Submission base commit is stale"
        );
      const count = await r.query(
        "SELECT count(*)::int AS n FROM submissions WHERE window_id=$1 AND actor_id=$2 AND status IN ('received','moderating','awaiting_entitlement','eligible','selected','executing')",
        [w.id, input.actorId]
      );
      if (count.rows[0].n >= w.maxSubmissionsPerUser)
        throw new InteractionError(
          "QUOTA_EXCEEDED",
          "Max submissions per user exceeded"
        );
      if (w.billingPolicy === "pay_for_guaranteed_slot") {
        const used = await r.query(
          "SELECT count(*)::int AS n FROM submissions WHERE window_id=$1 AND status IN ('received','moderating','awaiting_entitlement','eligible','selected','executing')",
          [w.id]
        );
        if (used.rows[0].n >= w.maxSelectedInputs)
          throw new InteractionError(
            "CAPACITY_EXCEEDED",
            "Guaranteed slots are full"
          );
      }
      const sequence = (
        await r.query(
          "UPDATE input_windows SET admission_sequence=admission_sequence+1 WHERE id=$1 RETURNING admission_sequence",
          [w.id]
        )
      ).rows[0].admission_sequence;
      const result = await r.query(
        `INSERT INTO submissions(id,window_id,actor_id,idempotency_key,kind,target_entity_ids,base_commit_hash,payload,status,admitted_at,admission_sequence,app_metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'received',clock_timestamp(),$9,$10) RETURNING *`,
        [
          randomUUID(),
          w.id,
          input.actorId,
          input.idempotencyKey,
          input.kind,
          JSON.stringify(input.targetEntityIds ?? []),
          w.baseCommitHash,
          JSON.stringify(input.payload),
          sequence,
          JSON.stringify(input.appMetadata ?? {}),
        ]
      );
      const s = submissionFromRow(result.rows[0]);
      await r.emit(w, "submission_created", {
        submissionId: s.id,
        status: s.status,
      });
      return s;
    });
  }
  async saveSubmission(
    s: Submission,
    status: SubmissionStatus
  ): Promise<Submission> {
    const result = await this.query(
      "UPDATE submissions SET status=$2, moderation_decision_id=$3, entitlement_id=$4, updated_at=now() WHERE id=$1 RETURNING *",
      [s.id, status, s.moderationDecisionId ?? null, s.entitlementId ?? null]
    );
    const updated = submissionFromRow(
      requireValue(result.rows[0], "Submission")
    );
    if (s.status !== status) {
      const w = requireValue(await this.getWindow(s.windowId), "Window");
      await this.emit(w, "submission_status_changed", {
        submissionId: s.id,
        status,
        previousStatus: s.status,
      });
    }
    return updated;
  }
  async createModerationDecision(
    d: ModerationDecision,
    phase: "input" | "output" = "input"
  ): Promise<void> {
    await this.query(
      "INSERT INTO moderation_decisions(id,submission_id,status,reasons,policy_version,reviewed_by,created_at,phase) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        d.id,
        d.submissionId,
        d.status,
        JSON.stringify(d.reasons),
        d.policyVersion,
        d.reviewedBy,
        d.createdAt,
        phase,
      ]
    );
  }
  async getResolution(id: string): Promise<Resolution | null> {
    const r = await this.query("SELECT * FROM resolutions WHERE id=$1", [id]);
    return r.rows[0] ? resolutionFromRow(r.rows[0]) : null;
  }
  async findResolution(
    windowId: string,
    key: string,
    request: Record<string, unknown>
  ): Promise<Resolution | null> {
    const r = await this.query(
      "SELECT * FROM resolutions WHERE window_id=$1 AND idempotency_key=$2",
      [windowId, key]
    );
    if (!r.rows[0]) return null;
    if (canonical(r.rows[0].request) !== canonical(request))
      throw new InteractionError(
        "IDEMPOTENCY_CONFLICT",
        "Resolution key was used with different selection"
      );
    return resolutionFromRow(r.rows[0]);
  }
  async createResolution(
    value: Resolution,
    key: string,
    request: Record<string, unknown>
  ): Promise<Resolution> {
    const result = await this.query(
      `INSERT INTO resolutions(id,window_id,selected_submission_ids,rejected_submission_ids,arbitration_policy,policy_version,resolution_sequence,base_commit_hash,status,app_metadata,idempotency_key,request)
      VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(resolution_sequence),0)+1 FROM resolutions WHERE window_id=$2),$7,'selected',$8,$9,$10) RETURNING *`,
      [
        value.id,
        value.windowId,
        JSON.stringify(value.selectedSubmissionIds),
        JSON.stringify(value.rejectedSubmissionIds),
        value.arbitrationPolicy,
        value.policyVersion,
        value.baseCommitHash,
        JSON.stringify(value.appMetadata),
        key,
        JSON.stringify(request),
      ]
    );
    return resolutionFromRow(result.rows[0]);
  }
  async updateResolution(value: Resolution): Promise<void> {
    await this.query(
      "UPDATE resolutions SET status=$2,resulting_commit_hash=$3,model_execution_id=$4,updated_at=now() WHERE id=$1",
      [
        value.id,
        value.status,
        value.resultingCommitHash ?? null,
        value.modelExecutionId ?? null,
      ]
    );
  }
  async emit(
    w: InputWindow,
    eventType: string,
    data: Record<string, unknown>
  ): Promise<InteractionEvent> {
    return this.publishEvent({
      worldId: w.worldId,
      windowId: w.id,
      eventType,
      data,
      occurredAt: new Date(await this.now()).toISOString(),
    });
  }
  async publishEvent(event: NewInteractionEvent): Promise<InteractionEvent> {
    text(event.worldId, "worldId");
    text(event.eventType, "eventType");
    record(event.data, "event data");
    timestamp(event.occurredAt, "occurredAt");
    return this.transaction(async (r) => {
      await r.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `interaction-world:${event.worldId}`,
      ]);
      const sequence = (
        await r.query(
          `INSERT INTO interaction_event_sequences(world_id,sequence) VALUES($1,1)
        ON CONFLICT(world_id) DO UPDATE SET sequence=interaction_event_sequences.sequence+1 RETURNING sequence`,
          [event.worldId]
        )
      ).rows[0].sequence;
      const result = await r.query(
        "INSERT INTO interaction_outbox(id,world_id,window_id,event_type,sequence,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          randomUUID(),
          event.worldId,
          event.windowId ?? null,
          event.eventType,
          sequence,
          JSON.stringify(event.data),
          event.occurredAt,
        ]
      );
      return eventFromRow(result.rows[0]);
    });
  }
  async getEvents(
    worldId: string,
    afterSequence = 0,
    limit = 100
  ): Promise<InteractionEvent[]> {
    integer(afterSequence, "afterSequence", 0);
    integer(limit, "limit", 1, 1000);
    return (
      await this.query(
        "SELECT * FROM interaction_outbox WHERE world_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3",
        [worldId, afterSequence, limit]
      )
    ).rows.map(eventFromRow);
  }
  async eventHead(worldId: string): Promise<number> {
    return (
      (
        await this.query(
          "SELECT sequence FROM interaction_event_sequences WHERE world_id=$1",
          [worldId]
        )
      ).rows[0]?.sequence ?? 0
    );
  }
  async claimOutbox(
    limit = 100
  ): Promise<{ token: string; events: InteractionEvent[] }> {
    integer(limit, "limit", 1, 1000);
    const token = randomUUID();
    const r = await this.query(
      `UPDATE interaction_outbox SET claim_token=$1,claimed_until=clock_timestamp()+interval '30 seconds' WHERE id IN
      (SELECT id FROM interaction_outbox WHERE published_at IS NULL AND (claimed_until IS NULL OR claimed_until<clock_timestamp()) ORDER BY world_id,sequence LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING *`,
      [token, limit]
    );
    return {
      token,
      events: r.rows
        .map(eventFromRow)
        .sort(
          (a, b) =>
            a.worldId.localeCompare(b.worldId) || a.sequence - b.sequence
        ),
    };
  }
  async acknowledgeEvent(id: string, token: string): Promise<void> {
    await this.query(
      "UPDATE interaction_outbox SET published_at=clock_timestamp(),claimed_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2",
      [id, token]
    );
  }
  async releaseClaim(token: string): Promise<void> {
    await this.query(
      "UPDATE interaction_outbox SET claimed_until=NULL,claim_token=NULL WHERE claim_token=$1",
      [token]
    );
  }
}
