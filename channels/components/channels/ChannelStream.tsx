'use client'

import { VideoDeliveryPlayer } from '@portalshq/capability-video-delivery/react'
import { MediaEngagementTracker } from '@portalshq/analytics/media'
import { useEffect, useMemo, useState } from 'react'
import { recordChannelEvent } from '@/lib/analytics-client'
import type { Channel } from './data'

/* Structural type only: PlaybackObservation is not re-exported from /react. */
type Observation = { state: string; attempt: number }

export function useChannelStream(channel: Channel & { stream: string }) {
  const [observation, setObservation] = useState<Observation>({
    state: 'loading',
    attempt: 0,
  })
  const playback = useMemo(
    () => ({ sessionId: `channel-${channel.slug}`, playbackManifestUrl: channel.stream }),
    [channel.slug, channel.stream],
  )
  const { state, attempt } = observation
  const settled = state === 'playing'
  const message =
    state === 'error'
      ? 'This stream is resting. It will come back on its own.'
      : state === 'reconnecting'
        ? `Reconnecting, attempt ${attempt + 1}`
        : 'Tuning in'

  return { playback, state, attempt, settled, message, onObservation: setObservation }
}

/** The player itself. Callers own the frame and the status styling; this only
 *  decides when to mount and what the status line says, so both surfaces
 *  start on the same conditions. Mounting is the caller's job — render nothing
 *  until the surface is on screen and no stream is fetched for it. */
export function ChannelStream({
  channel,
  noteClassName,
  paused = false,
  muted = true,
  contentKind = 'live',
}: {
  channel: Channel & { stream: string }
  noteClassName: string
  paused?: boolean
  muted?: boolean
  contentKind?: 'live' | 'preview'
}) {
  const { playback, state, attempt, settled, message, onObservation } = useChannelStream(channel)
  const sessionId = playback.sessionId
  const tracker = useMemo(() => new MediaEngagementTracker(
    {record: (name, properties) => { recordChannelEvent(name, properties); return true }},
    {surface: contentKind === 'preview' ? 'channels_browse' : 'channels_room', channel_id: channel.slug,
      ...(channel.programId ? {program_id: channel.programId} : {}), content_id: sessionId,
      content_kind: contentKind, player_kind: 'hls'},
  ), [channel.programId, channel.slug, contentKind, sessionId])

  useEffect(() => {
    if (!paused) tracker.impression()
    tracker.setVisible(!paused)
  }, [paused, tracker])

  useEffect(() => {
    if (state === 'playing') { tracker.recovered(attempt); tracker.play() }
    else if (state === 'buffering' || state === 'reconnecting') tracker.buffering(attempt)
    else if (state === 'error') { tracker.failed('unknown', attempt); tracker.pause() }
  }, [attempt, state, tracker])

  /* Scrolling away parks the stream rather than destroying it: the element,
     the hls session and the buffer all survive, so coming back resumes where
     it was instead of refetching from the top. Only a real unmount tears the
     session down. The player does not expose the element, but it tags it with
     the session id, which is unique per channel. */
  useEffect(() => {
    const media = document.querySelector<HTMLVideoElement>(
      `[data-video-delivery-player="${sessionId}"]`,
    )
    if (!media) return
    const progress = () => tracker.progress(media.currentTime, media.duration)
    const ended = () => tracker.end('completed')
    const visibility = () => tracker.setDocumentVisible(!document.hidden)
    media.addEventListener('timeupdate', progress)
    media.addEventListener('ended', ended)
    document.addEventListener('visibilitychange', visibility)
    if (paused) media.pause()
    else void media.play().catch(() => {})
    return () => {
      media.removeEventListener('timeupdate', progress)
      media.removeEventListener('ended', ended)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [paused, sessionId, tracker])

  useEffect(() => () => tracker.end('unmounted'), [tracker])

  return (
    <>
      <VideoDeliveryPlayer
        playback={playback}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        aria-label={`${channel.title} channel preview`}
        onPlaybackObservation={onObservation}
      />
      {!settled && (
        /* data-state carries the failure state so the note can turn the error
           colour without either surface wrapping the player just for it. */
        <p className={noteClassName} data-state={state} role="status">
          {message}
        </p>
      )}
    </>
  )
}
