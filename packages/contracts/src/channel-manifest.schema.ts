import { z } from "zod";

/**
 * A Channel is a declarative composition of capabilities + a world template.
 * Developers write one of these instead of writing infrastructure. This is
 * the file the SDK CLI reads, validates, and deploys.
 *
 * Deliberately format-agnostic: a branching-film channel, a live game-show
 * channel, and a text/image channel are all just different capability
 * selections against the same manifest shape — there is no separate
 * "channel type" concept in the runtime.
 */
export const CapabilityRefSchema = z.object({
  capabilityId: z.string(),       // must match a CapabilityContract.id in the registry
  version: z.string().optional(), // pin a version; defaults to latest compatible
  config: z.record(z.unknown()).optional(),
});

export const ChannelManifestSchema = z.object({
  apiVersion: z.literal("nap/v1"),
  kind: z.literal("Channel"),
  metadata: z.object({
    name: z.string(),
    owner: z.string(),           // provider/developer id
    description: z.string().optional(),
  }),
  spec: z.object({
    worldTemplate: z.string(),               // NAP address of the world template
    narrativeRef: z.string().optional(),     // NAP address, if this channel uses narrative state
    capabilities: z.array(CapabilityRefSchema).min(1),
    visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  }),
});
export type ChannelManifest = z.infer<typeof ChannelManifestSchema>;
