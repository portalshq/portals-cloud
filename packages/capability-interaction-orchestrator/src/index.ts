/** Durable interaction lifecycle, credit-backed billing, moderation and event replay. */
export * from "./types.js";
export { InteractionError } from "./validation.js";
export {
  InteractionRepository,
  type NewInteractionEvent,
} from "./db/repository.js";
export {
  InteractionOrchestrator,
  type OrchestratorOptions,
} from "./orchestrator.js";
export { WindowManager, type IWindowManager } from "./window-manager.js";
export {
  SubmissionGateway,
  type ISubmissionGateway,
} from "./submission-gateway.js";
export {
  ArbitrationEngine,
  type IArbitrationEngine,
  type ArbitrationPolicy,
} from "./arbitration-engine.js";
export * from "./policies/index.js";
export {
  ModerationGateway,
  type IModerationGateway,
  type ModerationValidator,
  type CustomValidator,
  type ModerationOptions,
} from "./moderation-gateway.js";
export {
  BillingController,
  type IBillingController,
} from "./billing-controller.js";
export {
  EventPublisher,
  type IEventPublisher,
  type InteractionFanout,
} from "./event-publisher.js";
export {
  ExecutionBridge,
  createExecutionBridge,
  type IExecutionBridge,
  type ExecutionBridgeConfig,
  type IVideoProvider,
  type VideoInteraction,
} from "./execution-bridge.js";

export { weightedChoices, type WeightedCandidate } from "./weighted-choice.js";

export { parseChoiceSettings, type ChoiceSettings } from "./interactions-config.js";

export { resolveCollectiveChoice, type ChoiceOption, type ChoiceBallot } from "./collective-choice.js";

export { parseInteractionSettings, type InteractionSettings, type FeedbackSettings } from "./interactions-config.js";

export { validateRegistryInteractions, type ChannelInteractionSettings } from "./registry-validation.js";

export { ExternalBilling, usesExternalDebit, type ExternalBillingOptions } from "./external-billing.js";

export { NarrativeHandoffQueue, type NarrativeHandoff } from "./narrative-handoff.js";

export {
  ChoiceCoordinator,
  validateChoiceOptions,
  validateChoiceProposal,
  type ChoiceOptionDescriptor,
  type OpenChoiceInput,
  type ChoiceResolutionResult,
} from "./choice.js";

export { GuideQueue, type EnsureGuideWindowInput } from "./guide-queue.js";

export { FeedbackCoordinator, type OpenFeedbackInput, type FeedbackReward } from "./feedback.js";

export { ReactionGateway, REACTION_EMOTIONS, type Reaction, type ReactionEmotion, type RecordReactionInput } from "./reactions.js";

export { noopMetrics, type InteractionMetrics } from "./metrics.js";
