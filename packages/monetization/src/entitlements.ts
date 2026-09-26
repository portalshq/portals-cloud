import type { IdGenerator, PurchaseSettledFacts } from "./types.js";

/**
 * Tenant-configured entitlements.
 *
 * An entitlement is a grant made to a paying end user ("consumer"), scoped by
 * a set of dimensions. A rule is owned and configured by the tenant, not the
 * platform: the channel owner decides what a purchase unlocks and for how long.
 *
 * The scope is an arbitrary subset of dimensions, and **the dimensions present
 * are both the matcher and the lifetime**:
 *
 *   { channelId }                  → valid for the life of the channel
 *   { channelId, sessionId }       → valid only during that session
 *   { channelId, date }            → valid only for purchases settling that day,
 *                                    and expires at the end of it
 *   { channelId, sessionId, date } → the narrowest form
 *
 * Every dimension a rule names must match for the grant to be made. A grant
 * is always made to a consumer, so a rule never grants "the channel" anything.
 *
 * Grants are balances, not flags. A rule that nothing ever consumes stays
 * permanently available, which is how a standing membership is expressed, and
 * a rule the application consumes one unit at a time is how a single-use
 * unlock is expressed. Both use the same primitive.
 */

/**
 * A scope dimension whose value is this token binds to the matching fact of the
 * purchase at grant time, instead of being compared literally.
 *
 * A superchat grants influence over the story turn it was bought for, so its
 * rule must be scoped to "whichever session this purchase happened in" — a
 * fixed session id could never match. `"$self"` says bind; the grant then carries
 * the concrete value and normal equality applies at consumption.
 */
export const SELF_BIND = "$self";

export interface EntitlementScope {
  channelId?: string;
  sessionId?: string;
  /** ISO `yyyy-mm-dd` (UTC). Restricts the rule to purchases settling that day. */
  date?: string;
}

/** True when a scope dimension binds to the purchase rather than comparing. */
function isSelfBind(value: string | undefined): boolean {
  return value === SELF_BIND;
}

/**
 * Replaces self-binding dimensions with the concrete facts, producing the scope
 * the grant is actually scoped to. A binding dimension with no corresponding
 * fact is dropped, so a purchase with no session yields an unscoped grant rather
 * than a permanently unsatisfiable one.
 */
export function resolveScope(scope: EntitlementScope, facts: PurchaseSettledFacts): EntitlementScope {
  const resolved: EntitlementScope = {};
  if (scope.channelId !== undefined) {
    resolved.channelId = isSelfBind(scope.channelId) ? facts.channelId : scope.channelId;
  }
  if (scope.sessionId !== undefined) {
    // A self-binding session becomes the purchase's own session, so the grant is
    // scoped to where it was bought. With no session there is nothing to bind,
    // so the dimension is dropped rather than left permanently unsatisfiable.
    if (isSelfBind(scope.sessionId)) {
      if (facts.sessionId) resolved.sessionId = facts.sessionId;
    } else {
      resolved.sessionId = scope.sessionId;
    }
  }
  if (scope.date !== undefined) {
    resolved.date = scope.date;
  }
  return resolved;
}

export type EntitlementCondition =
  | { fact: "purchaseKind"; equals: string }
  | { fact: "productKey"; equals: string }
  | { fact: "amount"; gte: number };

export interface EntitlementRule {
  id: string;
  tenantId: string;
  /** What is granted, e.g. "prompt_influence" or "founding_member". */
  kind: string;
  scope: EntitlementScope;
  /** All must match. Empty means the rule matches any settled purchase. */
  conditions: readonly EntitlementCondition[];
  /** Units granted per qualifying purchase. Must be >= 1. */
  quantity: number;
  createdAt: string;
}

