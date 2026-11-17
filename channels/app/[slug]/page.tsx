import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { getChannelCatalog } from '@/lib/catalog'
import { requestOrigin, roomMetadata } from '@/lib/x-card'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const channel = (await getChannelCatalog()).find((entry) => entry.slug === slug)
  if (!channel) return { title: 'Not found' }
  const base = { title: `${channel.title} · ${channel.by}`, description: channel.metadataDescription ?? channel.description }
  return roomMetadata(channel, requestOrigin(await headers()), base)
}

export default async function ChannelPage({ params }: Params) {
  const { slug } = await params
  const channel = (await getChannelCatalog()).find((entry) => entry.slug === slug)
  if (!channel) notFound()
  return <ChannelsExperience channels={[]} channel={channel} />
}
