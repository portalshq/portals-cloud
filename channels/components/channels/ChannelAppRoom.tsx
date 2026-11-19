'use client'

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import {
  roomElementsFor,
  type createRoomSound,
  type FollowDialogOutcome,
  type ResolvedRoomElements,
  type RoomAccount,
  type RoomElements,
  type RoomVariant,
} from '@/lib/room-controls'
import type { ChannelApp, ChannelHeading } from './data'
import { submitFollowReminder, type FollowReminderResult } from './actions'
import styles from './ChannelAppRoom.module.css'

const viewer = {
  getSnapshot: getViewer,
  subscribe: subscribeViewer,
  fetch: viewerFetch,
  requestSignIn,
}

export function ChannelProgramSurface({ app, heading, variant, children }: {
  app?: ChannelApp; heading?: ChannelHeading; variant?: RoomVariant; children: ReactNode
}) {
  return (
    <div className={styles.room} data-channel-room data-theme={app?.theme} data-channel-room-variant={variant}>
      <div data-channel-program-theme="" data-channel-room-variant={variant}
        data-channel-heading-family={heading?.fontFamily ? '' : undefined}
        data-channel-heading-weight={heading?.fontWeight !== undefined ? '' : undefined}
        style={{
          '--channel-heading-family': heading?.fontFamily,
          '--channel-heading-weight': heading?.fontWeight,
        } as CSSProperties}>
        {children}
      </div>
    </div>
  )
}

type RoomControls = {
  sound: ReturnType<typeof createRoomSound>
  onAccountChange: (account: RoomAccount | null) => void
  variant?: RoomVariant
  elements?: ResolvedRoomElements
  captions?: 'on'
  onError?: () => void
  shellChat?: boolean
  /** A room may register its own styled follow dialog with the host: the opener,
   *  or null to retract. The host opens it instead of its default follow UI. */
  onFollowDialog?: (open: (() => void) | null) => void
  /** Reports the registered dialog's outcome; the host syncs follow state and
   *  analytics from it. */
  onFollowSettled?: (outcome: FollowDialogOutcome) => void
  /** Submits the reminders form that commits a follow, using the real viewer
   *  session even from a read-only preview. Returns the subscription result so
   *  a styled follow dialog can render success or error states. */
  submitFollow?: (options: { email?: string }) => Promise<FollowReminderResult>
  /** Display name of the program/channel, from catalog data. */
  programName?: string
  /** Central program id for the mounted room, from catalog data. */
  programId?: string
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
  app, name, programId, heading, sound, onAccountChange, onSoundAvailable, variant, elements: elementOverrides, captions,
  chatMessages, fallback, shellChat, onFollowDialog, onFollowSettled,
}: Omit<RoomControls, 'elements'> & {
  app: ChannelApp; name: string; programId?: string; heading?: ChannelHeading; onSoundAvailable: (available: boolean) => void
  /** Prefer `elements`; retained while app registrations expose chatMessages. */
  chatMessages?: number; elements?: RoomElements; fallback?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState<string>()
  const publishAccount = useEffectEvent(onAccountChange)
  const publishSound = useEffectEvent(onSoundAvailable)
  const publishFollowDialog = useEffectEvent((open: (() => void) | null) => { onFollowDialog?.(open) })
  const publishFollowSettled = useEffectEvent((outcome: FollowDialogOutcome) => { onFollowSettled?.(outcome) })
  const elements = roomElementsFor(variant, {
    ...(variant && chatMessages !== undefined ? { chatMessages } : {}),
    ...elementOverrides,
  })
  const elementsKey = elements ? JSON.stringify(elements) : 'default'
  const mountKey = `${app.entry}:${variant ?? 'full'}:${elementsKey}:${shellChat ?? false}:${captions ?? 'default-captions'}`

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
      publishFollowDialog(null)
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
          elements,
          captions,
          onError: reportFailure,
          shellChat,
          onFollowDialog: open => { if (!disposed) publishFollowDialog(open) },
          onFollowSettled: outcome => { if (!disposed) publishFollowSettled(outcome) },
          submitFollow: options => submitFollowReminder(programId ?? '', options),
          programName: name,
          programId,
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
      publishFollowDialog(null)
      if (!variant) publishAccount(null)
    }
  }, [app.entry, app.legacyMountExport, sound, variant, elementsKey, mountKey, shellChat, captions])

  return (
    <ChannelProgramSurface app={app} heading={heading} variant={variant}>
      <div ref={host} hidden={failed === mountKey} />
      {failed === mountKey && (fallback ?? <p role="status">Can't reach {name} right now. Check back soon.</p>)}
    </ChannelProgramSurface>
  )
}
