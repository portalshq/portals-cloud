'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getViewer, startSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import styles from './settings.module.css'

type Subscription = { program_id: string; program_name: string; episode_enabled: boolean; weekly_enabled: boolean }
type Follow = { program_id: string; program_name: string }
type Settings = { verified: boolean; email?: string; accountEmail?: string | null; subscriptions?: Subscription[]; follows?: Follow[] }

export default function NotificationSettingsPage() {
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, () => null)
  const [data, setData] = useState<Settings | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const response = await viewerFetch('/api/notifications/subscriptions')
    if (!response.ok) throw new Error('Unable to load notification settings.')
    const next = await response.json() as Settings
    setData(next); setAccountEmail(next.accountEmail || '')
  }, [])
  useEffect(() => {
    if (!viewer) { setData(null); return }
    void load().catch(error => setMessage(error.message))
  }, [viewer?.token, load])
  async function perform(url: string, payload: unknown) {
    setBusy(true); setMessage('')
    try {
      const response = await viewerFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save changes.')
      await load(); setMessage('Your changes are saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save changes.') }
    finally { setBusy(false) }
  }
  async function verifyEmail() {
    setBusy(true); setMessage('')
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!timezone) throw new Error('We could not detect your time zone. Please check your device settings.')
      const response = await viewerFetch('/api/notifications/verify-email', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accountEmail, timezone }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to verify your email.')
      setMessage('Check your email to confirm your account email.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to verify your email.') }
    finally { setBusy(false) }
  }
  return <main className={styles.page}>
    <a href="/">← Back to shows</a><h1>Followed shows &amp; reminders</h1>
    {!viewer ? <button type="button" onClick={() => void startSignIn()}>Sign in</button> : !data ? <p>Loading your settings…</p> : <>
      {data.verified ? <>
        <p>Email reminders go to <strong>{data.email}</strong>.</p>
        <h2>Show reminders</h2>
        {data.subscriptions?.length ? data.subscriptions.map(item => <ProgramSettings key={item.program_id} item={item} busy={busy}
          save={(episode, weekly) => perform('/api/notifications/subscriptions', { programId: item.program_id, episode, weekly,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ensureFollow: false })} />) : <p>No show reminders yet.</p>}
      </> : <form onSubmit={event => { event.preventDefault(); void verifyEmail() }}>
        <p>Verify your account email to enable reminders.</p>
        {data.accountEmail ? <p>{data.accountEmail}</p> : <label>Account email <input type="email" value={accountEmail} onChange={event => setAccountEmail(event.target.value)} required /></label>}
        <button disabled={busy}>Verify email</button>
      </form>}
      <h2>Followed shows</h2>
      <p>Unfollowing removes a show from your weekly followed-show schedule. Manage episode emails above.</p>
      {data.follows?.length ? <ul>{data.follows.map(item => <li key={item.program_id}>{item.program_name}{' '}
        <button type="button" disabled={busy} onClick={() => void perform('/api/follows', { programId: item.program_id, follow: false })}>Unfollow</button>
      </li>)}</ul> : <p>You aren’t following any shows yet.</p>}
    </>}
    {message && <p role="status">{message}</p>}
  </main>
}

function ProgramSettings({ item, busy, save }: { item: Subscription; busy: boolean; save: (episode: boolean, weekly: boolean) => Promise<void> }) {
  const [episode, setEpisode] = useState(item.episode_enabled)
  const [weekly, setWeekly] = useState(item.weekly_enabled)
  useEffect(() => { setEpisode(item.episode_enabled); setWeekly(item.weekly_enabled) }, [item.episode_enabled, item.weekly_enabled])
  return <form onSubmit={event => { event.preventDefault(); void save(episode, weekly) }}>
    <h3>{item.program_name}</h3>
    <label><input type="checkbox" checked={episode} onChange={event => setEpisode(event.target.checked)} /> Remind me 5 minutes before each daily episode</label>
    <label><input type="checkbox" checked={weekly} onChange={event => setWeekly(event.target.checked)} /> Weekly scheduled of my followed shows</label>
    <button disabled={busy}>Save show reminders</button>
  </form>
}
