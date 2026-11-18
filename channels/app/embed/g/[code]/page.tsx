import { notFound } from 'next/navigation'
import { GroupRoom } from '@/components/channels/GroupRoom'
import { codePattern } from '@/lib/audience'
import { groupSnapshot } from '@/lib/groups'

export const metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!codePattern.test(code)) notFound()
  const initial = await groupSnapshot(code)
  if (!initial) notFound()
  return <GroupRoom key={code} code={code} initial={initial} framed />
}
