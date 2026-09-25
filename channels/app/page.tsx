import { ChannelFeed } from '@/components/feed/ChannelFeed'

export const metadata = {
  title: 'channels',
  description: 'Rooms to gather, play, watch, and leave a mark.',
}

export default function HomePage() {
  return <ChannelFeed />
}
