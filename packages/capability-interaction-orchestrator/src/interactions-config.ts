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

export type GuideSchedule =
  | { mode: "timed"; guideIntervalSeconds: number }
  | { mode: "model" };

export interface GuideSettings {
  /** Credits charged per guide when it is claimed for a generation turn. */
  price: number;
  /** How long a scheduled guide window accepts submissions. */
  windowSeconds: number;
  /** When true, guides are accepted at any time through the standing queue. */
  alwaysOpen: boolean;
  /** Maximum pending guides per actor. */
  maxPendingPerUser: number;
  /** Maximum guide prompt length in characters. */
  promptMaxLength: number;
  /** Window opening schedule. Required unless alwaysOpen is true. */
  schedule?: GuideSchedule;
}

export interface InteractionSettings {
  choice?: ChoiceSettings[];
  guides?: GuideSettings[];
  feedback: FeedbackSettings;
}

function asArray(value: unknown): unknown[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function parseChoice(choice: unknown): ChoiceSettings {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) throw new TypeError("interactions.choice entries must be objects");
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

function parseChoiceSection(choice: unknown): ChoiceSettings[] | undefined {
  const entries = asArray(choice);
  if (entries === undefined) return undefined;
  return entries.map(parseChoice);
}

const DEFAULT_FEEDBACK: FeedbackSettings = { maxPerSession: 1, rewardCredits: 1, windowSeconds: 120 };

function parseFeedbackEntry(feedback: unknown): FeedbackSettings {
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) throw new TypeError("interactions.feedback entries must be objects");
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

function parseFeedback(feedback: unknown): FeedbackSettings {
  if (feedback === undefined) return { ...DEFAULT_FEEDBACK };
  const entries = asArray(feedback);
  if (!entries || entries.length === 0) return { ...DEFAULT_FEEDBACK };
  if (entries.length > 1) {
    console.warn(`[interactions-config] interactions.feedback accepts a single config object; ignoring ${entries.length - 1} additional element(s)`);
  }
  return parseFeedbackEntry(entries[0]);
}

function parseGuide(guide: unknown): GuideSettings {
  if (!guide || typeof guide !== "object" || Array.isArray(guide)) throw new TypeError("interactions.guides entries must be objects");
  const g = guide as Record<string, unknown>;
  const allowed = new Set(["price", "window-seconds", "always-open", "guide-interval-seconds", "model-guide-interval", "max-pending", "prompt-max-length"]);
  for (const key of Object.keys(g)) if (!allowed.has(key)) throw new TypeError(`Unknown guide setting: ${key}`);
  const price = g.price ?? 1;
  const windowSeconds = g["window-seconds"] ?? 120;
  const alwaysOpen = g["always-open"] ?? false;
  const maxPendingPerUser = g["max-pending"] ?? 10;
  const promptMaxLength = g["prompt-max-length"] ?? 200;
  const interval = g["guide-interval-seconds"];
  const model = g["model-guide-interval"];
  if (!Number.isSafeInteger(price) || (price as number) < 1) throw new TypeError("guide price must be a positive integer");
  if (typeof windowSeconds !== "number" || !Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new TypeError("guide window-seconds must be positive");
  if (typeof alwaysOpen !== "boolean") throw new TypeError("guide always-open must be boolean");
  if (!Number.isSafeInteger(maxPendingPerUser) || (maxPendingPerUser as number) < 1) throw new TypeError("guide max-pending must be a positive integer");
  if (!Number.isSafeInteger(promptMaxLength) || (promptMaxLength as number) < 1) throw new TypeError("guide prompt-max-length must be a positive integer");
  if (model !== undefined && typeof model !== "boolean") throw new TypeError("model-guide-interval must be boolean");
  if (alwaysOpen) {
    if (interval !== undefined || model !== undefined) throw new TypeError("always-open guides cannot declare a schedule");
    return { price: price as number, windowSeconds, alwaysOpen, maxPendingPerUser: maxPendingPerUser as number, promptMaxLength: promptMaxLength as number };
  }
  if ((model === true) === (interval !== undefined)) throw new TypeError("Configure exactly one guide scheduling mode unless always-open");
  if (interval !== undefined && (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0)) throw new TypeError("guide-interval-seconds must be positive");
  return {
    price: price as number,
    windowSeconds,
    alwaysOpen,
    maxPendingPerUser: maxPendingPerUser as number,
    promptMaxLength: promptMaxLength as number,
    schedule: model === true ? { mode: "model" } : { mode: "timed", guideIntervalSeconds: interval as number },
  };
}

function parseGuideSection(guides: unknown): GuideSettings[] | undefined {
  const entries = asArray(guides);
  if (entries === undefined) return undefined;
  return entries.map(parseGuide);
}

/** Parse the choice section polymorphically: an object defines one event, an array defines many. */
export function parseChoiceSettings(interactions: unknown): ChoiceSettings[] | undefined {
  if (interactions === undefined) return undefined;
  if (!interactions || typeof interactions !== "object" || Array.isArray(interactions)) throw new TypeError("interactions must be an object");
  return parseChoiceSection((interactions as Record<string, unknown>).choice);
}

/** Parse the whole interactions block, including feedback settings. */
export function parseInteractionSettings(interactions: unknown): InteractionSettings | undefined {
  if (interactions === undefined) return undefined;
  if (!interactions || typeof interactions !== "object" || Array.isArray(interactions)) throw new TypeError("interactions must be an object");
  const record = interactions as Record<string, unknown>;
  const allowed = new Set(["choice", "guides", "feedback"]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new TypeError(`Unknown interactions section: ${key}`);
  const choice = parseChoiceSection(record.choice);
  const guides = parseGuideSection(record.guides);
  const feedback = parseFeedback(record.feedback);
  if (record.choice === undefined && record.guides === undefined && record.feedback === undefined) return undefined;
  return {
    ...(choice !== undefined ? { choice } : {}),
    ...(guides !== undefined ? { guides } : {}),
    feedback,
  };
}
