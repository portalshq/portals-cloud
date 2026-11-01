import type { Observation, Properties } from "../index.js";

export interface BillingEvent { id: string; type: string; createdAt: string; payload: Readonly<Record<string, unknown>> }
const types = new Set(["billing.purchase_settled", "billing.purchase_refunded", "billing.purchase_disputed"]);
/** Domain payload is never copied wholesale. Financial amounts remain integer minor units. */
export function mapBillingEvent(event: BillingEvent): Observation | undefined {
  if (!types.has(event.type)) return undefined;
  const { amount, refundedAmount, currency } = event.payload;
  if (!event.id || !Number.isFinite(Date.parse(event.createdAt)) || !Number.isSafeInteger(amount) || (amount as number) < 0 || !Number.isSafeInteger(refundedAmount) || (refundedAmount as number) < 0 || typeof currency !== "string" || !/^[a-zA-Z]{3}$/.test(currency)) throw new Error("Invalid billing event");
  const properties: Properties = { amount: amount as number, refunded_amount: refundedAmount as number, currency: currency.toLowerCase() };
  const buyer = event.payload.buyerId;
  if (buyer !== undefined && (typeof buyer !== "string" || !buyer || buyer.length > 128 || buyer.includes("@"))) throw new Error("Invalid buyer identity");
  return { id: `billing:${event.id}`, name: event.type, version: 1, occurredAt: event.createdAt, provenance: "server", properties, ...(buyer ? {identity: {userId: buyer as string}} : {}) };
}
