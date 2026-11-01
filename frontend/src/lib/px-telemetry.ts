import {leadPool} from '@/lib/leads/store'

export type PxTelemetryEvent = 'download' | 'install'

export type PxTelemetryProperties = {
  anonymousId: string
  downloadId?: string
  version?: string
  platform?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
}

const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{32}$/

export function isAnonymousId(value: unknown): value is string {
  return typeof value === 'string' && ANONYMOUS_ID_PATTERN.test(value)
}

export async function recordUniquePxEvent(
  eventType: PxTelemetryEvent,
  properties: PxTelemetryProperties,
): Promise<boolean> {
  const result = await leadPool().query(
    `INSERT INTO px_telemetry_events (
       event_type, anonymous_id, download_id, version, platform,
       utm_source, utm_medium, utm_campaign, utm_content
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (event_type, anonymous_id) DO NOTHING
     RETURNING anonymous_id`,
    [
      eventType,
      properties.anonymousId,
      properties.downloadId || null,
      properties.version || null,
      properties.platform || null,
      properties.utmSource || null,
      properties.utmMedium || null,
      properties.utmCampaign || null,
      properties.utmContent || null,
    ],
  )
  return result.rowCount === 1
}

export async function sendPxTelemetryToMixpanel(
  eventType: PxTelemetryEvent,
  properties: PxTelemetryProperties,
): Promise<void> {
  const token = process.env.MIXPANEL_PROJECT_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
  if (!token) return

  const event = eventType === 'download' ? 'px_unique_download' : 'px_unique_install'
  const mixpanelProperties: Record<string, string | number> = {
    token,
    distinct_id: properties.anonymousId,
    $insert_id: `${event}:${properties.anonymousId}`,
    time: Math.floor(Date.now() / 1000),
  }
  if (properties.downloadId) mixpanelProperties.download_id = properties.downloadId
  if (properties.version) mixpanelProperties.version = properties.version
  if (properties.platform) mixpanelProperties.platform = properties.platform
  if (properties.utmSource) mixpanelProperties.utm_source = properties.utmSource
  if (properties.utmMedium) mixpanelProperties.utm_medium = properties.utmMedium
  if (properties.utmCampaign) mixpanelProperties.utm_campaign = properties.utmCampaign
  if (properties.utmContent) mixpanelProperties.utm_content = properties.utmContent

  try {
    await fetch('https://api.mixpanel.com/track', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify([{event, properties: mixpanelProperties}]),
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    })
  } catch {
    // The durable aggregate is stored locally; Mixpanel must not block installs or redirects.
  }
}
