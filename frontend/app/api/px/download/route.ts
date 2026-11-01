import {after, NextResponse} from 'next/server'
import {installerForPlatform, type InstallerPlatform} from '../telemetry-config'
import {recordUniquePxEvent, sendPxTelemetryToMixpanel, type PxTelemetryProperties} from '@/lib/px-telemetry'

export const runtime = 'nodejs'

const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{32}$/

function boundedParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim()
  return value ? value.slice(0, 160) : undefined
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const platformUrl = installerForPlatform(params.get('platform'))
  if (!platformUrl) {
    return NextResponse.json({ok: false}, {status: 400, headers: {'Cache-Control': 'no-store'}})
  }
  const platform: InstallerPlatform = params.get('platform') === 'windows' ? 'windows' : 'unix'
  const suppliedId = params.get('download_id') || ''
  const anonymousId = ANONYMOUS_ID_PATTERN.test(suppliedId) ? suppliedId : undefined
  const properties: PxTelemetryProperties = {
    anonymousId: anonymousId || '',
    platform,
    utmSource: boundedParam(params, 'utm_source'),
    utmMedium: boundedParam(params, 'utm_medium'),
    utmCampaign: boundedParam(params, 'utm_campaign'),
    utmContent: boundedParam(params, 'utm_content'),
  }

  if (anonymousId) {
    try {
      const inserted = await recordUniquePxEvent('download', properties)
      if (inserted) after(() => sendPxTelemetryToMixpanel('download', properties))
    } catch (error) {
      console.error('PX download telemetry could not be recorded:', error)
    }
  }

  const response = NextResponse.redirect(platformUrl, 302)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
