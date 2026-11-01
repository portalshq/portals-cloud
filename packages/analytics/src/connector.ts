import type { Attribution, Observation, Sink } from './index.js';
import { mapBillingEvent } from './adapters/monetization.js';
import { mapInteractionEvent } from './adapters/interaction-orchestrator.js';
import { SegmentDeliveryError } from './adapters/segment.js';
import { runMigrations, validateSourceSchema, type SourceKind } from './migrations.js';

export interface ConnectorDatabase { query(sql: string, params?: unknown[]): Promise<{rows: Record<string, unknown>[]}> }

/** Safe classifications persisted on the ledger. Record contents and vendor
 *  responses are never stored; the optional error callback receives detail. */
export type FailureCategory =
  | 'transient'           // network, timeout, 5xx — retryable
  | 'rate_limited'        // 429 — retryable with backoff
  | 'missing_identity'    // no verified person identity — blocked until a resolver is configured
  | 'invalid_attribution' // unauthorized or unresolvable tenant/world — blocked
  | 'malformed'           // record failed validation — dead
  | 'missing_source'      // retained ledger entry whose source row vanished — dead
  | 'rejected'            // sink permanently rejected the event — dead
  | 'retry_exhausted';    // attempts budget spent — dead

export type DeliveryState = 'pending' | 'delivered' | 'excluded' | 'blocked' | 'dead';
export type SourceAvailability = 'enabled' | 'disabled' | 'unavailable';

export interface ConnectorOptions {
  db: ConnectorDatabase;
  sink: Sink;
  destination: string;
  appId: string;
  /** Required UTC launch cutoff. Only records inserted at or after this time
   *  are introduced to analytics; earlier history requires the explicit
   *  operator backfill path. */
  startAt: string;
  /** Authorize world ownership and return the tenant for an interaction.
   *  Both resolvers together enable the interaction source. */
  resolveWorld?: (worldId: string) => Promise<string | undefined>;
  /** Resolve only from trusted source records; never derive an actor from
   *  browser input. Required together with resolveWorld for interaction delivery. */
  resolveInteractionIdentity?: (record: Readonly<Record<string, unknown>>) => Promise<{userId: string} | undefined>;
  /** Verify that a billing or resolved interaction tenant is in scope. */
  authorizeTenant: (tenantId: string) => Promise<boolean>;
  /** Maximum records processed per drain pass. */
  batchSize?: number;
  intervalMs?: number;
  /** Records claimed per short transaction. */
  claimBatchSize?: number;
  /** Claim lease; must cover claimBatchSize serial sends (see requestTimeoutMs). */
  claimLeaseMs?: number;
  /** Worst-case time one sink send may take; bounds claim lease sizing and the
   *  pre-send lease check so serial vendor calls cannot outlive their claims. */
  requestTimeoutMs?: number;
  /** Retryable attempts before a record is dead-lettered. */
  maxAttempts?: number;
  /** How far behind the discovery watermark to rescan for late commits. */
  discoveryOverlapMs?: number;
  /** Owner recorded on claimed rows; defaults to a per-instance random ID. */
  workerId?: string;
  /** Optional observation hook. Errors thrown here can never interrupt ledger updates. */
  onError?: (error: unknown, context: {kind: SourceKind; sourceId: string; category: FailureCategory}) => void;
}

interface ClaimedRow { kind: SourceKind; source_id: string; }

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value);
const utcTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && /T/.test(value) && Number.isFinite(Date.parse(value));

export class AnalyticsConnector {
  private readonly batchSize: number;
  private readonly intervalMs: number;
  private readonly claimBatchSize: number;
  private readonly claimLeaseMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly discoveryOverlapMs: number;
  private readonly workerId: string;
  private readonly interactionsEnabled: boolean;
  private readonly startAtMs: number;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private ready = false;
  private lastSuccess?: string;
  private lastFailure?: FailureCategory;

