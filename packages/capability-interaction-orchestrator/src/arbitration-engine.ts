import type {
  ArbitrationPolicyName,
  InputWindow,
  Resolution,
  Submission,
} from "./types.js";
import {
  BatchPolicy,
  FIFOPolicy,
  FirstAcceptedPolicy,
  HostSelectionPolicy,
  ParallelBranchesPolicy,
  PluralityPolicy,
  RankedPolicy,
} from "./policies/index.js";
import {
  integer,
  InteractionError,
  policyName,
  record,
  text,
} from "./validation.js";

export interface ArbitrationPolicy {
  readonly name: ArbitrationPolicyName;
  resolve(window: InputWindow, submissions: Submission[]): Resolution;
}
export interface IArbitrationEngine {
  resolve(window: InputWindow, submissions: Submission[]): Promise<Resolution>;
  registerPolicy(name: string, policy: ArbitrationPolicy): void;
  setPolicyConfig(policyName: string, config: Record<string, unknown>): void;
}
/** Pure selection. Persistence and monotonic resolution sequences belong to the orchestrator. */
export class ArbitrationEngine implements IArbitrationEngine {
  private readonly policies = new Map<string, ArbitrationPolicy>();
  private readonly configs = new Map<string, Record<string, unknown>>();
  constructor() {
    for (const policy of [
      new FIFOPolicy(),
      new FirstAcceptedPolicy(),
      new PluralityPolicy(),
      new RankedPolicy(),
      new BatchPolicy(),
      new ParallelBranchesPolicy(),
      new HostSelectionPolicy(),
    ])
      this.registerPolicy(policy.name, policy);
  }
  registerPolicy(name: string, policy: ArbitrationPolicy): void {
    policyName(name);
    if (name !== policy.name || typeof policy.resolve !== "function")
      throw new InteractionError(
        "INVALID_INPUT",
        "Policy registration name must match policy.name"
      );
    this.policies.set(name, policy);
  }
  setPolicyConfig(name: string, config: Record<string, unknown>): void {
    if (!this.policies.has(name))
      throw new InteractionError(
        "INVALID_INPUT",
        `Unknown arbitration policy: ${name}`
      );
    record(config, "policy config");
    this.configs.set(name, structuredClone(config));
  }
  async resolve(
    window: InputWindow,
    submissions: Submission[]
  ): Promise<Resolution> {
    const policy = this.policies.get(window.arbitrationPolicy);
    if (!policy)
      throw new InteractionError(
        "INVALID_INPUT",
        `Unknown arbitration policy: ${window.arbitrationPolicy}`
      );
    integer(window.maxSelectedInputs, "maxSelectedInputs");
    if (
      new Set(submissions.map((s) => s.id)).size !== submissions.length ||
      submissions.some(
        (s) =>
          s.windowId !== window.id ||
          s.status !== "eligible" ||
          !Number.isSafeInteger(s.admissionSequence) ||
          s.admissionSequence < 1
      )
    )
      throw new InteractionError(
        "INVALID_INPUT",
        "Arbitration requires distinct eligible submissions from this window"
      );
    const effective = {
      ...window,
      arbitrationPolicyConfig: {
        ...this.configs.get(policy.name),
        ...window.arbitrationPolicyConfig,
      },
    };
    const resolution = policy.resolve(
      structuredClone(effective),
      structuredClone(submissions)
    );
    text(resolution.id, "resolution id");
    text(resolution.policyVersion, "policyVersion");
    record(resolution.appMetadata, "resolution metadata");
    const selected = resolution.selectedSubmissionIds;
    const rejected = resolution.rejectedSubmissionIds;
    const all = [...selected, ...rejected];
    if (
      resolution.windowId !== window.id ||
      resolution.baseCommitHash !== window.baseCommitHash ||
      resolution.arbitrationPolicy !== window.arbitrationPolicy ||
      resolution.status !== "selected" ||
      selected.length > window.maxSelectedInputs ||
      all.length !== submissions.length ||
      new Set(all).size !== all.length ||
      all.some((id) => !submissions.some((s) => s.id === id))
    )
      throw new InteractionError(
        "INVALID_POLICY_RESULT",
        "Policy must partition submissions exactly once within capacity"
      );
    return resolution;
  }
}
