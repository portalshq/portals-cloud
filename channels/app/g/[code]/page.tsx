import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { GroupRoom } from '@/components/channels/GroupRoom'
import { codePattern } from '@/lib/audience'
import { groupDestinations, groupSnapshot } from '@/lib/groups'
import { playerMetadata, requestOrigin, X_CARD_FALLBACK_IMAGE } from '@/lib/x-card'

type PageProps = { params: Promise<{ code: string }> }

const lookup = cache((code: string) => codePattern.test(code) ? groupSnapshot(code) : undefined)
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params
  const robots = { index: false, follow: false }
  const group = await lookup(code)
  if (!group) return { robots }
  return {
    ...playerMetadata(`/g/${code}`, X_CARD_FALLBACK_IMAGE,
      requestOrigin(await headers()), {
        title: `${group.name} · channels`,
        description: 'Watch the current program together. This player follows the group when it moves.',
      }, 'watch_party'),
    robots,
  }
}

export default async function Page({ params }: PageProps) {
  const { code } = await params
  const initial = await lookup(code)
  if (!initial) notFound()
  return <GroupRoom key={code} code={code} initial={initial} destinations={await groupDestinations()} />
}
