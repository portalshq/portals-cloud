import { ChannelsExperience } from '@/components/channels/ChannelsExperience'
import { browseCopy } from '@/components/channels/data'

export const metadata = {
  title: 'Browse every channel',
  description: browseCopy.detailLede,
}

export default function ChannelsIndexPage() {
  return <ChannelsExperience />
}
