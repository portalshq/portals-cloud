'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import type { createRoomSound, RoomAccount } from '@/lib/room-controls'
import type { ChannelApp, ChannelHeading } from './data'
import styles from './ChannelAppRoom.module.css'

const viewer = {
  getSnapshot: getViewer,
  subscribe: subscribeViewer,
  fetch: viewerFetch,
  requestSignIn,
}

type RoomControls = {
  sound: ReturnType<typeof createRoomSound>
  onAccountChange: (account: RoomAccount | null) => void
}

type MountChannel = (host: HTMLElement, account: typeof viewer, controls: RoomControls) => () => void

export function ChannelAppRoom({
  app, name, heading, sound, onAccountChange, onSoundAvailable,
}: RoomControls & { app: ChannelApp; name: string; heading?: ChannelHeading; onSoundAvailable: (available: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = host.current
    if (!element) return

    let disposed = false
    let unmount: (() => void) | undefined

    async function mount(target: HTMLElement) {
      try {
        const bundle: Record<string, unknown> = await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ app.entry
        )
        if (disposed) return
        const mountChannel = bundle.mountChannel ?? bundle[app.legacyMountExport ?? '']
        if (typeof mountChannel !== 'function') throw new Error('Missing channel app mount function')
        unmount = (mountChannel as MountChannel)(target, viewer, { sound, onAccountChange })
        onSoundAvailable(bundle.supportsRoomSound === true)
      } catch {
        if (!disposed) setFailed(true)
      }
    }

    void mount(element)

    return () => {
      disposed = true
      unmount?.()
      onSoundAvailable(false)
    }
  }, [app.entry, app.legacyMountExport, sound, onAccountChange, onSoundAvailable])

  return (
    <div className={styles.room} data-channel-room data-theme={app.theme}>
      <div
        ref={host}
        data-channel-program-theme=""
        data-channel-heading-family={heading?.fontFamily ? '' : undefined}
        data-channel-heading-weight={heading?.fontWeight !== undefined ? '' : undefined}
        style={{
          '--channel-heading-family': heading?.fontFamily,
          '--channel-heading-weight': heading?.fontWeight,
        } as CSSProperties}
      />
      {failed && <p role="status">Can't reach {name} right now. Check back soon.</p>}
    </div>
  )
}
