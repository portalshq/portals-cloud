'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { analyticsPrivacy, channelAnalyticsPreference, resetChannelAnalyticsIdentity } from '@/lib/analytics-client'

export function AnalyticsPrivacy() {
  const dialog = useRef<HTMLDialogElement>(null)
  const optedOut = useSyncExternalStore(analyticsPrivacy.subscribe, analyticsPrivacy.optedOut, () => false)
  const gpc = analyticsPrivacy.globalPrivacyControl()
  const allowed = !gpc && !optedOut
  useEffect(() => {
    void channelAnalyticsPreference('GET')
      .then(response => response.ok ? response.json() : null)
      .then((value: {suppressed?: boolean} | null) => {
        if (value?.suppressed) {
          analyticsPrivacy.setOptOut(true)
          void resetChannelAnalyticsIdentity()
        }
      })
      .catch(() => undefined)
  }, [])
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} style={{background: 'none', border: 0, color: 'inherit', padding: 0, textDecoration: 'underline', cursor: 'pointer'}}>Privacy choices</button>
    <dialog ref={dialog} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }} style={{maxWidth: 420, border: 0, borderRadius: 16, padding: 24}}>
      <h2>Analytics preferences</h2>
      {gpc && <p>Your browser’s Global Privacy Control signal is on, so analytics sharing is off.</p>}
      <label style={{display: 'flex', gap: 12, alignItems: 'center'}}>
        <input type="checkbox" checked={allowed} disabled={gpc} onChange={(event) => {
          analyticsPrivacy.setOptOut(!event.target.checked)
          if (!event.target.checked) void resetChannelAnalyticsIdentity()
          void channelAnalyticsPreference('PUT', !event.target.checked).catch(() => undefined)
        }} />
        <span>Share anonymous usage analytics</span>
      </label>
      <button type="button" onClick={() => dialog.current?.close()} style={{marginTop: 20}}>Done</button>
    </dialog>
  </>
}
