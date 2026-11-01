/** Canonical channel interaction settings. Undefined means interactions are disabled. */
export interface ChoiceSettings {
  choiceNumber: number;
  price: number;
  choiceDuration: number;
  persistent: boolean;
  schedule: { mode: "timed"; choiceIntervalSeconds: number } | { mode: "model" };
}

export interface FeedbackSettings {
  /** Maximum feedback events per user per session. */
  maxPerSession: number;
  /** Credits granted per accepted response. */
  rewardCredits: number;
  /** How long a feedback event stays open. */
  windowSeconds: number;
}

export interface InteractionSettings {
  choice?: ChoiceSettings;
  feedback: FeedbackSettings;
}

function parseChoice(choice: unknown): ChoiceSettings | undefined {
  if (choice === undefined) return undefined;
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) throw new TypeError("interactions.choice must be an object");
  const c = choice as Record<string, unknown>;
  const allowed = new Set(["choice-number", "price", "choice-duration", "persistent", "choice-interval-seconds", "model-choice-interval"]);
  for (const key of Object.keys(c)) if (!allowed.has(key)) throw new TypeError(`Unknown choice setting: ${key}`);
  const number = c["choice-number"] ?? 3;
  const price = c.price ?? 0;
  const duration = c["choice-duration"] ?? 8;
  const persistent = c.persistent ?? false;
  const interval = c["choice-interval-seconds"];
  const model = c["model-choice-interval"];
  if (!Number.isSafeInteger(number) || (number as number) < 2 || (number as number) > 6) throw new TypeError("choice-number must be an integer from 2 to 6");
  if (!Number.isSafeInteger(price) || (price as number) < 0) throw new TypeError("price must be a non-negative integer");
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) throw new TypeError("choice-duration must be positive seconds");
  if (typeof persistent !== "boolean") throw new TypeError("persistent must be boolean");
  if (model !== undefined && typeof model !== "boolean") throw new TypeError("model-choice-interval must be boolean");
  if ((model === true) === (interval !== undefined)) throw new TypeError("Configure exactly one choice scheduling mode");
  if (interval !== undefined && (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0)) throw new TypeError("choice-interval-seconds must be positive");
  return { choiceNumber: number as number, price: price as number, choiceDuration: duration, persistent, schedule: model === true ? { mode: "model" } : { mode: "timed", choiceIntervalSeconds: interval as number } };
}

const DEFAULT_FEEDBACK: FeedbackSettings = { maxPerSession: 1, rewardCredits: 1, windowSeconds: 120 };

function parseFeedback(feedback: unknown): FeedbackSettings {
  if (feedback === undefined) return { ...DEFAULT_FEEDBACK };
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) throw new TypeError("interactions.feedback must be an object");
  const f = feedback as Record<string, unknown>;
  const allowed = new Set(["max-per-session", "reward-credits", "window-seconds"]);
  for (const key of Object.keys(f)) if (!allowed.has(key)) throw new TypeError(`Unknown feedback setting: ${key}`);
  const maxPerSession = f["max-per-session"] ?? DEFAULT_FEEDBACK.maxPerSession;
  const rewardCredits = f["reward-credits"] ?? DEFAULT_FEEDBACK.rewardCredits;
  const windowSeconds = f["window-seconds"] ?? DEFAULT_FEEDBACK.windowSeconds;
  if (!Number.isSafeInteger(maxPerSession) || (maxPerSession as number) < 1) throw new TypeError("feedback max-per-session must be a positive integer");
  if (!Number.isSafeInteger(rewardCredits) || (rewardCredits as number) < 0) throw new TypeError("feedback reward-credits must be a non-negative integer");
  if (typeof windowSeconds !== "number" || !Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new TypeError("feedback window-seconds must be positive");
  return { maxPerSession: maxPerSession as number, rewardCredits: rewardCredits as number, windowSeconds };
}

/** Parse the interactions property of a channel registry entry. */
export function parseChoiceSettings(interactions: unknown): ChoiceSettings | undefined {
  if (interactions === undefined) return undefined;
  if (!interactions || typeof interactions !== "object" || Array.isArray(interactions)) throw new TypeError("interactions must be an object");
  return parseChoice((interactions as Record<string, unknown>).choice);
}

/** Parse the whole interactions block, including feedback settings. */
export function parseInteractionSettings(interactions: unknown): InteractionSettings | undefined {
  if (interactions === undefined) return undefined;
  if (!interactions || typeof interactions !== "object" || Array.isArray(interactions)) throw new TypeError("interactions must be an object");
  const record = interactions as Record<string, unknown>;
  const allowed = new Set(["choice", "feedback"]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new TypeError(`Unknown interactions section: ${key}`);
  const choice = parseChoice(record.choice);
  const feedback = parseFeedback(record.feedback);
  if (choice === undefined && record.feedback === undefined) return undefined;
  return { ...(choice ? { choice } : {}), feedback };
}
