'use client'

import { useEffect, useRef, useState } from 'react'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import type { ChannelApp } from './data'
import styles from './ChannelAppRoom.module.css'

const viewer = {
  getSnapshot: getViewer,
  subscribe: subscribeViewer,
  fetch: viewerFetch,
  requestSignIn,
}

type MountChannel = (host: HTMLElement, account: typeof viewer) => () => void

export function ChannelAppRoom({ app, name }: { app: ChannelApp; name: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = host.current
    if (!element) return

    let disposed = false
    let unmount: (() => void) | undefined

    async function mount(target: HTMLElement) {
      try {
        const bundle: Record<string, MountChannel | undefined> = await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ app.entry
        )
        if (disposed) return
        const mountChannel = bundle.mountChannel ?? bundle[app.legacyMountExport ?? '']
        if (typeof mountChannel !== 'function') throw new Error('Missing channel app mount function')
        unmount = mountChannel(target, viewer)
      } catch {
        if (!disposed) setFailed(true)
      }
    }

    void mount(element)

    return () => {
      disposed = true
      unmount?.()
    }
  }, [app.entry, app.legacyMountExport])

  return (
    <div className={styles.room} data-channel-room>
      <div ref={host} />
      {failed && <p role="status">Can't reach {name} right now. Check back soon.</p>}
    </div>
  )
}