export interface EntitlementGrant {
  id: string;
  ruleId: string;
  tenantId: string;
  /** The end user who paid. */
  consumerId: string;
  kind: string;
  scope: EntitlementScope;
  quantity: number;
  remaining: number;
  /** The purchase that created this grant, so a refund can revoke it. */
  purchaseId: string;
  /** End of `scope.date` when the rule named one, else undefined. */
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementStore {
  saveRule(rule: EntitlementRule): Promise<void>;
  getRule(id: string): Promise<EntitlementRule | undefined>;
  listRules(tenantId: string): Promise<readonly EntitlementRule[]>;
  /** Idempotent per `(ruleId, purchaseId)` so a redelivered outbox event cannot double-grant. */
  grant(grants: readonly EntitlementGrant[]): Promise<void>;
  /**
   * Spend `n` units at a site. Consumes the oldest applicable grant with
   * units remaining. Returns false when nothing is available.
   */
  consume(consumerId: string, kind: string, site: EntitlementScope, n: number): Promise<boolean>;
  /** Units available at a site. */
  remaining(consumerId: string, kind: string, site: EntitlementScope): Promise<number>;
  /** Revoke everything a purchase created, for refunds and disputes. */
  revokeForPurchase(purchaseId: string): Promise<void>;
}

/** End of the UTC day named by `scope.date`, or undefined when the rule is not date-bounded. */
export function scopeExpiresAt(scope: EntitlementScope): string | undefined {
  return scope.date ? `${utcDay(scope.date)}T23:59:59.999Z` : undefined;
}

/**
 * A grant is usable at a site when every dimension it names matches the site's
 * facts. A channel-scoped grant is therefore valid anywhere in that channel,
 * and a session-scoped grant only inside that session.
 */
export function grantAppliesAt(grantScope: EntitlementScope, site: EntitlementScope): boolean {
  if (grantScope.channelId !== undefined && grantScope.channelId !== site.channelId) return false;
  if (grantScope.sessionId !== undefined && grantScope.sessionId !== site.sessionId) return false;
  if (grantScope.date !== undefined && site.date !== undefined && utcDay(grantScope.date) !== utcDay(site.date)) return false;
  return true;
}

/** Every dimension named by the rule and every condition must match. */
export function ruleMatches(rule: EntitlementRule, facts: PurchaseSettledFacts): boolean {
  if (rule.tenantId !== facts.tenantId) return false;
  if (rule.scope.channelId !== undefined && !isSelfBind(rule.scope.channelId) && rule.scope.channelId !== facts.channelId) return false;
  // A self-binding session requires the purchase to actually be in one.
  if (rule.scope.sessionId !== undefined && isSelfBind(rule.scope.sessionId) && !facts.sessionId) return false;
  if (rule.scope.sessionId !== undefined && !isSelfBind(rule.scope.sessionId) && rule.scope.sessionId !== facts.sessionId) return false;
  if (rule.scope.date !== undefined && utcDay(rule.scope.date) !== utcDay(facts.settledAt)) return false;
  return rule.conditions.every((condition) => {
    switch (condition.fact) {
      case "purchaseKind":
        return facts.kind === condition.equals;
      case "productKey":
        return facts.productKey === condition.equals;
      case "amount":
        return facts.amount >= condition.gte;
    }
  });
}

/** Grants a settled purchase should create, one per matching rule for that tenant. */
export function grantsForSettlement(
  rules: readonly EntitlementRule[],
  facts: PurchaseSettledFacts,
  ids: IdGenerator,
  now: string,
): EntitlementGrant[] {
  return rules
    .filter((rule) => ruleMatches(rule, facts))
    .map((rule) => {
      const bound = resolveScope(rule.scope, facts);
      const expiresAt = scopeExpiresAt(bound);
      return {
        id: ids.next(),
        ruleId: rule.id,
        tenantId: rule.tenantId,
        consumerId: facts.buyerId,
        kind: rule.kind,
        scope: bound,
        quantity: rule.quantity,
        remaining: rule.quantity,
        purchaseId: facts.purchaseId,
        ...(expiresAt ? { expiresAt } : {}),
        createdAt: now,
        updatedAt: now,
      };
    });
}

/** Rejects rules the engine cannot honour, so a bad rule fails at configuration time. */
export function validateRule(rule: EntitlementRule): void {
  if (!rule.id.trim()) throw new TypeError("rule id is required");
  if (!rule.tenantId.trim()) throw new TypeError("rule tenantId is required");
  if (!rule.kind.trim()) throw new TypeError("rule kind is required");
  if (!Number.isInteger(rule.quantity) || rule.quantity < 1) throw new TypeError("rule quantity must be a positive integer");
  const named = Object.values(rule.scope).filter((value) => value !== undefined);
  if (named.length === 0) throw new TypeError("rule scope must name at least one dimension");
  if (rule.scope.date !== undefined) utcDay(rule.scope.date);
  for (const condition of rule.conditions) {
    if (condition.fact === "amount" && (!Number.isInteger(condition.gte) || condition.gte < 0)) {
      throw new TypeError("amount condition must be a non-negative integer");
    }
  }
}

/** Reference store for tests and single-process deployments. */
export class InMemoryEntitlementStore implements EntitlementStore {
  private readonly rules = new Map<string, EntitlementRule>();
  private readonly grants = new Map<string, EntitlementGrant>();
  private readonly granted = new Set<string>();

  async saveRule(rule: EntitlementRule): Promise<void> {
    validateRule(rule);
    this.rules.set(rule.id, rule);
  }

