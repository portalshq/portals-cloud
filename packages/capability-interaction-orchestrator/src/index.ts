/**
 * @portalshq/capability-interaction-orchestrator
 *
 * Reusable interaction orchestration for Portals: input windows, submission gateway,
 * arbitration engine, moderation gateway, billing controller, and event publisher.
 *
 * This is Phase 1 (Stub Package) with Phase 2 partial implementation (Arbitration Engine + Execution Bridge).
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
 * ## Phase 2 Implementation (Partial)
 *
 * Phase 2 provides production-ready implementations of:
 * - Arbitration Engine (FIFO policy) - DONE
 * - Execution Bridge (connects to Video Provider) - DONE
 * - Window Manager (in-process window closer) - TODO
 * - Submission Gateway (validation, idempotency, admission) - TODO
 * - Moderation Gateway (E-rated, rule-based) - TODO
 * - Billing Controller (monetization integration) - TODO
 * - Event Publisher (fanout-postgres integration) - TODO
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
export { 
  ArbitrationEngine, 
  StubArbitrationEngine, 
  type IArbitrationEngine, 
  type ArbitrationPolicy 
} from "./arbitration-engine.js";
export { StubModerationGateway, type ModerationGateway, type ModerationValidator } from "./moderation-gateway.js";
export { StubBillingController, type BillingController } from "./billing-controller.js";
export { StubEventPublisher, type EventPublisher } from "./event-publisher.js";

// Export Execution Bridge (Phase 2 - production-ready)
export { 
  ExecutionBridge, 
  createExecutionBridge, 
  type IExecutionBridge, 
  type ExecutionBridgeConfig,
  type IVideoProvider,
  type VideoInteraction,
} from "./execution-bridge.js";
