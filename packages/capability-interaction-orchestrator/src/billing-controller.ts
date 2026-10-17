/**
 * Billing Controller - Integrates with @portalshq/monetization for billing operations.
 *
 * This is a stub implementation. Full implementation coming in Phase 2.
 */
import type {
  EntitlementReservation,
  InputWindow,
  PriceQuote,
  Resolution,
  Submission,
} from "./types.js";

export interface BillingController {
  quote(window: InputWindow, actorId: string): Promise<PriceQuote>;
  authorize(submission: Submission): Promise<EntitlementReservation>;
  capture(resolution: Resolution): Promise<void>;
  cancel(submission: Submission): Promise<void>;
  refund(submission: Submission, reason: string): Promise<void>;
}

export class StubBillingController implements BillingController {
  async quote(_window: any, _actorId: string): Promise<PriceQuote> {
    throw new Error("BillingController.quote not implemented - Phase 2");
  }

  async authorize(_submission: Submission): Promise<EntitlementReservation> {
    throw new Error("BillingController.authorize not implemented - Phase 2");
  }

  async capture(_resolution: Resolution): Promise<void> {
    throw new Error("BillingController.capture not implemented - Phase 2");
  }

  async cancel(_submission: Submission): Promise<void> {
    throw new Error("BillingController.cancel not implemented - Phase 2");
  }

  async refund(_submission: Submission, _reason: string): Promise<void> {
    throw new Error("BillingController.refund not implemented - Phase 2");
  }
}
