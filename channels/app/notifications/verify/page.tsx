'use client'

import { useState } from 'react'
import { getViewer, startSignIn } from '@/lib/viewer'

export default function VerifyReminderEmail() {
  const [message, setMessage] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  async function confirm() {
    setBusy(true); setMessage('')
    try {
      const query = new URLSearchParams(window.location.search)
      const token = getViewer()?.token
      const response = await fetch(`/api/notifications/verify?${query}`, { method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const text = await response.text()
      if (response.status === 401) setNeedsSignIn(true)
      if (response.ok) { setNeedsSignIn(false); setConfirmed(true) }
      setMessage(text)
    } catch { setMessage('Unable to confirm right now. Please try again.') }
    finally { setBusy(false) }
  }
  return <main style={{ maxWidth: '40rem', margin: '3rem auto', padding: '1rem' }}>
    <h1>Confirm your show reminders</h1>
    {!confirmed && <button type="button" disabled={busy} onClick={() => void confirm()}>Confirm email</button>}
    {needsSignIn && <button type="button" onClick={() => void startSignIn()}>Sign in</button>}
    {message && <p role="status">{message}</p>}
    {confirmed && <a href="/">Back to shows</a>}
  </main>
}