  async getRule(id: string): Promise<EntitlementRule | undefined> {
    return this.rules.get(id);
  }

  async listRules(tenantId: string): Promise<readonly EntitlementRule[]> {
    return [...this.rules.values()].filter((rule) => rule.tenantId === tenantId);
  }

  async grant(grants: readonly EntitlementGrant[]): Promise<void> {
    for (const grant of grants) {
      const key = `${grant.ruleId}:${grant.purchaseId}`;
      if (this.granted.has(key)) continue;
      this.granted.add(key);
      this.grants.set(grant.id, grant);
    }
  }

  async consume(consumerId: string, kind: string, site: EntitlementScope, n: number): Promise<boolean> {
    if (!Number.isInteger(n) || n < 1) throw new TypeError("consume count must be a positive integer");
    const candidates = [...this.grants.values()]
      .filter((grant) => grant.consumerId === consumerId && grant.kind === kind && grant.remaining > 0 && grantAppliesAt(grant.scope, site))
      .filter((grant) => grant.expiresAt === undefined || Date.parse(grant.expiresAt) >= Date.now())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const available = candidates.reduce((total, grant) => total + grant.remaining, 0);
    if (available < n) return false;
    let owed = n;
    for (const grant of candidates) {
      if (owed === 0) break;
      const taken = Math.min(owed, grant.remaining);
      grant.remaining -= taken;
      owed -= taken;
    }
    return true;
  }

  async remaining(consumerId: string, kind: string, site: EntitlementScope): Promise<number> {
    return [...this.grants.values()]
      .filter((grant) => grant.consumerId === consumerId && grant.kind === kind && grantAppliesAt(grant.scope, site))
      .filter((grant) => grant.expiresAt === undefined || Date.parse(grant.expiresAt) >= Date.now())
      .reduce((total, grant) => total + grant.remaining, 0);
  }

  async revokeForPurchase(purchaseId: string): Promise<void> {
    for (const [id, grant] of this.grants) {
      if (grant.purchaseId === purchaseId) this.grants.delete(id);
    }
  }
}

function utcDay(value: string): string {
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`invalid date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Applies a settlement outbox event to the entitlement store.
 *
 * This is the piece that makes entitlements actually run. `BillingOutboxDispatcher`
 * delivers each committed event to a `publish` callback; wiring that callback to
 * this function is what grants on settlement and revokes on refund or dispute.
 *
 * Returns the grants created, or the number revoked, so a caller can log or
 * assert. Safe to call twice for the same event: grants are keyed
 * `(ruleId, purchaseId)` and revocation is idempotent.
 */
export async function applySettlementEvent(
  store: EntitlementStore,
  event: { type: string; payload: Readonly<Record<string, unknown>> },
  ids: IdGenerator,
  now: string,
): Promise<{ granted: number; revoked: number }> {
  const purchaseId = event.payload.purchaseId;
  if (typeof purchaseId !== "string" || !purchaseId) {
    throw new TypeError("outbox event is missing purchaseId");
  }

  if (event.type === "billing.purchase_refunded" || event.type === "billing.purchase_disputed") {
    await store.revokeForPurchase(purchaseId);
    return { granted: 0, revoked: 1 };
  }

  if (event.type !== "billing.purchase_settled") {
    return { granted: 0, revoked: 0 };
  }

  const facts = readSettlementFacts(event.payload);
  const rules = await store.listRules(facts.tenantId);
  const grants = grantsForSettlement(rules, facts, ids, now);
  await store.grant(grants);
  return { granted: grants.length, revoked: 0 };
}

/**
 * Narrows an outbox payload to settlement facts, rejecting a payload that cannot
 * support rule evaluation. The payload carries `schemaVersion: "2"` in its
 * checkout metadata; a payload without the newer fields predates entitlements
 * and is rejected rather than silently matched against missing values.
 */
export function readSettlementFacts(payload: Readonly<Record<string, unknown>>): PurchaseSettledFacts {
  const required = (key: string): string => {
    const value = payload[key];
    if (typeof value !== "string" || !value) {
      throw new TypeError(`settlement payload is missing ${key}`);
    }
    return value;
  };
  const amount = payload.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    throw new TypeError("settlement payload has an invalid amount");
  }
  return {
    purchaseId: required("purchaseId"),
    tenantId: required("tenantId"),
    channelId: required("channelId"),
    sessionId: typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : null,
    buyerId: required("buyerId"),
    kind: required("kind"),
    productKey: required("productKey"),
    amount,
    currency: required("currency"),
    settledAt: required("settledAt"),
  };
}
