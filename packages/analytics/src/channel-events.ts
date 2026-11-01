import { Registry } from './index.js';
/** Shared names describe UI observations, not durable follow or share delivery. */
export const channelEvents = {
  follow: 'custom.channel_follow_toggled',
  shareAttempt: 'custom.channel_share_attempted',
  shareResult: 'custom.channel_share_result',
} as const;
export function createChannelRegistry(channelIds: readonly string[]): Registry {
  const registry = new Registry();
  const channel = {type: 'enum' as const, values: channelIds};
  registry.registerCustom({name: channelEvents.follow, version: 1, purpose: 'Measure local follow control use', properties: {channel, following: {type: 'boolean'}}});
  registry.registerCustom({name: channelEvents.shareAttempt, version: 1, purpose: 'Measure attempts to copy channel links', properties: {channel}});
  registry.registerCustom({name: channelEvents.shareResult, version: 1, purpose: 'Measure clipboard success and failure', properties: {channel, outcome: {type: 'enum', values: ['copied', 'failed']}}});
  return registry;
}
