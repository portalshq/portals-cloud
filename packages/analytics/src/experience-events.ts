import { Registry, type PropertyRule } from './index.js';

const optional = <T extends PropertyRule>(rule: T): T => ({ ...rule, required: false });
const identifier = { type: 'string', maxLength: 128, pattern: '^[A-Za-z0-9_.:-]{1,128}$' } as const;
const shortIdentifier = { type: 'string', maxLength: 64, pattern: '^[A-Za-z0-9_.-]{1,64}$' } as const;
const route = { type: 'string', maxLength: 128, pattern: '^/[A-Za-z0-9_./-]{0,127}$' } as const;
const outcome = { type: 'enum', values: ['succeeded', 'failed', 'cancelled', 'pending', 'rate_limited', 'unauthorized', 'unavailable'] } as const;

export const experienceEvents = {
  pageViewed: 'custom.page_viewed',
  channelCardImpression: 'custom.channel_card_impression',
  channelOpened: 'custom.channel_opened',
  channelSearchUsed: 'custom.channel_search_used',
  channelFilterChanged: 'custom.channel_filter_changed',
  ctaActivated: 'custom.cta_activated',
  mediaImpression: 'custom.media_impression',
  mediaStarted: 'custom.media_started',
  mediaEngaged: 'custom.media_engaged',
  mediaProgress: 'custom.media_progress',
  mediaWatchTime: 'custom.media_watch_time',
  mediaBuffered: 'custom.media_buffered',
  mediaRecovered: 'custom.media_recovered',
  mediaFailed: 'custom.media_failed',
  mediaEnded: 'custom.media_ended',
  mediaControlUsed: 'custom.media_control_used',
  followResult: 'custom.follow_result',
  shareResult: 'custom.share_result',
  reminderPromptOpened: 'custom.reminder_prompt_opened',
  reminderSaveResult: 'custom.reminder_save_result',
  authStarted: 'custom.auth_started',
  authResult: 'custom.auth_result',
  authSignedOut: 'custom.auth_signed_out',
  checkoutStarted: 'custom.checkout_started',
  checkoutResult: 'custom.checkout_result',
  pwaInstallResult: 'custom.pwa_install_result',
  communityPanelToggled: 'custom.community_panel_toggled',
  chatSendResult: 'custom.chat_send_result',
  noteSubmitResult: 'custom.note_submit_result',
  noteLikeResult: 'custom.note_like_result',
  reactionSendResult: 'custom.reaction_send_result',
  interactionPresented: 'custom.interaction_presented',
  interactionSubmissionResult: 'custom.interaction_submission_result',
} as const;

export type ExperienceEventName = typeof experienceEvents[keyof typeof experienceEvents];

const context = {
  surface: shortIdentifier,
  channel_id: optional(identifier),
  program_id: optional(identifier),
  content_id: optional(identifier),
};

const media = {
  ...context,
  content_kind: { type: 'enum', values: ['live', 'on_demand', 'preview', 'demo'] } as const,
  player_kind: { type: 'enum', values: ['hls', 'mp4', 'reactor', 'native', 'other'] } as const,
  media_session_id: identifier,
};

