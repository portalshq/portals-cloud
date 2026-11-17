import type { Attribution, Observation, Sink } from "./index.js";

/** Compatible with IdentityProvider.getIdentity; token verification belongs to the provider. */
export interface VerifiedIdentityProvider { getIdentity(accessToken: string): Promise<{userId: string}> }

/** Bind an anonymous analytics ID only after the identity package verifies the credential. */
export async function identifyVerified(provider: VerifiedIdentityProvider, accessToken: string, anonymousId: string, sink: Sink): Promise<void> {
  if (!accessToken || !anonymousId || anonymousId.length > 128 || anonymousId.includes("@")) throw new Error("Invalid analytics identity");
  const {userId} = await provider.getIdentity(accessToken);
  if (!userId || userId.length > 128 || userId.includes("@")) throw new Error("Invalid verified user ID");
  if (!sink.identify) throw new Error("Analytics sink does not support identify");
  await sink.identify({anonymousId, userId});
}

/** The host supplies trusted attribution and chooses an independent delivery mechanism. */
export function createSourceIntegration<T>(options: {map: (record: T) => Observation | undefined; sink: Sink; attribution: Attribution}) {
  const {tenantId, appId} = options.attribution;
  if (![tenantId, appId].every(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error("Invalid analytics attribution");
  return async (record: T): Promise<boolean> => {
    const event = options.map(record);
    if (!event) return false;
    await options.sink.send([{...event, attribution: {tenantId, appId}}]);
    return true;
  };
}
/** Replay uses retained committed records. It never changes source delivery acknowledgements. */
export async function replay<T>(records: AsyncIterable<T> | Iterable<T>, map: (record: T) => Observation | undefined, sink: Sink): Promise<{sent: number; skipped: number}> {
  let sent = 0, skipped = 0;
  for await (const record of records) {
    const event = map(record);
    if (!event) { skipped++; continue; }
    await sink.send([event]);
    sent++;
  }
  return {sent, skipped};
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Framework-neutral anonymous ingestion. Authenticated identity must be resolved separately. */
export interface TrustedRequestContext {
  userId: string;
  anonymousId: string;
  attribution: Attribution;
}
const attributionId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function createAnonymousIngestion(options: {
  registry: import('./index.js').Registry;
  sink: Sink;
  /** Trusted application attribution, also applied to anonymous batches. */
  attribution?: Attribution;
  maxBytes?: number;
  maxEvents?: number;
  resolveContext?: (request: Request) => Promise<TrustedRequestContext | undefined>;
  isSuppressed?: (userId: string) => Promise<boolean>;
}) {
  const maxBytes = options.maxBytes ?? 16_384, maxEvents = options.maxEvents ?? 20;
  if (options.attribution && ![options.attribution.tenantId, options.attribution.appId].every(attributionId)) throw new Error('Invalid analytics attribution');
  return async (request: Request): Promise<Response> => {
    if (request.headers.get('sec-gpc') === '1') return new Response(null, {status: 204});
    if (Number(request.headers.get('content-length') || 0) > maxBytes) return new Response(null, {status: 413});
    let observations: Observation[];
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).length > maxBytes) return new Response(null, {status: 413});
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
      const events = (parsed as Record<string, unknown>).events;
      if (!Array.isArray(events) || !events.length || events.length > maxEvents) throw new Error('Invalid events');
      observations = events.map((value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event');
        const event = value as Record<string, unknown>;
        const identity = event.identity as Record<string, unknown> | null;
        if (typeof event.id !== 'string' || !uuid.test(event.id) || typeof event.name !== 'string' || event.provenance !== 'client' || typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt)) || !identity || typeof identity !== 'object' || typeof identity.anonymousId !== 'string' || !uuid.test(identity.anonymousId) || identity.userId !== undefined || !event.properties || typeof event.properties !== 'object' || Array.isArray(event.properties)) throw new Error('Invalid event');
        const properties = event.properties as Observation['properties'];
        const definition = options.registry.validate(event.name, properties);
        if (event.version !== definition.version) throw new Error('Invalid version');
        return {id: event.id, name: event.name, version: definition.version, occurredAt: event.occurredAt, provenance: 'client', properties, identity: {anonymousId: identity.anonymousId}};
      });
    } catch { return new Response(null, {status: 400}); }
    let context: TrustedRequestContext | undefined;
    try { context = await options.resolveContext?.(request); }
    catch { return new Response(null, {status: 401}); }
    if (context) {
      const {userId, anonymousId, attribution} = context;
      if (!userId || userId.length > 128 || userId.includes('@') || !uuid.test(anonymousId) || !attribution || ![attribution.tenantId, attribution.appId].every(attributionId) || observations.some(event => event.identity?.anonymousId !== anonymousId)) return new Response(null, {status: 403});
      if (await options.isSuppressed?.(userId)) return new Response(null, {status: 204});
      observations = observations.map(event => ({...event, identity: {anonymousId, userId}, attribution: {tenantId: attribution.tenantId, appId: attribution.appId}}));
    } else if (options.attribution) {
      observations = observations.map(event => ({...event, attribution: {...options.attribution!}}));
    }
    try {
      if (context) {
        if (!options.sink.identify) throw new Error('Sink does not support identify');
        await options.sink.identify({anonymousId: context.anonymousId, userId: context.userId});
      }
      await options.sink.send(observations); return new Response(null, {status: 204});
    }
    catch { return new Response(null, {status: 502}); }
  };
}

