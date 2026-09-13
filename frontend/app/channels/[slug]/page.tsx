import { ChannelsExperience } from '@/components/channels/ChannelsExperience'

export default async function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ChannelsExperience initialSlug={slug} />
}
