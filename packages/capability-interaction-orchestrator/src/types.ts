/**
 * Core types for the Interaction Orchestrator package.
 *
 * This package provides reusable infrastructure for managing user interactions
 * in AI-driven entertainment experiences, including input windows, submission
 * handling, arbitration, moderation, billing, and event publishing.
 */

/**
 * Content rating based on DC Comics rating system.
 *
 * E (Everyone): Appropriate for readers of all ages, potentially featuring cartoonish action.
 * T (Teen): Aimed at readers ages 12 and older, introducing mild violence, language, or suggestive dialogue.
 * T+ (Teen Plus): Designed for readers ages 15 and up, containing moderate profanity, graphic action sequences, or mature storylines.
 * M (Mature): Reserved for readers ages 17 and older, dealing with heavy sexual themes, nudity, extensive profanity, and graphic violence.
 */
export type ContentRating = "E" | "T" | "T+" | "M";

/**
 * Input window lifecycle states.
 *
 * scheduled: Window created, not yet accepting input
 * open: Eligible users can submit
 * qualifying: Intake stops; pending moderation and payment checks finish
 * resolving: Selection policy chooses the effective inputs
 * executing: Model generates proposed narrative and world changes
 * committing: Check outputs, apply authorized changes
 * published: Result visible; next input opportunity may open
 * failed: Window failed to complete
 * cancelled: Window was cancelled before completion
 */
export type WindowState =
  | "scheduled"
  | "open"
  | "qualifying"
  | "resolving"
  | "executing"
  | "committing"
  | "published"
  | "failed"
  | "cancelled";

/**
 * Types of user interactions/inputs.
 */
export type InputKind =
  | "vote"
  | "custom_prompt"
  | "entity_mutation"
  | "world_action"
  | "message"
  | "create_object"
  | "create_branch";

/**
 * Arbitration policies for resolving input contention.
 *
 * first_accepted: Earliest qualifying submission wins (exclusive actions)
 * fifo: Every qualifying input executes in order (paid story creation)
 * plurality: Most votes wins (game shows)
 * ranked: Rank by declared priority, then deterministic tie-break (featured submissions)
 * batch: Combine compatible inputs (live narrative twists)
 * parallel_branches: Every qualified input gets an independent result (remix galleries)
 * host_selection: Host manually selects (curated events)
 */
export type ArbitrationPolicyName =
  | "first_accepted"
  | "fifo"
  | "plurality"
  | "ranked"
  | "batch"
  | "parallel_branches"
  | "host_selection";

/**
 * Billing policies for interactions.
 *
 * free: No payment required
 * pay_to_generate: Payment before generation
 * pay_to_publish: Payment after valid preview, before publication
 * pay_for_guaranteed_slot: Payment for guaranteed submission/placement
 * capture_if_selected: Authorize payment, capture only if selected
 * prepaid_credits: Consume prepaid credits
 */
export type BillingPolicy =
  | "free"
  | "pay_to_generate"
  | "pay_to_publish"
  | "pay_for_guaranteed_slot"
  | "capture_if_selected"
  | "prepaid_credits";

/**
 * Submission lifecycle states.
 */
export type SubmissionStatus =
  | "received"
  | "moderating"
  | "awaiting_entitlement"
  | "eligible"
  | "rejected"
  | "selected"
  | "not_selected"
  | "executing"
  | "fulfilled"
  | "failed"
  | "refunded";

/**
 * Input Window - Defines when, where, and how an interaction may happen.
 *
 * An Input Window represents a time-bounded opportunity for user interaction.
 * Examples: a 20-second audience vote, an open-ended character edit, or a one-hour challenge round.
 *
 * For always-open interactions (like chat), set closesAt to null.
 */
export interface InputWindow {
  /** Unique identifier for the window */
  id: string;
  /** Version number for optimistic concurrency */
  revision: number;

  /** World/channel identifier */
  worldId: string;
  /** Branch identifier for versioned worlds */
  branchId: string;
  /** Base commit hash for conflict detection */
  baseCommitHash: string;
  /** Conflict key for contention scoping (entity, branch, or session) */
  conflictKey: string;

  /** Current lifecycle state */
  state: WindowState;

  /** Allowed input types for this window */
  allowedInputKinds: InputKind[];
  /** Arbitration policy for resolving contention */
  arbitrationPolicy: ArbitrationPolicyName;
  /** Policy-specific configuration */
  arbitrationPolicyConfig: Record<string, unknown>;
  /** Billing policy for this window */
  billingPolicy: BillingPolicy;

  /** Maximum submissions per user */
  maxSubmissionsPerUser: number;
  /** Maximum inputs to select for execution */
  maxSelectedInputs: number;

  /** When the window opens (ISO timestamp) */
  opensAt: string;
  /** When the window closes (ISO timestamp), or null for always-open */
  closesAt: string | null;

  /** Content rating for moderation */
  contentRating: ContentRating;
  /** Moderation policy version */
  moderationPolicyVersion: string;
  /** Ruleset version for world validation */
  rulesetVersion: string;
  /** Price quote ID from billing system */
  priceQuoteId?: string;

  /** App-specific metadata (JSONB extension) */
  appMetadata: Record<string, unknown>;
}

/**
 * Submission - Records what the user wants, eligibility, moderation, payment.
 *
 * A Submission is a user's proposed action against a specific target.
 * Multiple submissions may compete for selection via arbitration.
 */