  constructor(private readonly options: ConnectorOptions) {
    this.batchSize = options.batchSize ?? 100;
    this.intervalMs = options.intervalMs ?? 5000;
    this.claimBatchSize = options.claimBatchSize ?? 10;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.claimLeaseMs = options.claimLeaseMs ?? this.claimBatchSize * this.requestTimeoutMs + 30_000;
    this.maxAttempts = options.maxAttempts ?? 10;
    this.discoveryOverlapMs = options.discoveryOverlapMs ?? 3_600_000;
    this.workerId = options.workerId ?? `worker-${crypto.randomUUID()}`;
    if (!identifier(options.destination) || !identifier(options.appId)) throw new Error('Invalid connector destination or app ID');
    if (!utcTimestamp(options.startAt)) throw new Error('ANALYTICS_START_AT must be a valid UTC timestamp');
    this.startAtMs = Date.parse(options.startAt);
    for (const [name, value, min, max] of [
      ['batchSize', this.batchSize, 1, 500],
      ['intervalMs', this.intervalMs, 1000, 3_600_000],
      ['claimBatchSize', this.claimBatchSize, 1, 100],
      ['requestTimeoutMs', this.requestTimeoutMs, 1000, 120_000],
      ['claimLeaseMs', this.claimLeaseMs, 1000, 3_600_000],
      ['maxAttempts', this.maxAttempts, 1, 100],
      ['discoveryOverlapMs', this.discoveryOverlapMs, 0, 86_400_000],
    ] as const) {
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid connector ${name}`);
    }
    if (this.claimLeaseMs < this.claimBatchSize * this.requestTimeoutMs) {
      throw new Error('claimLeaseMs must cover claimBatchSize serial sends of requestTimeoutMs each');
    }
    const hasWorld = typeof options.resolveWorld === 'function';
    const hasIdentity = typeof options.resolveInteractionIdentity === 'function';
    if (hasWorld !== hasIdentity) {
      throw new Error('Interaction delivery requires both resolveWorld and resolveInteractionIdentity');
    }
    this.interactionsEnabled = hasWorld;
  }

  /** Applies package migrations. Idempotent and concurrency-safe. */
  async migrate(): Promise<void> {
    await runMigrations(this.options.db);
  }

  /** Validates package migrations and required business source schemas. */
  private async ensureReady(): Promise<void> {
    if (this.ready) return;
    await this.migrate();
    const kinds: SourceKind[] = this.interactionsEnabled ? ['billing', 'interaction'] : ['billing'];
    await validateSourceSchema(this.options.db, kinds);
    this.ready = true;
  }

  /** Bounded discovery: introduces only records inserted at/after startAt,
   *  rescanning a bounded overlap behind the watermark to catch late commits.
   *  Source rows are never modified. */
  private async discover(kind: SourceKind): Promise<void> {
    const {db, destination} = this.options;
    const table = kind === 'billing' ? 'monetization_outbox' : 'interaction_outbox';
    const overlapSeconds = Math.ceil(this.discoveryOverlapMs / 1000);
    const {rows} = await db.query(
      `SELECT s.id, s.created_at FROM ${table} s
       WHERE s.created_at >= GREATEST($1::timestamptz,
         COALESCE((SELECT d0.through FROM portals_analytics_discovery d0 WHERE d0.destination=$2 AND d0.kind=$3), $1::timestamptz)
           - make_interval(secs => $4::int))
         AND NOT EXISTS (SELECT 1 FROM portals_analytics_delivery d
           WHERE d.destination=$2 AND d.kind=$3 AND d.source_id=s.id)
       ORDER BY s.created_at, s.id LIMIT $5`,
      [this.options.startAt, destination, kind, overlapSeconds, this.batchSize]);
    if (!rows.length) return;
    const insert = `INSERT INTO portals_analytics_delivery(destination,kind,source_id)
      VALUES ($1,$2,$3) ON CONFLICT (destination,kind,source_id) DO NOTHING`;
    let through = '';
    for (const row of rows) {
      await db.query(insert, [destination, kind, String(row.id)]);
      through = isoTimestamp(row.created_at);
    }
    await db.query(
      `INSERT INTO portals_analytics_discovery(destination,kind,through) VALUES ($1,$2,$3::timestamptz)
       ON CONFLICT (destination,kind) DO UPDATE
         SET through=GREATEST(portals_analytics_discovery.through, EXCLUDED.through), updated_at=now()`,
      [destination, kind, through]);
  }

  /** Claims a bounded batch in a short transaction with an expiring lease. */
  private async claimBatch(token: string): Promise<ClaimedRow[]> {
    const {db, destination} = this.options;
    const leaseSeconds = Math.ceil(this.claimLeaseMs / 1000);
    const claimed = await db.query(
      `UPDATE portals_analytics_delivery SET claimed_by=$1, claim_token=$2,
         claimed_until=now()+make_interval(secs => $3::int), attempts=attempts+1, updated_at=now()
       WHERE (destination,kind,source_id) IN (
         SELECT destination,kind,source_id FROM portals_analytics_delivery
         WHERE destination=$4 AND state='pending' AND next_attempt_at<=now()
           AND (claimed_until IS NULL OR claimed_until<now())
         ORDER BY next_attempt_at,kind,source_id FOR UPDATE SKIP LOCKED LIMIT $5)
       RETURNING kind, source_id`,
      [this.workerId, token, leaseSeconds, destination, this.claimBatchSize]);
    return claimed.rows.map(row => ({kind: row.kind as SourceKind, source_id: String(row.source_id)}));
  }

  private async mark(kind: SourceKind, sourceId: string, token: string, state: DeliveryState, category: FailureCategory | null, retryInSeconds?: number): Promise<void> {
    await this.options.db.query(
      `UPDATE portals_analytics_delivery SET state=$1, claim_token=NULL, claimed_by=NULL, claimed_until=NULL,
         last_failure_category=$2, delivered_at=CASE WHEN $1='delivered' THEN now() ELSE delivered_at END,
         next_attempt_at=CASE WHEN $3::int IS NULL THEN next_attempt_at ELSE now()+make_interval(secs => $3::int) END,
         updated_at=now()
       WHERE destination=$4 AND kind=$5 AND source_id=$6 AND claim_token=$7`,
      [state, category, retryInSeconds ?? null, this.options.destination, kind, sourceId, token]);
  }

  private reportError(error: unknown, context: {kind: SourceKind; sourceId: string; category: FailureCategory}): void {
    try { this.options.onError?.(error, context); } catch { /* Optional callbacks cannot interrupt delivery. */ }
  }

  private async processClaimed(row: ClaimedRow, token: string): Promise<'delivered' | 'excluded' | 'failed' | 'blocked' | 'dead'> {
    const {db, destination} = this.options;
    const kind = row.kind, id = row.source_id;
    try {
      const result = kind === 'billing'
        ? await db.query('SELECT id,type,payload,created_at FROM monetization_outbox WHERE id=$1', [id])
        : await db.query('SELECT id,world_id,event_type,payload,occurred_at,created_at FROM interaction_outbox WHERE id=$1', [id]);
      const source = result.rows[0];
      if (!source) {
        await this.mark(kind, id, token, 'dead', 'missing_source');
        this.lastFailure = 'missing_source';
        return 'dead';
      }
      const eventTime = new Date((kind === 'billing' ? source.created_at : source.occurred_at) as string);
      if (!Number.isFinite(eventTime.getTime())) {
        await this.mark(kind, id, token, 'dead', 'malformed');
        this.lastFailure = 'malformed';
        return 'dead';
      }
      let event: Observation | undefined, tenantId: string | undefined;
      if (kind === 'billing') {
        const payload = source.payload as Record<string, unknown>;
        try {
          event = mapBillingEvent({id, type: String(source.type), payload, createdAt: eventTime.toISOString()});
        } catch {
          await this.mark(kind, id, token, 'dead', 'malformed');
          this.lastFailure = 'malformed';
          return 'dead';
        }
        if (!event) {
          await this.mark(kind, id, token, 'excluded', null);
          return 'excluded';
        }
        tenantId = typeof payload?.tenantId === 'string' ? payload.tenantId : undefined;
      } else {
        try {
          event = mapInteractionEvent({id, eventType: String(source.event_type), data: source.payload as Record<string, unknown>, occurredAt: eventTime.toISOString()});
        } catch {
          await this.mark(kind, id, token, 'dead', 'malformed');
          this.lastFailure = 'malformed';
          return 'dead';
        }
        if (!event) {
          await this.mark(kind, id, token, 'excluded', null);
          return 'excluded';
        }
        tenantId = await this.options.resolveWorld!(String(source.world_id));
      }
      if (!tenantId || !identifier(tenantId) || !(await this.options.authorizeTenant(tenantId))) {
        await this.mark(kind, id, token, 'blocked', 'invalid_attribution');
        this.lastFailure = 'invalid_attribution';
        return 'blocked';
      }
      if (kind === 'interaction') {
        const identity = await this.options.resolveInteractionIdentity!({
          id, world_id: source.world_id, event_type: source.event_type, payload: source.payload, occurred_at: source.occurred_at, created_at: source.created_at,
        });
        if (identity) {
          if (!identifier(identity.userId)) {
            await this.mark(kind, id, token, 'dead', 'malformed');
            this.lastFailure = 'malformed';
            return 'dead';
          }
          event = {...event, identity};
        }
      }
      if (!event) {
        await this.mark(kind, id, token, 'excluded', null);
        return 'excluded';
      }
      if (!event.identity?.userId && !event.identity?.anonymousId) {
        await this.mark(kind, id, token, 'blocked', 'missing_identity');
        this.lastFailure = 'missing_identity';
        return 'blocked';
      }
      const messageId = `portals-analytics:${this.options.appId}:${tenantId}:${kind}:${id}`;
      const delivery: Observation = {
        ...event, id: messageId,
        properties: {...event.properties, portals_source_id: id, portals_source_kind: kind},
        attribution: {tenantId, appId: this.options.appId} satisfies Attribution,
      };
      await this.options.sink.send([delivery]);
      await this.mark(kind, id, token, 'delivered', null);
      return 'delivered';
    } catch (error) {
      const category = classifyError(error);
      this.lastFailure = category;
      this.reportError(error, {kind, sourceId: id, category});
      if (category === 'transient' || category === 'rate_limited') {
        const claimed = await db.query(
          'SELECT attempts FROM portals_analytics_delivery WHERE destination=$1 AND kind=$2 AND source_id=$3 AND claim_token=$4',
          [destination, kind, id, token]);
        const attempts = Number(claimed.rows[0]?.attempts ?? 0);
        if (attempts >= this.maxAttempts) {
          await this.mark(kind, id, token, 'dead', 'retry_exhausted');
          this.lastFailure = 'retry_exhausted';
          return 'dead';
        }
        const backoff = Math.min(3600, Math.pow(2, Math.min(attempts, 11)));
        await this.mark(kind, id, token, 'pending', category, backoff);
        return 'failed';
      }
      const state: DeliveryState = category === 'missing_identity' || category === 'invalid_attribution' ? 'blocked' : 'dead';
      await this.mark(kind, id, token, state, category);
      return state === 'blocked' ? 'blocked' : 'dead';
    }
  }

  /** One bounded drain pass: discover new source rows, then claim and process
   *  at most batchSize records. Returns state-transition counts. */
  async drainOnce(): Promise<{delivered: number; failed: number; excluded: number; blocked: number; dead: number}> {
    await this.ensureReady();
    const totals = {delivered: 0, failed: 0, excluded: 0, blocked: 0, dead: 0};
    const kinds: SourceKind[] = this.interactionsEnabled ? ['billing', 'interaction'] : ['billing'];
    for (const kind of kinds) await this.discover(kind);
    let processed = 0;
    while (processed < this.batchSize) {
      const token = crypto.randomUUID();
      const claimStarted = Date.now();
      const claimed = await this.claimBatch(token);
      if (!claimed.length) break;
      for (let index = 0; index < claimed.length; index++) {
        const fitsLease = claimStarted + this.claimLeaseMs - this.requestTimeoutMs > Date.now();
        if (index >= this.batchSize - processed || !fitsLease) {
          // Release every still-claimed row (processed rows already cleared
          // their token) so no serial send can outlive its lease.
          await this.releaseClaims(token);
          return this.finishDrain(totals);
        }
        const outcome = await this.processClaimed(claimed[index]!, token);
        processed++;
        totals[outcome === 'failed' ? 'failed' : outcome]++;
      }
    }
    return this.finishDrain(totals);
  }

  private async releaseClaims(token: string): Promise<void> {
    await this.options.db.query(
      `UPDATE portals_analytics_delivery SET claim_token=NULL, claimed_by=NULL, claimed_until=NULL, attempts=GREATEST(attempts-1,0), updated_at=now()
       WHERE destination=$1 AND claim_token=$2`,
      [this.options.destination, token]);
  }

  private async finishDrain(totals: {delivered: number; failed: number; excluded: number; blocked: number; dead: number}) {
    this.lastSuccess = new Date().toISOString();
    return totals;
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    try { await this.ensureReady(); } catch (error) { this.stopped = true; throw error; }
    const tick = () => {
      if (this.stopped) return;
      this.running = this.drainOnce()
        .then(() => {}, error => this.reportError(error, {kind: 'billing', sourceId: '', category: 'transient'}))
        .finally(() => {this.running = undefined; if (!this.stopped) this.timer = setTimeout(tick, this.intervalMs);});
    };
    tick();
  }

  async stop(): Promise<void> { this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.running; }

  /** Readiness and operator-visible delivery posture. */
  async status(): Promise<{
    running: boolean; ready: boolean;
    sources: Record<SourceKind, SourceAvailability>;
    lastSuccessfulDrain?: string; lastFailureCategory?: FailureCategory;
    counts: readonly Record<string, unknown>[]; oldestPendingAgeMs?: number;
  }> {
    let rows: Record<string, unknown>[] = [];
    let ageRaw = Number.NaN;
    if (this.ready) {
      const counts = await this.options.db.query(
        'SELECT kind,state,count(*)::int AS count FROM portals_analytics_delivery WHERE destination=$1 GROUP BY kind,state',
        [this.options.destination]);
      rows = counts.rows;
      const oldest = await this.options.db.query(
        "SELECT EXTRACT(EPOCH FROM (now()-min(created_at)))*1000 AS age_ms FROM portals_analytics_delivery WHERE destination=$1 AND state='pending'",
        [this.options.destination]);
      ageRaw = Number(oldest.rows[0]?.age_ms);
    }
    return {
      running: !this.stopped, ready: this.ready,
      sources: {
        billing: this.ready ? 'enabled' : 'unavailable',
        interaction: this.interactionsEnabled ? (this.ready ? 'enabled' : 'unavailable') : 'disabled',
      },
      lastSuccessfulDrain: this.lastSuccess, lastFailureCategory: this.lastFailure,
      counts: rows,
      ...(Number.isFinite(ageRaw) ? {oldestPendingAgeMs: Math.max(0, ageRaw)} : {}),
    };
  }

  /** Operator retry: resets eligible failed records only. Delivered and
   *  excluded records are never touched. */
  async retryEligible(kind?: SourceKind): Promise<number> {
    const {rows} = await this.options.db.query(
      `UPDATE portals_analytics_delivery SET state='pending', attempts=0, next_attempt_at=now(),
         claim_token=NULL, claimed_by=NULL, claimed_until=NULL, updated_at=now()
       WHERE destination=$1 AND state IN ('blocked','dead')
         AND ($2::text IS NULL OR kind=$2)
         AND (claimed_until IS NULL OR claimed_until < now())
       RETURNING source_id`,
      [this.options.destination, kind ?? null]);
    return rows.length;
  }

  async retry(kind: SourceKind, sourceId: string): Promise<void> {
    await this.options.db.query(
      `UPDATE portals_analytics_delivery SET state='pending', attempts=0, next_attempt_at=now(),
         claim_token=NULL, claimed_by=NULL, claimed_until=NULL, updated_at=now()
       WHERE destination=$1 AND kind=$2 AND source_id=$3 AND state IN ('blocked','dead','pending')
         AND (claimed_until IS NULL OR claimed_until < now())`,
      [this.options.destination, kind, sourceId]);
  }
}

function classifyError(error: unknown): FailureCategory {
  if (error instanceof SegmentDeliveryError) {
    return error.options.category === 'rate_limited' ? 'rate_limited'
      : error.options.category === 'transient' ? 'transient' : 'rejected';
  }
  // Unknown sink failures are treated as retryable transport problems; a
  // permanently failing sink exhausts attempts into 'dead' rather than looping.
  return 'transient';
}

function isoTimestamp(value: unknown): string {
  const date = new Date(value as string);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid source timestamp');
  return date.toISOString();
}
