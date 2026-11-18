import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { getProgramRoom } from '@/lib/catalog'
import { embedSurface } from '@/lib/room-preview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

/** X Player Card player: the program room, framed inside an X post. */
export default async function EmbedPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ variant?: string | string[] }>
}) {
  const [{ slug }, { variant }] = await Promise.all([params, searchParams])
  const channel = await getProgramRoom(slug)
  // Only registered program apps are embeddable.
  if (!channel?.app) notFound()
  return <ChannelsExperience channels={[]} channel={channel} surface={embedSurface(variant)} />
}