export interface Submission {
  /** Unique identifier for the submission */
  id: string;
  /** Window this submission belongs to */
  windowId: string;
  /** User/app identifier */
  actorId: string;
  /** Idempotency key for retry safety */
  idempotencyKey: string;

  /** Type of interaction */
  kind: InputKind;
  /** Target entities this submission affects */
  targetEntityIds: string[];
  /** Base commit hash for conflict detection */
  baseCommitHash: string;

  /** Submission payload (prompt, parameters, etc.) */
  payload: Record<string, unknown>;
  /** Current lifecycle state */
  status: SubmissionStatus;

  /** Moderation decision reference */
  moderationDecisionId?: string;
  /** Billing entitlement reference */
  entitlementId?: string;

  /** When submission was admitted (ISO timestamp) */
  admittedAt: string;
  /** Admission sequence for ordering */
  admissionSequence: number;

  /** App-specific metadata (JSONB extension) */
  appMetadata: Record<string, unknown>;
}

/**
 * Resolution - Records what the system chose, execution, commit.
 *
 * A Resolution represents the outcome of arbitration: which submissions were selected
 * and how they were combined into execution.
 */
export interface Resolution {
  /** Unique identifier for the resolution */
  id: string;
  /** Window this resolution belongs to */
  windowId: string;

  /** IDs of selected submissions */
  selectedSubmissionIds: string[];
  /** IDs of rejected submissions */
  rejectedSubmissionIds: string[];

  /** Arbitration policy used */
  arbitrationPolicy: ArbitrationPolicyName;
  /** Policy version used */
  policyVersion: string;
  /** Resolution sequence for ordering */
  resolutionSequence: number;

  /** Base commit hash for conflict detection */
  baseCommitHash: string;
  /** Current lifecycle state */
  status: "selected" | "executing" | "committed" | "failed";

  /** Model execution reference */
  modelExecutionId?: string;
  /** Resulting commit hash */
  resultingCommitHash?: string;

  /** Video provider session ID (if video generation) */
  videoProviderSessionId?: string;
  /** Video provider interaction (to send to VideoProvider) */
  videoProviderInteraction?: {
    type: "prompt" | "command" | "mutation" | "vote" | "branch";
    payload: Record<string, unknown>;
  };

  /** App-specific metadata (JSONB extension) */
  appMetadata: Record<string, unknown>;
}

/**
 * Moderation decision result.
 */
export interface ModerationDecision {
  /** Unique identifier for the decision */
  id: string;
  /** Submission this decision applies to */
  submissionId: string;

  /** Decision status */
  status: "allow" | "reject" | "review" | "transform";
  /** Reasons for the decision */
  reasons: string[];
  /** Policy version used */
  policyVersion: string;
  /** Who made the decision */
  reviewedBy: "rules" | "model" | "human";

  /** When the decision was made (ISO timestamp) */
  createdAt: string;
}

/**
 * Interaction event for frontend signaling.
 */
export interface InteractionEvent {
  /** Event sequence number for ordering */
  sequence: number;
  /** World/channel identifier */
  worldId: string;
  /** Window identifier (optional) */
  windowId?: string;
  /** Event type */
  eventType: string;
  /** Event data */
  data: Record<string, unknown>;
  /** When the event occurred (ISO timestamp) */
  occurredAt: string;
}

/**
 * Context for moderation.
 */
export interface ModerationContext {
  /** Content rating threshold */
  contentRating: ContentRating;
  /** World-specific rules (app-provided) */
  worldRules?: WorldRule[];
  /** User identifier (optional) */
  userId?: string;
}

/**
 * World rule for moderation (app-provided).
 */
export interface WorldRule {
  /** Rule identifier */
  id: string;
  /** Rule description */
  description: string;
  /** Rule validation logic (app-implemented) */
  validate: (payload: Record<string, unknown>) => boolean;
}

/**
 * Price quote from billing system.
 */
export interface PriceQuote {
  /** Quote identifier */
  id: string;
  /** Amount in cents */
  amountCents: number;
  /** Currency code */
  currency: string;
  /** When quote expires (ISO timestamp) */
  expiresAt: string;
}

/**
 * Entitlement reservation from billing system.
 */
export interface EntitlementReservation {
  /** Reservation identifier */
  id: string;
  /** Amount reserved in credits */
  amountCredits: number;
  /** When reservation expires (ISO timestamp) */
  expiresAt: string;
}

/**
 * Input for creating a window.
 */
export interface CreateWindowInput {
  worldId: string;
  branchId: string;
  baseCommitHash: string;
  conflictKey: string;
  allowedInputKinds: InputKind[];
  arbitrationPolicy: ArbitrationPolicyName;
  arbitrationPolicyConfig?: Record<string, unknown>;
  billingPolicy: BillingPolicy;
  maxSubmissionsPerUser: number;
  maxSelectedInputs: number;
  opensAt: string;
  closesAt: string | null;
  contentRating: ContentRating;
  moderationPolicyVersion?: string;
  rulesetVersion?: string;
  appMetadata?: Record<string, unknown>;
}

/**
 * Input for submitting an intent.
 */
export interface SubmitIntentInput {
  windowId: string;
  actorId: string;
  idempotencyKey: string;
  kind: InputKind;
  targetEntityIds?: string[];
  baseCommitHash?: string;
  payload: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}
