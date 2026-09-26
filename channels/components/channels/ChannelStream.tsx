'use client'

import { VideoDeliveryPlayer } from '@portalshq/capability-video-delivery/react'
import { useEffect, useMemo, useState } from 'react'
import type { Channel } from './data'

/* Structural type only: PlaybackObservation is not re-exported from /react. */
type Observation = { state: string; attempt: number }

export function useChannelStream(channel: Channel) {
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

  return { playback, state, settled, message, onObservation: setObservation }
}

/** The player itself. Callers own the frame and the status styling; this only
 *  decides when to mount and what the status line says, so both surfaces
 *  start on the same conditions. Mounting is the caller's job — render nothing
 *  until the surface is on screen and no stream is fetched for it. */
export function ChannelStream({
  channel,
  noteClassName,
  paused = false,
}: {
  channel: Channel
  noteClassName: string
  paused?: boolean
}) {
  const { playback, state, settled, message, onObservation } = useChannelStream(channel)
  const sessionId = playback.sessionId

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
    if (paused) media.pause()
    else void media.play().catch(() => {})
  }, [paused, sessionId])

  return (
    <>
      <VideoDeliveryPlayer
        playback={playback}
        autoPlay
        muted
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
