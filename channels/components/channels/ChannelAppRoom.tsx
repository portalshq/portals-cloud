'use client'

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import { previewElements, type createRoomSound, type RoomAccount } from '@/lib/room-controls'
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
  variant?: 'preview'
  elements?: ReturnType<typeof previewElements>
  onError?: () => void
  shellChat?: boolean
}

type MountChannel = (host: HTMLElement, account: typeof viewer, controls: RoomControls) => () => void

const previewViewer: typeof viewer = {
  getSnapshot: () => null,
  subscribe: () => () => {},
  fetch: (path, init) => {
    if (init?.method && init.method !== 'GET') return Promise.reject(new Error('Preview is read only'))
    const headers = new Headers(init?.headers)
    for (const key of ['Authorization', 'X-Guest-Token']) headers.delete(key)
    return fetch(path, { ...init, headers, credentials: 'omit' })
  },
  requestSignIn: () => {},
}

export function ChannelAppRoom({
  app, name, heading, sound, onAccountChange, onSoundAvailable, variant, chatMessages, fallback, shellChat,
}: RoomControls & {
  app: ChannelApp; name: string; heading?: ChannelHeading; onSoundAvailable: (available: boolean) => void
  chatMessages?: number; fallback?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState<string>()
  const publishAccount = useEffectEvent(onAccountChange)
  const publishSound = useEffectEvent(onSoundAvailable)
  const mountKey = `${app.entry}:${variant ?? 'full'}:${chatMessages ?? 3}:${shellChat ?? false}`

  useEffect(() => {
    const element = host.current
    if (!element) return

    let disposed = false
    let didFail = false
    let unmount: (() => void) | undefined
    const reportFailure = () => {
      if (disposed) return
      didFail = true
      unmount?.()
      unmount = undefined
      publishSound(false)
      if (!variant) publishAccount(null)
      setFailed(mountKey)
    }

    async function mount(target: HTMLElement) {
      try {
        const bundle: Record<string, unknown> = await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ app.entry
        )
        if (disposed) return
        if ((variant === 'preview' && bundle.supportsPreview !== true) || (shellChat && bundle.supportsShellChat !== true)) {
          reportFailure()
          return
        }
        const mountChannel = bundle.mountChannel ?? bundle[app.legacyMountExport ?? '']
        if (typeof mountChannel !== 'function') throw new Error('Missing channel app mount function')
        unmount = (mountChannel as MountChannel)(target, variant ? previewViewer : viewer, {
          sound,
          onAccountChange: account => { if (!disposed && !variant) publishAccount(account) },
          variant,
          elements: variant ? previewElements(chatMessages) : undefined,
          onError: reportFailure,
          shellChat,
        })
        if (didFail) {
          unmount()
          unmount = undefined
          return
        }
        setFailed(undefined)
        publishSound(bundle.supportsRoomSound === true)
      } catch (error) {
        console.debug('[channels room] mount failed', { entry: app.entry, variant, error })
        reportFailure()
      }
    }

    void mount(element)

    return () => {
      disposed = true
      unmount?.()
      publishSound(false)
      if (!variant) publishAccount(null)
    }
  }, [app.entry, app.legacyMountExport, sound, variant, chatMessages, mountKey, shellChat])

  return (
    <div className={styles.room} data-channel-room data-theme={app.theme} data-channel-room-variant={variant}>
      <div
        ref={host}
        data-channel-program-theme=""
        data-channel-room-variant={variant}
        data-channel-heading-family={heading?.fontFamily ? '' : undefined}
        data-channel-heading-weight={heading?.fontWeight !== undefined ? '' : undefined}
        style={{
          '--channel-heading-family': heading?.fontFamily,
          '--channel-heading-weight': heading?.fontWeight,
        } as CSSProperties}
      />
      {failed === mountKey && (fallback ?? <p role="status">Can't reach {name} right now. Check back soon.</p>)}
    </div>
  )
}
