'use client'

import { useEffect, useRef, useState } from 'react'
import { ChannelStream } from './ChannelStream'
import type { Channel, PlaybackPreview } from './data'
import styles from './ChannelPreview.module.css'

export function useChannelPreview(channel: Channel, active: boolean): Channel {
  const endpoint = channel.preview?.endpoint
  const [snapshot, setSnapshot] = useState<PlaybackPreview | null | undefined>()

  useEffect(() => {
    if (!endpoint || !active) return
    const controller = new AbortController()
    let refreshing = false

    async function refresh() {
      if (!endpoint || document.hidden || refreshing) return
      refreshing = true
      try {
        const response = await fetch(endpoint, { signal: controller.signal })
        const value: PlaybackPreview | null = response.ok ? await response.json() : null
        if (!controller.signal.aborted) setSnapshot(value)
      } catch {
        if (!controller.signal.aborted) setSnapshot(null)
      } finally {
        refreshing = false
      }
    }

    void refresh()
    const timer = window.setInterval(refresh, 15_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [endpoint, active])

  if (snapshot === undefined) return channel
  const program = snapshot?.program
  return {
    ...channel,
    live: snapshot?.live ?? false,
    stream: snapshot?.stream,
    previewVideo: snapshot?.previewVideo,
    nextSession: snapshot?.nextSession,
    ...(program && program.id === channel.programId && program.description !== undefined
      ? { description: program.description, tagline: program.tagline }
      : {}),
    previewStatus: snapshot ? (snapshot.live ? 'live' : 'off-air') : 'unavailable',
  }
}

function Backdrop({ entry }: { entry: string }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let disposed = false
    let unmount: (() => void) | undefined
    void import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry)
      .then((module: { mountBackdrop: (host: HTMLElement) => () => void }) => {
        if (!disposed && host.current) unmount = module.mountBackdrop(host.current)
      })
      .catch(() => {
        // The poster underneath is the fallback for older or unreachable bundles.
      })
    return () => {
      disposed = true
      unmount?.()
    }
  }, [entry])

  return <span className={styles.backdrop} aria-hidden="true" ref={host} />
}

export function ChannelPreview({
  channel,
  active,
  playVideo = false,
  muted = true,
  noteClassName,
}: {
  channel: Channel
  active: boolean
  playVideo?: boolean
  muted?: boolean
  noteClassName?: string
}) {
  const { preview, previewStatus } = channel
  const hls = playVideo ? channel.stream : undefined
  const video = playVideo && active ? channel.previewVideo : undefined
  const name = preview?.name ?? channel.title

  return (
    <>
      {hls ? (
        <ChannelStream
          channel={{ ...channel, stream: hls }}
          paused={!active}
          muted={muted || !active}
          contentKind="preview"
          noteClassName={noteClassName ?? styles.status}
        />
      ) : video ? (
        <video src={video} aria-label={channel.title} autoPlay muted={muted} loop playsInline />
      ) : preview ? (
        <>
          {preview.poster && <img className={styles.poster} src={preview.poster} alt="" loading="lazy" />}
          {active && preview.backdropModule && <Backdrop entry={preview.backdropModule} />}
        </>
      ) : null}
      {previewStatus === 'off-air' && (
        <span className={styles.status} role="status">{name} is off-air right now</span>
      )}
      {previewStatus === 'unavailable' && (
        <span className={styles.status} role="status">{name} is unavailable right now</span>
      )}
    </>
  )
}
