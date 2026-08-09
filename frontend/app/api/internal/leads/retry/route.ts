import {NextResponse} from 'next/server'
import {hashValue} from '@/lib/leads/crypto'
import {processLeadOutbox} from '@/lib/leads/processor'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET || ''
  const received = authorization.replace(/^Bearer /, '')
  if (!expected || hashValue(received) !== hashValue(expected)) {
    return NextResponse.json({ok: false}, {status: 401})
  }
  await processLeadOutbox(50)
  return NextResponse.json({ok: true})
}
