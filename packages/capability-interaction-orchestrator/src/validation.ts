import type {
  CreateWindowInput,
  InputWindow,
  SubmitIntentInput,
  WindowState,
} from "./types.js";

export class InteractionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "InteractionError";
  }
}
export function requireValue<T>(value: T | null | undefined, kind: string): T {
  if (value == null)
    throw new InteractionError("NOT_FOUND", `${kind} not found`);
  return value;
}
export function text(
  value: unknown,
  name: string,
  max = 1024
): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new InteractionError(
      "INVALID_INPUT",
      `${name} must be a nonempty string of at most ${max} characters`
    );
}
export function integer(
  value: unknown,
  name: string,
  min = 1,
  max = 2147483647
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    throw new InteractionError(
      "INVALID_INPUT",
      `${name} must be an integer between ${min} and ${max}`
    );
}
export function json(value: unknown, name = "payload"): void {
  const seen = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    if (depth > 32)
      throw new InteractionError(
        "INVALID_INPUT",
        `${name} is too deeply nested`
      );
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v))
    )
      return;
    if (typeof v !== "object" || seen.has(v))
      throw new InteractionError(
        "INVALID_INPUT",
        `${name} must contain only JSON values`
      );
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw new InteractionError(
        "INVALID_INPUT",
        `${name} must contain only plain objects`
      );
    seen.add(v);
    for (const x of Object.values(v)) visit(x, depth + 1);
    seen.delete(v);
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > 65536)
    throw new InteractionError("INVALID_INPUT", `${name} exceeds 64 KiB`);
}
export function record(
  value: unknown,
  name: string
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new InteractionError("INVALID_INPUT", `${name} must be an object`);
  json(value, name);
}
export function timestamp(
  value: unknown,
  name: string
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)
  )
    throw new InteractionError(
      "INVALID_INPUT",
      `${name} must be an ISO UTC timestamp`
    );
}
export function policyName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value))
    throw new InteractionError(
      "INVALID_INPUT",
      "Invalid arbitration policy name"
    );
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const inputKinds = [
  "vote",
  "custom_prompt",
  "entity_mutation",
  "world_action",
  "message",
  "create_object",
  "create_branch",
];
export const policies = [
  "fifo",
  "first_accepted",
  "plurality",
  "ranked",
  "batch",
  "parallel_branches",
  "host_selection",
];
export const ratings = ["E", "T", "T+", "M"];
export function validateWindow(input: CreateWindowInput): void {
  for (const key of [
    "worldId",
    "branchId",
    "baseCommitHash",
    "conflictKey",
  ] as const)
    text(input[key], key);
  integer(input.maxSelectedInputs, "maxSelectedInputs");
  integer(input.maxSubmissionsPerUser, "maxSubmissionsPerUser");
  if (
    !Array.isArray(input.allowedInputKinds) ||
    !input.allowedInputKinds.length ||
    new Set(input.allowedInputKinds).size !== input.allowedInputKinds.length ||
    input.allowedInputKinds.some((k) => !inputKinds.includes(k))
  )
    throw new InteractionError("INVALID_INPUT", "Invalid allowedInputKinds");
  policyName(input.arbitrationPolicy);
  if (!ratings.includes(input.contentRating))
    throw new InteractionError("INVALID_INPUT", "Invalid content rating");
  if (
    ![
      "free",
      "prepaid_credits",
      "capture_if_selected",
      "pay_to_generate",
      "pay_to_publish",
      "pay_for_guaranteed_slot",
    ].includes(input.billingPolicy)
  )
    throw new InteractionError("INVALID_INPUT", "Invalid billing policy");
  timestamp(input.opensAt, "opensAt");
  if (input.closesAt !== null) {
    timestamp(input.closesAt, "closesAt");
    if (Date.parse(input.closesAt) <= Date.parse(input.opensAt))
      throw new InteractionError(
        "INVALID_INPUT",
        "closesAt must follow opensAt"
      );
  }
  record(input.arbitrationPolicyConfig ?? {}, "arbitrationPolicyConfig");
  record(input.appMetadata ?? {}, "appMetadata");
  if (input.moderationPolicyVersion !== undefined)
    text(input.moderationPolicyVersion, "moderationPolicyVersion");
  if (input.rulesetVersion !== undefined)
    text(input.rulesetVersion, "rulesetVersion");
  if (input.billingPolicy !== "free" || input.billingTerms !== undefined) {
    const terms = requireValue(input.billingTerms, "billingTerms");
    text(terms.tenantId, "tenantId");
    text(terms.entitlementKind, "entitlementKind");
    integer(terms.amountCredits, "amountCredits");
    integer(terms.amountCents, "amountCents", 0);
    if (!/^[A-Z]{3}$/.test(terms.currency))
      throw new InteractionError(
        "INVALID_INPUT",
        "currency must be an uppercase ISO currency code"
      );
    if (terms.sessionId !== undefined) text(terms.sessionId, "sessionId");
    if (
      terms.date !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(terms.date) ||
        !Number.isFinite(Date.parse(terms.date)) ||
        new Date(terms.date).toISOString().slice(0, 10) !== terms.date)
    )
      throw new InteractionError("INVALID_INPUT", "Invalid entitlement date");
    if (terms.reservationTtlMs !== undefined)
      integer(terms.reservationTtlMs, "reservationTtlMs", 1000, 86400000);
  }
  if (
    input.billingPolicy === "pay_for_guaranteed_slot" &&
    !["fifo", "parallel_branches"].includes(input.arbitrationPolicy)
  )
    throw new InteractionError(
      "INVALID_INPUT",
      "Guaranteed slots require fifo or parallel_branches"
    );
}
export function validateIntent(input: SubmitIntentInput): void {
  for (const key of ["windowId", "actorId", "idempotencyKey"] as const)
    text(input[key], key);
  if (!inputKinds.includes(input.kind))
    throw new InteractionError("INVALID_INPUT", "Invalid input kind");
  record(input.payload, "payload");
  record(input.appMetadata ?? {}, "appMetadata");
  if (input.baseCommitHash !== undefined)
    text(input.baseCommitHash, "baseCommitHash");
  if (
    input.targetEntityIds !== undefined &&
    (!Array.isArray(input.targetEntityIds) ||
      input.targetEntityIds.length > 100 ||
      new Set(input.targetEntityIds).size !== input.targetEntityIds.length)
  )
    throw new InteractionError("INVALID_INPUT", "Invalid targetEntityIds");
  for (const id of input.targetEntityIds ?? []) text(id, "targetEntityId");
  const p = input.payload;
  if (p.params !== undefined) record(p.params, "params");
  switch (input.kind) {
    case "custom_prompt":
      text(p.prompt, "prompt", 16000);
      break;
    case "message":
      text(p.message, "message", 16000);
      break;
    case "world_action":
      text(p.action, "action");
      break;
    case "entity_mutation":
      if (!input.targetEntityIds?.length)
        throw new InteractionError(
          "INVALID_INPUT",
          "entity_mutation requires targetEntityIds"
        );
      record(p.params, "params");
      break;
    case "vote":
      text(p.option ?? p.targetId, "vote target");
      if (
        p.option !== undefined &&
        p.targetId !== undefined &&
        p.option !== p.targetId
      )
        throw new InteractionError(
          "INVALID_INPUT",
          "Vote option and targetId must agree"
        );
      if (
        p.value !== undefined &&
        (typeof p.value !== "number" || !Number.isFinite(p.value))
      )
        throw new InteractionError("INVALID_INPUT", "Invalid vote value");
      break;
    case "create_object":
      record(p.object, "object");
      break;
    case "create_branch":
      text(p.name, "branch name");
      break;
  }
}
const transitions: Record<WindowState, WindowState[]> = {
  scheduled: ["open", "cancelled", "failed"],
  open: ["qualifying", "cancelled", "failed"],
  qualifying: ["resolving", "cancelled", "failed"],
  resolving: ["executing", "failed", "cancelled"],
  executing: ["committing", "failed"],
  committing: ["published", "failed"],
  published: [],
  failed: [],
  cancelled: [],
};
export function validateTransition(
  window: InputWindow,
  state: WindowState
): void {
  if (window.state !== state && !transitions[window.state].includes(state))
    throw new InteractionError(
      "INVALID_STATE",
      `Cannot transition window from ${window.state} to ${state}`
    );
}
