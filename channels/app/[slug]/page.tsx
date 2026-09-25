import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { channels } from '@/components/channels/data'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const channel = channels.find((entry) => entry.slug === slug)
  if (!channel) return { title: 'Not found' }
  return { title: `${channel.title} · ${channel.by}`, description: channel.description }
}

export function generateStaticParams() {
  return channels.map((channel) => ({ slug: channel.slug }))
}

export default async function ChannelPage({ params }: Params) {
  const { slug } = await params
  if (!channels.some((entry) => entry.slug === slug)) notFound()
  return <ChannelsExperience slug={slug} />
}
