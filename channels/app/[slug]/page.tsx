import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { channelEntryHref, channelOffAir } from '@/components/channels/data'
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
  /* A program room only exists while the program is on air. Off air there is
     no room to enter — the room URL hands off to the channel's feed panel,
     which already shows the room content and lets the reader scroll on. An
     unreachable preview still mounts the room so the app can report its own
     state. */
  if (channel.app && channelOffAir(channel)) redirect(channelEntryHref(channel))
  return <ChannelsExperience channels={[]} channel={channel} />
}
