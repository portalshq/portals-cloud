/**
 * Arbitration Engine - Resolves input contention using configurable policies.
 *
 * This is a stub implementation. Full implementation coming in Phase 2.
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

export interface ArbitrationEngine {
  resolve(window: InputWindow, submissions: Submission[]): Promise<Resolution>;
  registerPolicy(name: string, policy: ArbitrationPolicy): void;
  setPolicyConfig(policyName: string, config: Record<string, unknown>): void;
}

export class StubArbitrationEngine implements ArbitrationEngine {
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
