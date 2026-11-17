import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { getChannelCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

/** X Player Card player: the program room, framed inside an X post. */
export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const channel = (await getChannelCatalog()).find((entry) => entry.slug === slug)
  // Only registered program apps are embeddable.
  if (!channel?.app) notFound()
  return <ChannelsExperience channels={[]} channel={channel} embed />
}
