/**
 * Arbitration Engine - Resolves input contention using configurable policies.
 *
 * Deep module: small interface, deep implementation.
 * Policies are adapters that satisfy the ArbitrationPolicy interface.
 */
import type {
  ArbitrationPolicyName,
  InputWindow,
  Resolution,
  Submission,
} from "./types.js";

export interface ArbitrationPolicy {
  name: ArbitrationPolicyName;
  resolve(window: InputWindow, submissions: Submission[]): Resolution;
}

export interface IArbitrationEngine {
  resolve(window: InputWindow, submissions: Submission[]): Promise<Resolution>;
  registerPolicy(name: string, policy: ArbitrationPolicy): void;
  setPolicyConfig(policyName: string, config: Record<string, unknown>): void;
}

/**
 * Production-ready Arbitration Engine with FIFO policy.
 *
 * Deep implementation hidden behind small interface.
 * FIFO policy: select submissions in admission order, up to maxSelectedInputs.
 */
export class ArbitrationEngine implements IArbitrationEngine {
  private policies = new Map<string, ArbitrationPolicy>();
  private policyConfigs = new Map<string, Record<string, unknown>>();

  constructor() {
    // Register default policies
    this.registerPolicy("fifo", new FIFOPolicy());
  }

  async resolve(window: InputWindow, submissions: Submission[]): Promise<Resolution> {
    const policyName = window.arbitrationPolicy;
    const policy = this.policies.get(policyName);

    if (!policy) {
      throw new Error(`Arbitration policy not found: ${policyName}`);
    }

    const policyConfig = this.policyConfigs.get(policyName) ?? {};
    
    // Apply policy-specific configuration to window
    const windowWithConfig = {
      ...window,
      arbitrationPolicyConfig: { ...window.arbitrationPolicyConfig, ...policyConfig },
    };

    return policy.resolve(windowWithConfig, submissions);
  }

  registerPolicy(name: string, policy: ArbitrationPolicy): void {
    this.policies.set(name, policy);
  }

  setPolicyConfig(policyName: string, config: Record<string, unknown>): void {
    this.policyConfigs.set(policyName, config);
  }
}

/**
 * FIFO Arbitration Policy.
 *
 * Selects submissions in admission order, up to maxSelectedInputs.
 * Deep implementation hidden behind small interface.
 */
class FIFOPolicy implements ArbitrationPolicy {
  name: ArbitrationPolicyName = "fifo";

  resolve(window: InputWindow, submissions: Submission[]): Resolution {
    // Sort by admission sequence (FIFO)
    const sortedSubmissions = [...submissions].sort((a, b) => a.admissionSequence - b.admissionSequence);

    // Select up to maxSelectedInputs
    const maxSelected = window.maxSelectedInputs;
    const selectedSubmissions = sortedSubmissions.slice(0, maxSelected);
    const rejectedSubmissions = sortedSubmissions.slice(maxSelected);

    // Create resolution
    const resolution: Resolution = {
      id: `resolution_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      windowId: window.id,
      selectedSubmissionIds: selectedSubmissions.map((s) => s.id),
      rejectedSubmissionIds: rejectedSubmissions.map((s) => s.id),
      arbitrationPolicy: this.name,
      policyVersion: "1.0.0",
      resolutionSequence: Date.now(),
      baseCommitHash: window.baseCommitHash,
      status: "selected",
      // Map submissions to video provider interactions
      appMetadata: {
        videoProviderInteractions: selectedSubmissions.map((submission) => ({
          submissionId: submission.id,
          interaction: this.mapSubmissionToInteraction(submission),
        })),
      },
    };

    return resolution;
  }

  private mapSubmissionToInteraction(submission: Submission): {
    type: "prompt" | "command" | "mutation" | "vote" | "branch";
    payload: Record<string, unknown>;
  } {
    // Map submission kind to interaction type
    switch (submission.kind) {
      case "custom_prompt":
        return {
          type: "prompt",
          payload: {
            type: "prompt",
            prompt: submission.payload.prompt as string,
            params: submission.payload.params as Record<string, unknown> | undefined,
          },
        };
      case "world_action":
        return {
          type: "command",
          payload: {
            type: "command",
            command: submission.payload.action as string,
            params: submission.payload.params as Record<string, unknown>,
          },
        };
      case "entity_mutation":
        return {
          type: "mutation",
          payload: {
            type: "mutation",
            targetId: submission.targetEntityIds[0],
            params: submission.payload.params as Record<string, unknown>,
          },
        };
      case "vote":
        return {
          type: "vote",
          payload: {
            type: "vote",
            targetId: submission.payload.targetId as string,
            value: submission.payload.value as number,
          },
        };
      default:
        throw new Error(`Unsupported submission kind: ${submission.kind}`);
    }
  }
}

/**
 * Stub Arbitration Engine (for Phase 1 compatibility).
 *
 * Kept for backward compatibility during Phase 1 -> Phase 2 transition.
 * Extends ArbitrationEngine but throws errors (stub).
 */
export class StubArbitrationEngine extends ArbitrationEngine {
  async resolve(_window: InputWindow, _submissions: Submission[]): Promise<Resolution> {
    throw new Error("ArbitrationEngine.resolve not implemented - Phase 2");
  }

  registerPolicy(_name: string, _policy: ArbitrationPolicy): void {
    throw new Error("ArbitrationEngine.registerPolicy not implemented - Phase 2");
  }

  setPolicyConfig(_policyName: string, _config: Record<string, unknown>): void {
    throw new Error("ArbitrationEngine.setPolicyConfig not implemented - Phase 2");
  }
}
