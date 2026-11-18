import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { GroupRoom } from '@/components/channels/GroupRoom'
import { codePattern } from '@/lib/audience'
import { groupSnapshot } from '@/lib/groups'
import { playerMetadata, requestOrigin, X_CARD_FALLBACK_IMAGE } from '@/lib/x-card'

type PageProps = { params: Promise<{ code: string }> }

const lookup = cache((code: string) => codePattern.test(code) ? groupSnapshot(code) : undefined)
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params
  const robots = { index: false, follow: false }
  if (!await lookup(code)) return { robots }
  return {
    ...playerMetadata(`/g/${code}`, X_CARD_FALLBACK_IMAGE,
      requestOrigin(await headers()), { title: 'channels', description: 'Rooms to gather, play, watch, and make your mark.' }, 'watch_party'),
    robots,
  }
}

export default async function Page({ params }: PageProps) {
  const { code } = await params
  const initial = await lookup(code)
  if (!initial) notFound()
  return <GroupRoom key={code} code={code} initial={initial} />
}
