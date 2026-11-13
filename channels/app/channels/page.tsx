import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { browseCopy } from '@/components/channels/data'

import { getChannelCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Browse every channel',
  description: browseCopy.detailLede,
}

export default async function ChannelsIndexPage() {
  return <ChannelsExperience channels={await getChannelCatalog()} />
}
