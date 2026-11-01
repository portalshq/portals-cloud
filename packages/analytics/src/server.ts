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
export function createAnonymousIngestion(options: {registry: import('./index.js').Registry; sink: Sink; maxBytes?: number; maxEvents?: number; resolveContext?: (request: Request) => Promise<TrustedRequestContext | undefined>}) {
  const maxBytes = options.maxBytes ?? 16_384, maxEvents = options.maxEvents ?? 20;
  return async (request: Request): Promise<Response> => {
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
      if (!userId || userId.length > 128 || userId.includes('@') || !uuid.test(anonymousId) || !attribution || ![attribution.tenantId, attribution.appId].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)) || observations.some(event => event.identity?.anonymousId !== anonymousId)) return new Response(null, {status: 403});
      observations = observations.map(event => ({...event, identity: {anonymousId, userId}, attribution: {tenantId: attribution.tenantId, appId: attribution.appId}}));
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
