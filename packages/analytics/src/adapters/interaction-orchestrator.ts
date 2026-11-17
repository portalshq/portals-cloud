import type { Observation } from "../index.js";
export interface InteractionEvent { id?: string; worldId?: string; eventType: string; occurredAt: string; /** Source insertion time; the event time remains occurredAt. */ createdAt?: string; data: Record<string, unknown> }
const supported = new Set(["window_created", "window_state_changed", "submission_created", "submission_status_changed", "submission_rejected", "resolution_selected", "resolution_executing", "resolution_committed", "resolution_failed", "billing_authorized", "billing_captured", "billing_released", "choice_opened", "choice_resolved", "guide_opened", "feedback_opened", "feedback_rewarded", "reaction_recorded"]);
const personLevel = new Set(["submission_created", "submission_status_changed", "submission_rejected", "billing_authorized", "billing_captured", "billing_released", "feedback_rewarded", "reaction_recorded"]);
export function interactionEventRequiresIdentity(eventType: string): boolean { return personLevel.has(eventType); }
const integer = (value: unknown): number | undefined => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
/** Map known lifecycle boundaries without passing through arbitrary user content. */
export function mapInteractionEvent(event: InteractionEvent): Observation | undefined {
  if (!supported.has(event.eventType)) return undefined;
  if (!event.id || !Number.isFinite(Date.parse(event.occurredAt))) throw new Error("Invalid interaction event");
  const properties: Record<string, string | number | boolean | null> = {};
  if (event.eventType === 'choice_opened') {
    if (Array.isArray(event.data.options)) properties.option_count = event.data.options.length;
    const price = integer(event.data.price); if (price !== undefined) properties.price_credits = price;
  }
  if (event.eventType === 'choice_resolved') {
    const ballots = integer(event.data.ballotCount); if (ballots !== undefined) properties.ballot_count = ballots;
  }
  if (event.eventType === 'guide_opened') {
    const price = integer(event.data.price); if (price !== undefined) properties.price_credits = price;
  }
  if (event.eventType === 'feedback_opened') {
    const reward = integer(event.data.rewardCredits); if (reward !== undefined) properties.reward_credits = reward;
  }
  if (event.eventType === 'feedback_rewarded') {
    const reward = integer(event.data.amountCredits); if (reward !== undefined) properties.reward_credits = reward;
  }
  if (event.eventType === 'reaction_recorded' && typeof event.data.emotion === 'string' && ['love', 'laugh', 'fire', 'sad', 'angry'].includes(event.data.emotion)) properties.reaction = event.data.emotion;
  return { id: `interaction:${event.id}`, name: `interaction.${event.eventType}`, version: 1, occurredAt: event.occurredAt, provenance: "server", properties };
}
