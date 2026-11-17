import { createAuthGatewayClient } from '@portalshq/capability-identity'
import { createSegmentHttpTransport, createSegmentSink } from '@portalshq/analytics/adapters/segment'
import { createAnonymousIngestion, createVerifiedIdentifyIngestion } from '@portalshq/analytics/server'
import { createAnalyticsPreferenceStore, migrateAnalyticsPreferences } from '@portalshq/analytics/server'
import { channelRegistry } from './analytics-contract'
import { centralDb } from './admin/db'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let gateway: ReturnType<typeof createAuthGatewayClient> | undefined

function configured() {
  if (process.env.CHANNELS_ANALYTICS_ENABLED !== 'true') return null
  const writeKey = process.env.CHANNELS_SEGMENT_WRITE_KEY?.trim()
  const tenantId = process.env.CHANNELS_ANALYTICS_TENANT_ID?.trim()
  const appId = process.env.CHANNELS_ANALYTICS_APP_ID?.trim()
  if (!writeKey || !tenantId || !appId || !process.env.ADMIN_CENTRAL_DATABASE_URL?.trim()) throw new Error('Channels analytics is enabled but Segment attribution or the central preference database is incomplete')
  return {writeKey, attribution: {tenantId, appId}}
}

function identityProvider() {
  const address = process.env.AUTH_GATEWAY_TCP_ADDRESS?.trim()
  if (!address) throw new Error('Analytics identity verification is unavailable')
  gateway ??= createAuthGatewayClient({address, useTls: process.env.AUTH_GATEWAY_TLS?.trim().toLowerCase() === 'true'})
  return {getIdentity: async (token: string) => ({userId: (await gateway!.verifyUser(token)).userId})}
}

function bearer(request: Request) {
  return request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
}

export async function ingestChannelAnalytics(request: Request): Promise<Response> {
  let config: ReturnType<typeof configured>
  try { config = configured() } catch (error) { console.error('[channels analytics]', (error as Error).message); return new Response(null, {status: 503}) }
  if (!config) return new Response(null, {status: 404})
  const sink = createSegmentSink(createSegmentHttpTransport({writeKey: config.writeKey}))
  const isSuppressed = async (userId: string) => {
    const db = centralDb()
    await migrateAnalyticsPreferences(db)
    return createAnalyticsPreferenceStore(db).isSuppressed(userId)
  }
  const ingest = createAnonymousIngestion({
    registry: channelRegistry(), sink, attribution: config.attribution,
    isSuppressed,
    resolveContext: async (incoming) => {
      const token = bearer(incoming)
      if (!token) return undefined
      const anonymousId = incoming.headers.get('x-analytics-anonymous-id') ?? ''
      if (!uuid.test(anonymousId)) throw new Error('Invalid analytics identity')
      const {userId} = await identityProvider().getIdentity(token)
      return {userId, anonymousId, attribution: config!.attribution}
    },
  })
  return ingest(request)
}

export async function identifyChannelAnalytics(request: Request): Promise<Response> {
  let config: ReturnType<typeof configured>
  try { config = configured() } catch (error) { console.error('[channels analytics]', (error as Error).message); return new Response(null, {status: 503}) }
  if (!config) return new Response(null, {status: 404})
  const sink = createSegmentSink(createSegmentHttpTransport({writeKey: config.writeKey}))
  try {
    const db = centralDb()
    await migrateAnalyticsPreferences(db)
    return createVerifiedIdentifyIngestion({provider: identityProvider(), sink, isSuppressed: createAnalyticsPreferenceStore(db).isSuppressed})(request)
  } catch (error) {
    console.error('[channels analytics preference]', error)
    return new Response(null, {status: 503})
  }
}

export async function readChannelAnalyticsPreference(request: Request): Promise<Response> {
  try {
    if (!configured()) return new Response(JSON.stringify({suppressed: false}), {status: 200, headers: {'Content-Type': 'application/json'}})
    const token = bearer(request)
    if (!token) return new Response(JSON.stringify({suppressed: false}), {status: 200, headers: {'Content-Type': 'application/json'}})
    const {userId} = await identityProvider().getIdentity(token)
    const db = centralDb()
    await migrateAnalyticsPreferences(db)
    const suppressed = await createAnalyticsPreferenceStore(db).isSuppressed(userId)
    return Response.json({suppressed})
  } catch (error) {
    console.error('[channels analytics preference]', error)
    return new Response(null, {status: 503})
  }
}

export async function updateChannelAnalyticsPreference(request: Request): Promise<Response> {
  try {
    if (!configured()) return new Response(null, {status: 404})
    const token = bearer(request)
    if (!token) return new Response(null, {status: 401})
    const body = await request.json() as {suppressed?: unknown}
    if (typeof body.suppressed !== 'boolean') return new Response(null, {status: 400})
    const {userId} = await identityProvider().getIdentity(token)
    const db = centralDb()
    await migrateAnalyticsPreferences(db)
    await createAnalyticsPreferenceStore(db).setSuppressed(userId, body.suppressed)
    return new Response(null, {status: 204})
  } catch (error) {
    console.error('[channels analytics preference]', error)
    return new Response(null, {status: 503})
  }
}
