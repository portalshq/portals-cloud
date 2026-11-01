import type { BillingEvent } from "./adapters/monetization.js";
import type { InteractionEvent } from "./adapters/interaction-orchestrator.js";
/** Minimal pg-compatible read-only seam. Retained source rows remain owned by their applications. */
export interface Queryable { query(text: string, params: unknown[]): Promise<{rows: Record<string, unknown>[]}> }
function iso(value: unknown): string { const date = new Date(value as string); if (!Number.isFinite(date.getTime())) throw new Error("Invalid source timestamp"); return date.toISOString(); }
/** Explicit time range on source insertion time (created_at) supports operator
 *  replays; no timestamp-based checkpoint claims completeness. */
export async function readBilling(db: Queryable, from: string, to: string): Promise<BillingEvent[]> {
  const {rows} = await db.query("SELECT id, type, payload, created_at FROM monetization_outbox WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at, id", [from, to]);
  return rows.map(r => ({id: String(r.id), type: String(r.type), createdAt: iso(r.created_at), payload: r.payload as Record<string, unknown>}));
}
export async function readInteractions(db: Queryable, from: string, to: string): Promise<InteractionEvent[]> {
  const {rows} = await db.query("SELECT id, world_id, event_type, payload, created_at, occurred_at FROM interaction_outbox WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at, id", [from, to]);
  return rows.map(r => ({id: String(r.id), worldId: String(r.world_id), eventType: String(r.event_type), occurredAt: iso(r.occurred_at), createdAt: iso(r.created_at), data: r.payload as Record<string, unknown>}));
}
