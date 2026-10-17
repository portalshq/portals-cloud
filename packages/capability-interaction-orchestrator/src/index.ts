/**
 * @portalshq/capability-interaction-orchestrator
 *
 * Reusable interaction orchestration for Portals: input windows, submission gateway,
 * arbitration engine, moderation gateway, billing controller, and event publisher.
 *
 * This is Phase 1 (Stub Package). Full implementation coming in Phase 2.
 *
 * ## Installation
 *
 * ```bash
 * npm install @portalshq/capability-interaction-orchestrator
 * ```
 *
 * ## Usage (Phase 1 - Stub)
 *
 * Currently this package provides TypeScript interfaces and stub implementations.
 * Stub implementations throw errors indicating they are not yet implemented.
 *
 * ```typescript
 * import {
 *   StubWindowManager,
 *   StubSubmissionGateway,
 *   StubArbitrationEngine,
 *   StubModerationGateway,
 *   StubBillingController,
 *   StubEventPublisher,
 *   type InputWindow,
 *   type Submission,
 *   type Resolution,
 * } from "@portalshq/capability-interaction-orchestrator";
 *
 * const windowManager = new StubWindowManager();
 * // windowManager.createWindow(...) will throw "not implemented - Phase 2"
 * ```
 *
 * ## Phase 2 Implementation
 *
 * Phase 2 will provide production-ready implementations of:
 * - Window Manager (in-process window closer)
 * - Submission Gateway (validation, idempotency, admission)
 * - Arbitration Engine (FIFO policy)
 * - Moderation Gateway (E-rated, rule-based)
 * - Billing Controller (monetization integration)
 * - Event Publisher (fanout-postgres integration)
 *
 * ## Phase 3 Implementation
 *
 * Phase 3 will add:
 * - All 7 arbitration policies
 * - T, T+, M rating validators
 * - Pluggable moderation interface
 * - Advanced billing policies
 * - Complete documentation and examples
 */

// Export all types
export * from "./types.js";

// Export stub implementations
export { StubWindowManager, type WindowManager } from "./window-manager.js";
export { StubSubmissionGateway, type SubmissionGateway } from "./submission-gateway.js";
export { StubArbitrationEngine, type ArbitrationEngine, type ArbitrationPolicy } from "./arbitration-engine.js";
export { StubModerationGateway, type ModerationGateway, type ModerationValidator } from "./moderation-gateway.js";
export { StubBillingController, type BillingController } from "./billing-controller.js";
export { StubEventPublisher, type EventPublisher } from "./event-publisher.js";
