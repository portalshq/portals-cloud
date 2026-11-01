import type { Observation } from "../index.js";
export interface InteractionEvent { id?: string; worldId?: string; eventType: string; occurredAt: string; /** Source insertion time; the event time remains occurredAt. */ createdAt?: string; data: Record<string, unknown> }
const supported = new Set(["window_created", "window_state_changed", "submission_created", "submission_status_changed", "submission_rejected", "resolution_selected", "resolution_executing", "resolution_committed", "resolution_failed", "billing_authorized", "billing_captured", "billing_released"]);
/** Map known lifecycle boundaries without passing through arbitrary user content. */
export function mapInteractionEvent(event: InteractionEvent): Observation | undefined {
  if (!supported.has(event.eventType)) return undefined;
  if (!event.id || !Number.isFinite(Date.parse(event.occurredAt))) throw new Error("Invalid interaction event");
  return { id: `interaction:${event.id}`, name: `interaction.${event.eventType}`, version: 1, occurredAt: event.occurredAt, provenance: "server", properties: {} };
}
