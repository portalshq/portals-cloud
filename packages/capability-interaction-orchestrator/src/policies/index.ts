import { randomUUID } from "node:crypto";
import type { ArbitrationPolicy } from "../arbitration-engine.js";
import type {
  ArbitrationPolicyName,
  InputWindow,
  Resolution,
  Submission,
} from "../types.js";
import { canonical, InteractionError, record } from "../validation.js";

export const admissionOrder = (a: Submission, b: Submission): number =>
  a.admissionSequence - b.admissionSequence ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function interactionFor(
  s: Submission
): NonNullable<Resolution["videoProviderInteraction"]> {
  switch (s.kind) {
    case "custom_prompt":
      return { type: "prompt", payload: { ...s.payload, type: "prompt" } };
    case "message":
      return {
        type: "prompt",
        payload: { ...s.payload, type: "prompt", prompt: s.payload.message },
      };
    case "world_action":
      return {
        type: "command",
        payload: {
          ...s.payload,
          type: "command",
          command: s.payload.action,
          params: s.payload.params ?? {},
        },
      };
    case "entity_mutation":
      return {
        type: "mutation",
        payload: {
          ...s.payload,
          type: "mutation",
          targetId: s.targetEntityIds[0],
          targetEntityIds: s.targetEntityIds,
        },
      };
    case "vote":
      return {
        type: "vote",
        payload: {
          ...s.payload,
          type: "vote",
          targetId: s.payload.targetId ?? s.payload.option,
          value: s.payload.value ?? 1,
        },
      };
    case "create_object":
      return {
        type: "mutation",
        payload: {
          type: "mutation",
          targetId: s.id,
          params: { operation: "create_object", object: s.payload.object },
        },
      };
    case "create_branch":
      return {
        type: "branch",
        payload: {
          type: "branch",
          branchId: `interaction/${s.id}`,
          params: { ...s.payload, baseCommitHash: s.baseCommitHash },
        },
      };
  }
}
function result(
  name: ArbitrationPolicyName,
  w: InputWindow,
  all: Submission[],
  selected: Submission[]
): Resolution {
  const id = randomUUID();
  const ids = new Set(selected.map((s) => s.id));
  return {
    id,
    windowId: w.id,
    selectedSubmissionIds: selected.map((s) => s.id),
    rejectedSubmissionIds: all.filter((s) => !ids.has(s.id)).map((s) => s.id),
    arbitrationPolicy: name,
    policyVersion: "1.0.0",
    resolutionSequence: 0,
    baseCommitHash: w.baseCommitHash,
    status: "selected",
    appMetadata: {
      videoProviderInteractions: selected.map((s) => ({
        submissionId: s.id,
        interaction: interactionFor(s),
        ...(name === "parallel_branches"
          ? { branchId: `${w.branchId}/${id}/${s.id}` }
          : {}),
      })),
    },
  };
}
export class FIFOPolicy implements ArbitrationPolicy {
  readonly name = "fifo";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const ordered = [...s].sort(admissionOrder);
    return result(this.name, w, ordered, ordered.slice(0, w.maxSelectedInputs));
  }
}
export class FirstAcceptedPolicy implements ArbitrationPolicy {
  readonly name = "first_accepted";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const ordered = [...s].sort(admissionOrder);
    return result(this.name, w, ordered, ordered.slice(0, 1));
  }
}
export class PluralityPolicy implements ArbitrationPolicy {
  readonly name = "plurality";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const groups = new Map<string, Submission[]>();
    // One vote per actor per target. Multiple retries or spam cannot inflate a target's count.
    for (const submission of [...s].sort(admissionOrder)) {
      const target = submission.payload.option ?? submission.payload.targetId;
      if (
        submission.kind !== "vote" ||
        typeof target !== "string" ||
        !target.trim()
      )
        throw new InteractionError(
          "INVALID_INPUT",
          "Plurality requires votes with option or targetId"
        );
      const key = canonical(target);
      const group = groups.get(key) ?? [];
      if (!group.some((v) => v.actorId === submission.actorId))
        group.push(submission);
      groups.set(key, group);
    }
    const ordered = [...groups.values()].sort(
      (a, b) => b.length - a.length || admissionOrder(a[0], b[0])
    );
    const resolution = result(
      this.name,
      w,
      [...s].sort(admissionOrder),
      ordered.slice(0, w.maxSelectedInputs).map((g) => g[0])
    );
    resolution.appMetadata.voteCounts = ordered.map((g) => ({
      submissionId: g[0].id,
      votes: g.length,
    }));
    return resolution;
  }
}
export class RankedPolicy implements ArbitrationPolicy {
  readonly name = "ranked";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const priorities = w.arbitrationPolicyConfig.priorities ?? {};
    record(priorities, "priorities");
    for (const value of Object.values(priorities))
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new InteractionError(
          "INVALID_INPUT",
          "Priorities must be finite numbers"
        );
    const ordered = [...s].sort(
      (a, b) =>
        Number(priorities[b.id] ?? 0) - Number(priorities[a.id] ?? 0) ||
        admissionOrder(a, b)
    );
    return result(this.name, w, ordered, ordered.slice(0, w.maxSelectedInputs));
  }
}
export class BatchPolicy implements ArbitrationPolicy {
  readonly name = "batch";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const targets = new Set<string>();
    const selected: Submission[] = [];
    const ordered = [...s].sort(admissionOrder);
    for (const submission of ordered) {
      if (
        selected.length === w.maxSelectedInputs ||
        submission.targetEntityIds.some((id) => targets.has(id))
      )
        continue;
      selected.push(submission);
      for (const id of submission.targetEntityIds) targets.add(id);
    }
    return result(this.name, w, ordered, selected);
  }
}
export class ParallelBranchesPolicy implements ArbitrationPolicy {
  readonly name = "parallel_branches";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const ordered = [...s].sort(admissionOrder);
    return result(this.name, w, ordered, ordered.slice(0, w.maxSelectedInputs));
  }
}
export class HostSelectionPolicy implements ArbitrationPolicy {
  readonly name = "host_selection";
  resolve(w: InputWindow, s: Submission[]): Resolution {
    const ids = w.arbitrationPolicyConfig.selectedSubmissionIds;
    if (!Array.isArray(ids))
      throw new InteractionError(
        "HOST_SELECTION_REQUIRED",
        "Host must supply selectedSubmissionIds"
      );
    if (
      ids.length > w.maxSelectedInputs ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string" || !s.some((v) => v.id === id))
    )
      throw new InteractionError("INVALID_INPUT", "Invalid host selection");
    return result(
      this.name,
      w,
      [...s].sort(admissionOrder),
      ids.map((id) => s.find((v) => v.id === id)!)
    );
  }
}
