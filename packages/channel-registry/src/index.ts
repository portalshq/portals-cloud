import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const secretRef = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const entityUri = z.string().regex(/^px:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+$/);

const channel = z.object({
  controlEndpoint: z.union([z.string().url(), z.string().regex(/^\$\{[A-Z][A-Z0-9_]*\}$/)]),
  queueTokenEnv: secretRef,
  requiredEntities: z.array(entityUri).min(1),
  // Capability-specific settings are validated by their owning package.
  interactions: z.record(z.string(), z.unknown()).optional(),
  // Welcome bonus for new registrants, granted by the app on first verified
  // identity. `bonus-credits: 0` disables the grant.
  signup: z.object({ "bonus-credits": z.number().int().nonnegative() }).optional(),
  youtube: z.object({ liveChatId: z.string().min(1), clientIdEnv: secretRef, clientSecretEnv: secretRef, refreshTokenEnv: secretRef }).optional(),
  twitch: z.object({ broadcasterUserId: z.string().min(1), userId: z.string().min(1), clientIdEnv: secretRef, clientSecretEnv: secretRef, refreshTokenEnv: secretRef }).optional(),
});

const registrySchema = z.object({
  channels: z.record(z.string().regex(/^[\w.-]+$/), channel),
  entities: z.record(entityUri, z.object({ id: entityUri }).passthrough()).default({}),
  entitiesFetchedAt: z.string().datetime().optional(),
});

/** Validate without refreshing manifests or writing the registry. */
export function parseChannelRegistry(value: unknown) {
  return registrySchema.parse(value);
}

export type Channel = z.infer<typeof channel>;
export type EntityManifest = { id: string } & Record<string, unknown>;
export type RegistryData = z.infer<typeof registrySchema>;

export type ChannelRegistry = {
  get(channelId: string): Channel;
  manifests(channelId: string): readonly EntityManifest[];
  refresh(): Promise<void>;
};

export function openChannelRegistry(options: {
  filePath: string;
  resolveManifests(uris: readonly string[]): Promise<readonly EntityManifest[]>;
}): ChannelRegistry {
  let current: RegistryData | undefined;

  function requireCurrent(): RegistryData {
    if (!current) throw new Error("Channel registry has not been refreshed.");
    return current;
  }

  return {
    get(channelId) {
      const value = requireCurrent().channels[channelId];
      if (!value) throw new Error(`Unknown channel: ${channelId}`);
      return value;
    },
    manifests(channelId) {
      const registry = requireCurrent();
      return this.get(channelId).requiredEntities.map((uri) => registry.entities[uri]).filter((entity): entity is EntityManifest => Boolean(entity));
    },
    async refresh() {
      const filePath = path.resolve(options.filePath);
      const parsed = parseChannelRegistry(JSON.parse(await readFile(filePath, "utf8")));
      const uris = [...new Set(Object.values(parsed.channels).flatMap((value) => value.requiredEntities))];
      const manifests = await options.resolveManifests(uris);
      if (manifests.length !== uris.length) throw new Error("Every required PX entity must resolve before the registry can refresh.");
      const entities = Object.fromEntries(manifests.map((manifest) => [manifest.id, manifest]));
      const refreshed = { ...parsed, entities, entitiesFetchedAt: new Date().toISOString() };
      const temporary = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(refreshed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, filePath);
      current = refreshed;
    },
  };
}