/** Register the shared, privacy-reviewed browser event catalog on a host registry. */
export function registerExperienceEvents(registry: Registry): Registry {
  const register = (name: ExperienceEventName, purpose: string, properties: Record<string, PropertyRule>) =>
    registry.registerCustom({ name, purpose, version: 1, properties });

  register(experienceEvents.pageViewed, 'Measure privacy-safe page acquisition', {
    ...context, route, entry_source: { type: 'enum', values: ['direct', 'referral', 'search', 'social', 'email', 'channel_host', 'unknown'] },
    utm_source: optional(shortIdentifier), utm_medium: optional(shortIdentifier), utm_campaign: optional(shortIdentifier),
  });
  register(experienceEvents.channelCardImpression, 'Measure visible channel discovery', { ...context, channel_id: identifier, position: { type: 'number' }, featured: { type: 'boolean' } });
  register(experienceEvents.channelOpened, 'Measure channel entry from a discovery surface', { ...context, channel_id: identifier, origin: { type: 'enum', values: ['featured', 'grid', 'direct', 'embed', 'unknown'] } });
  register(experienceEvents.channelSearchUsed, 'Measure search utility without collecting query text', { ...context, results: { type: 'number' }, query_length_bucket: { type: 'enum', values: ['none', 'short', 'medium', 'long'] } });
  register(experienceEvents.channelFilterChanged, 'Measure channel filter use', { ...context, filter: shortIdentifier, enabled: { type: 'boolean' } });
  register(experienceEvents.ctaActivated, 'Measure calls to action', { ...context, cta: shortIdentifier });

  register(experienceEvents.mediaImpression, 'Measure qualified media visibility', media);
  register(experienceEvents.mediaStarted, 'Measure successful playback starts', { ...media, startup_ms: optional({ type: 'number' }) });
  register(experienceEvents.mediaEngaged, 'Measure ten active seconds of playback', { ...media, active_ms: { type: 'number' } });
  register(experienceEvents.mediaProgress, 'Measure on-demand completion milestones', { ...media, milestone: { type: 'enum', values: ['p25', 'p50', 'p75', 'p90', 'p100'] }, completion_percent: { type: 'number' } });
  register(experienceEvents.mediaWatchTime, 'Measure sparse live watch-time milestones', { ...media, milestone: { type: 'enum', values: ['s30', 'm1', 'm5', 'm15'] }, active_ms: { type: 'number' } });
  register(experienceEvents.mediaBuffered, 'Measure completed playback stalls', { ...media, duration_ms: { type: 'number' }, attempt: { type: 'number' } });
  register(experienceEvents.mediaRecovered, 'Measure recovery from playback interruption', { ...media, recovery_ms: { type: 'number' }, attempt: { type: 'number' } });
  register(experienceEvents.mediaFailed, 'Measure classified playback failures', { ...media, error_kind: { type: 'enum', values: ['network', 'media', 'manifest', 'autoplay', 'unknown'] }, attempt: { type: 'number' } });
  register(experienceEvents.mediaEnded, 'Measure final active viewing and reliability', {
    ...media, active_ms: { type: 'number' }, elapsed_ms: { type: 'number' }, completion_percent: { type: 'number' },
    buffer_ms: { type: 'number' }, buffer_count: { type: 'number' }, recovery_count: { type: 'number' },
    end_reason: { type: 'enum', values: ['completed', 'interrupted', 'page_hidden', 'unmounted', 'replaced', 'failed', 'unknown'] },
  });
  register(experienceEvents.mediaControlUsed, 'Measure media control intent', { ...media, control: { type: 'enum', values: ['play', 'pause', 'mute', 'unmute', 'fullscreen_enter', 'fullscreen_exit', 'replay'] } });

  register(experienceEvents.followResult, 'Measure confirmed follow changes', { ...context, following: { type: 'boolean' }, outcome });
  register(experienceEvents.shareResult, 'Measure share intent and completion', { ...context, share_kind: { type: 'enum', values: ['channel', 'episode', 'scene', 'squad', 'other'] }, outcome });
  register(experienceEvents.reminderPromptOpened, 'Measure reminder funnel entry', context);
  register(experienceEvents.reminderSaveResult, 'Measure reminder preference outcomes', { ...context, outcome, episode: { type: 'boolean' }, weekly: { type: 'boolean' }, verification_required: { type: 'boolean' } });
  register(experienceEvents.authStarted, 'Measure sign-in funnel entry', { ...context, method: { type: 'enum', values: ['hosted', 'password', 'unknown'] } });
  register(experienceEvents.authResult, 'Measure sign-in outcomes', { ...context, method: { type: 'enum', values: ['hosted', 'password', 'unknown'] }, outcome });
  register(experienceEvents.authSignedOut, 'Measure verified sign-out', context);
  register(experienceEvents.checkoutStarted, 'Measure checkout funnel entry', { ...context, product_key: shortIdentifier });
  register(experienceEvents.checkoutResult, 'Measure checkout outcomes', { ...context, product_key: shortIdentifier, outcome });
  register(experienceEvents.pwaInstallResult, 'Measure application installation', { ...context, outcome });
  register(experienceEvents.communityPanelToggled, 'Measure optional community surface use', { ...context, feature: { type: 'enum', values: ['chat', 'notes'] }, open: { type: 'boolean' }, trigger: { type: 'enum', values: ['manual', 'automatic', 'unknown'] } });
  register(experienceEvents.chatSendResult, 'Measure chat outcomes without message content', { ...context, outcome });
  register(experienceEvents.noteSubmitResult, 'Measure note outcomes without note content', { ...context, block_id: identifier, outcome });
  register(experienceEvents.noteLikeResult, 'Measure note-like outcomes', { ...context, block_id: optional(identifier), liked: { type: 'boolean' }, outcome });
  register(experienceEvents.reactionSendResult, 'Measure reaction outcomes', { ...context, reaction: shortIdentifier, outcome });
  register(experienceEvents.interactionPresented, 'Measure viewer interaction exposure', { ...context, interaction_kind: { type: 'enum', values: ['choice', 'guide', 'feedback'] }, window_id: identifier });
  register(experienceEvents.interactionSubmissionResult, 'Measure interaction UI outcomes', { ...context, interaction_kind: { type: 'enum', values: ['choice', 'guide', 'feedback'] }, window_id: identifier, outcome });
  return registry;
}

export function createExperienceRegistry(): Registry {
  return registerExperienceEvents(new Registry());
}
