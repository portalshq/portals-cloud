import {NextResponse} from 'next/server'
import {leadPool} from '@/lib/leads/store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const result = await leadPool().query<{event_type: string; count: string}>(
      `SELECT event_type, count(*)::text AS count
       FROM px_telemetry_events
       GROUP BY event_type`,
    )
    const counts = {downloads: 0, installs: 0}
    for (const row of result.rows) {
      if (row.event_type === 'download') counts.downloads = Number(row.count)
      if (row.event_type === 'install') counts.installs = Number(row.count)
    }
    const metric = new URL(request.url).searchParams.get('metric')
    if (metric === 'installs' || metric === 'downloads') {
      const label = metric === 'installs' ? 'PX installs' : 'PX downloads'
      return NextResponse.json(
        {schemaVersion: 1, label, message: counts[metric].toLocaleString('en-US'), color: 'blue'},
        {headers: {'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'}},
      )
    }
    return NextResponse.json(counts, {
      headers: {'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'},
    })
  } catch (error) {
    console.error('PX public metrics could not be read:', error)
    return NextResponse.json({ok: false}, {status: 503, headers: {'Cache-Control': 'no-store'}})
  }
}
