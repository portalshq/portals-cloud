import { ChannelFeed } from '@/components/feed/ChannelFeed'

import { getChannelCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'channels',
  description: 'Rooms to gather, play, watch, and leave a mark.',
}

export default async function HomePage() {
  return <ChannelFeed channels={await getChannelCatalog()} />
}
