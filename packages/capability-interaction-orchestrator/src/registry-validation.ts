import { parseInteractionSettings, type InteractionSettings } from "./interactions-config.js";

export interface ChannelInteractionSettings {
  channel: string;
  settings: InteractionSettings | undefined;
}

/**
 * Validate every channel's `interactions` block against the capability parsers.
 * Pure — no I/O, no database, no PX lookup — so a registry check never touches
 * network or credentials. Throws with every channel and setting named, rather
 * than stopping at the first problem.
 */
export function validateRegistryInteractions(registry: unknown): ChannelInteractionSettings[] {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new TypeError("registry must be an object");
  }
  const channels = (registry as { channels?: unknown }).channels;
  if (!channels || typeof channels !== "object" || Array.isArray(channels)) {
    throw new TypeError("registry.channels must be an object");
  }
  const problems: string[] = [];
  const parsed: ChannelInteractionSettings[] = [];
  for (const [channel, value] of Object.entries(channels)) {
    if (!value || typeof value !== "object") {
      problems.push(`${channel}: channel entry must be an object`);
      continue;
    }
    try {
      parsed.push({
        channel,
        settings: parseInteractionSettings((value as { interactions?: unknown }).interactions),
      });
    } catch (cause) {
      problems.push(`${channel}: ${(cause as Error).message}`);
    }
  }
  if (problems.length) {
    throw new TypeError(`Invalid channel interaction settings:\n  - ${problems.join("\n  - ")}`);
  }
  return parsed;
}
