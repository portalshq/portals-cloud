import { randomUUID } from "node:crypto";
import type {
  ContentRating,
  ModerationContext,
  ModerationDecision,
  Submission,
} from "./types.js";
import { InteractionError, json, ratings, text } from "./validation.js";

export interface ModerationValidator {
  name: string;
  validate(
    input: Submission,
    context: ModerationContext
  ): Promise<ModerationDecision>;
  /** If absent, validate receives a synthetic submission containing the entire output. */
  validateOutput?(
    text: string,
    context: ModerationContext
  ): Promise<ModerationDecision>;
}
export type CustomValidator = ModerationValidator;
export interface IModerationGateway {
  moderateInput(
    input: Submission,
    context: ModerationContext
  ): Promise<ModerationDecision>;
  moderateOutput(
    output: unknown,
    context: ModerationContext
  ): Promise<ModerationDecision>;
}
export interface ModerationOptions {
  blockedTerms?: string[];
  mildProfanity?: string[];
  strongProfanity?: string[];
  explicitTerms?: string[];
  graphicViolenceTerms?: string[];
  prohibitedTerms?: string[];
  maxInputLength?: number;
  maxOutputLength?: number;
  policyVersion?: string;
}
const defaults = {
  mildProfanity: ["damn", "hell", "crap"],
  strongProfanity: ["fuck", "fucking", "shit", "bullshit", "bitch"],
  explicitTerms: ["pornography", "explicit sex", "sexual intercourse"],
  graphicViolenceTerms: ["dismemberment", "disembowel", "graphic torture"],
  prohibitedTerms: ["child pornography", "sexual abuse of children"],
};
function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("\n");
  if (value !== null && typeof value === "object")
    return Object.values(value).map(extractText).join("\n");
  return "";
}
function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function contains(haystack: string, needle: string): boolean {
  const target = normalize(needle);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "u"
  ).test(haystack);
}
export class ModerationGateway implements IModerationGateway {
  private readonly validators = new Map<string, ModerationValidator>();
  private defaultRating: ContentRating = "E";
  private readonly options: Required<ModerationOptions>;
  constructor(options: ModerationOptions | string[] = {}) {
    const config = Array.isArray(options) ? { blockedTerms: options } : options;
    this.options = {
      ...defaults,
      blockedTerms: [],
      maxInputLength: 200,
      maxOutputLength: 32000,
      policyVersion: "1.0.0",
      ...config,
    };
    for (const key of [
      "blockedTerms",
      "mildProfanity",
      "strongProfanity",
      "explicitTerms",
      "graphicViolenceTerms",
      "prohibitedTerms",
    ] as const) {
      if (!Array.isArray(this.options[key]))
        throw new InteractionError("INVALID_INPUT", `Invalid ${key}`);
      for (const term of this.options[key]) text(term, key, 200);
      this.options[key] = [...this.options[key]];
    }
    for (const length of [
      this.options.maxInputLength,
      this.options.maxOutputLength,
    ])
      if (!Number.isSafeInteger(length) || length < 1 || length > 65536)
        throw new InteractionError(
          "INVALID_INPUT",
          "Moderation length must be between 1 and 65536"
        );
    text(this.options.policyVersion, "policyVersion");
  }
  setContentRating(rating: ContentRating): void {
    if (!ratings.includes(rating))
      throw new InteractionError("INVALID_INPUT", "Unknown content rating");
    this.defaultRating = rating;
  }
  registerValidator(name: string, validator: ModerationValidator): void {
    text(name, "validator name");
    if (validator.name !== name || typeof validator.validate !== "function")
      throw new InteractionError(
        "INVALID_INPUT",
        "Invalid moderation validator"
      );
    this.validators.set(name, validator);
  }
  registerCustomValidator(validator: CustomValidator): void {
    this.registerValidator(validator.name, validator);
  }
  async moderateInput(
    input: Submission,
    context: ModerationContext = { contentRating: this.defaultRating }
  ): Promise<ModerationDecision> {
    return this.moderate(input, context, "input");
  }
  async moderateOutput(
    output: unknown,
    context: ModerationContext = { contentRating: this.defaultRating }
  ): Promise<ModerationDecision> {
    json(output, "output");
    const input: Submission = {
      id: context.submissionId ?? "output",
      windowId: "output",
      actorId: context.userId ?? "system",
      idempotencyKey: "output",
      kind: "message",
      payload: { output },
      status: "moderating",
      targetEntityIds: [],
      baseCommitHash: "output",
      admittedAt: new Date().toISOString(),
      admissionSequence: 0,
      appMetadata: {},
    };
    return this.moderate(input, context, "output");
  }
  private async moderate(
    input: Submission,
    context: ModerationContext,
    phase: "input" | "output"
  ): Promise<ModerationDecision> {
    if (!ratings.includes(context.contentRating))
      throw new InteractionError("INVALID_INPUT", "Unknown content rating");
    json(input.payload);
    const content = extractText(input.payload);
    const normalized = normalize(content);
    const reasons: string[] = [];
    if (
      [...content].length >
      (phase === "input"
        ? this.options.maxInputLength
        : this.options.maxOutputLength)
    )
      reasons.push("Content exceeds length limit");
    const forbidden = [
      ...this.options.blockedTerms,
      ...this.options.prohibitedTerms,
    ];
    switch (context.contentRating) {
      case "E":
        forbidden.push(
          ...this.options.mildProfanity,
          ...this.options.strongProfanity,
          ...this.options.explicitTerms,
          ...this.options.graphicViolenceTerms
        );
        break;
      case "T":
        forbidden.push(
          ...this.options.strongProfanity,
          ...this.options.explicitTerms,
          ...this.options.graphicViolenceTerms
        );
        break;
      case "T+":
        forbidden.push(...this.options.explicitTerms);
        break;
      case "M":
        break;
    }
    if (forbidden.some((term) => contains(normalized, term)))
      reasons.push(`Content violates the ${context.contentRating} term policy`);
    for (const rule of context.worldRules ?? [])
      if (rule.validate(structuredClone(input.payload)) !== true)
        reasons.push(`World rule violated: ${rule.id}`);
    const decision: ModerationDecision = {
      id: randomUUID(),
      submissionId: input.id,
      status: reasons.length ? "reject" : "allow",
      reasons,
      policyVersion: context.policyVersion ?? this.options.policyVersion,
      reviewedBy: "rules",
      createdAt: new Date().toISOString(),
    };
    if (reasons.length) return decision;
    const priority = { allow: 0, transform: 1, review: 2, reject: 3 };
    for (const validator of this.validators.values()) {
      const result =
        phase === "output" && validator.validateOutput
          ? await validator.validateOutput(content, context)
          : await validator.validate(structuredClone(input), context);
      if (
        !result ||
        !Object.hasOwn(priority, result.status) ||
        !Array.isArray(result.reasons) ||
        result.reasons.some((reason) => typeof reason !== "string") ||
        !["rules", "model", "human"].includes(result.reviewedBy)
      )
        throw new InteractionError(
          "INVALID_MODERATION_RESULT",
          `Invalid decision from ${validator.name}`
        );
      if (priority[result.status] > priority[decision.status]) {
        decision.status = result.status;
        decision.reviewedBy = result.reviewedBy;
      }
      decision.reasons.push(...result.reasons);
    }
    return decision;
  }
}
