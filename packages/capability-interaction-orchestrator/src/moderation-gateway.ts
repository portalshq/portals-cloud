/**
 * Moderation Gateway - Validates inputs and outputs with rating-based and pluggable validators.
 *
 * This is a stub implementation. Full implementation coming in Phase 2.
 */
import type {
  ContentRating,
  ModerationContext,
  ModerationDecision,
  Submission,
} from "./types.js";

export interface ModerationValidator {
  name: string;
  validate(input: Submission, context: ModerationContext): Promise<ModerationDecision>;
}

export interface ModerationGateway {
  moderateInput(input: Submission, context: ModerationContext): Promise<ModerationDecision>;
  moderateOutput(output: unknown, context: ModerationContext): Promise<ModerationDecision>;
  registerValidator(name: string, validator: ModerationValidator): void;
  setContentRating(rating: ContentRating): void;
}

export class StubModerationGateway implements ModerationGateway {
  async moderateInput(_input: Submission, _context: ModerationContext): Promise<ModerationDecision> {
    throw new Error("ModerationGateway.moderateInput not implemented - Phase 2");
  }

  async moderateOutput(_output: unknown, _context: ModerationContext): Promise<ModerationDecision> {
    throw new Error("ModerationGateway.moderateOutput not implemented - Phase 2");
  }

  registerValidator(_name: string, _validator: ModerationValidator): void {
    throw new Error("ModerationGateway.registerValidator not implemented - Phase 2");
  }

  setContentRating(_rating: ContentRating): void {
    throw new Error("ModerationGateway.setContentRating not implemented - Phase 2");
  }
}
