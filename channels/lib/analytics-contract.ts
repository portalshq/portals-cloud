import { createChannelRegistry } from '@portalshq/analytics/channel-events'
import { channels } from '../components/channels/data'

export { channelEvents } from '@portalshq/analytics/channel-events'
export function channelRegistry() { return createChannelRegistry(channels.map(item => item.slug)) }
