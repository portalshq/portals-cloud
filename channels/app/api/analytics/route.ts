import { createSegmentHttpTransport, createSegmentSink } from '@portalshq/analytics/adapters/segment'
import { createAnonymousIngestion } from '@portalshq/analytics/server'
import { channelRegistry } from '../../../lib/analytics-contract'

const registry = channelRegistry()
export async function POST(request: Request) {
  const key = process.env.CHANNELS_SEGMENT_WRITE_KEY
  if (process.env.CHANNELS_ANALYTICS_ENABLED !== 'true' || !key) return new Response(null, {status: 503})
  return createAnonymousIngestion({registry, sink: createSegmentSink(createSegmentHttpTransport({writeKey: key}))})(request)
}