function bearer(request: Request): string | undefined {
  const value = request.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7).trim() || undefined : undefined;
}

/** Server endpoint for linking the recorder UUID to an identity verified by the host provider. */
export function createVerifiedIdentifyIngestion(options: {
  provider: VerifiedIdentityProvider;
  sink: Sink;
  isSuppressed?: (userId: string) => Promise<boolean>;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(null, {status: 403});
    const accessToken = bearer(request);
    if (!accessToken) return new Response(null, {status: 401});
    let anonymousId: string;
    try {
      const body = await request.json() as {anonymousId?: unknown};
      if (typeof body.anonymousId !== 'string' || !uuid.test(body.anonymousId)) throw new Error('Invalid anonymous ID');
      anonymousId = body.anonymousId;
    } catch { return new Response(null, {status: 400}); }
    try {
      const identity = await options.provider.getIdentity(accessToken);
      if (!identity.userId || identity.userId.length > 128 || identity.userId.includes('@')) return new Response(null, {status: 403});
      if (await options.isSuppressed?.(identity.userId)) return new Response(null, {status: 204});
      if (!options.sink.identify) return new Response(null, {status: 503});
      await options.sink.identify({anonymousId, userId: identity.userId});
      return new Response(null, {status: 204});
    } catch { return new Response(null, {status: 401}); }
  };
}

export interface AnalyticsPreferenceDatabase {
  query(sql: string, params?: unknown[]): Promise<{rows: Record<string, unknown>[]}>;
}
export interface AnalyticsPreferenceStore {
  isSuppressed(userId: string): Promise<boolean>;
  setSuppressed(userId: string, suppressed: boolean): Promise<void>;
}
const opaqueUserId = (value: string) => Boolean(value && value.length <= 128 && !value.includes('@'));

/** Apply the small platform preference table to the caller's central database. */
export async function migrateAnalyticsPreferences(db: AnalyticsPreferenceDatabase): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS portals_analytics_preferences (
    user_id text PRIMARY KEY,
    suppressed boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}

export function createAnalyticsPreferenceStore(db: AnalyticsPreferenceDatabase): AnalyticsPreferenceStore {
  return {
    async isSuppressed(userId) {
      if (!opaqueUserId(userId)) throw new Error('Invalid opaque user ID');
      const result = await db.query('SELECT suppressed FROM portals_analytics_preferences WHERE user_id=$1', [userId]);
      return result.rows[0]?.suppressed === true;
    },
    async setSuppressed(userId, suppressed) {
      if (!opaqueUserId(userId)) throw new Error('Invalid opaque user ID');
      await db.query(`INSERT INTO portals_analytics_preferences(user_id,suppressed) VALUES($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET suppressed=EXCLUDED.suppressed, updated_at=now()`, [userId, suppressed]);
    },
  };
}
