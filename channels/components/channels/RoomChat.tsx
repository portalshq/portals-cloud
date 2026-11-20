'use client'

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import styles from './RoomChat.module.css'

type Message = { id: string; name: string; text: string }
const noViewer = () => null

function useMessages(endpoint: string | undefined, limit: number, active: boolean, privateRead: boolean) {
  const [snapshot, setSnapshot] = useState<{ endpoint: string; messages: Message[] }>()
  useEffect(() => {
    if (!endpoint || !limit || !active) return
    const abort = new AbortController()
    let timer: number | undefined
    let running = false
    let cursor = '0'
    let etag: string | undefined
    let idleReads = 0
    const schedule = (delay: number) => {
      clearTimeout(timer)
      if (!abort.signal.aborted) timer = window.setTimeout(read, delay)
    }
    async function read() {
      if (abort.signal.aborted) return
      if (document.hidden || running) {
        schedule(5_000)
        return
      }
      running = true
      try {
        const search = new URLSearchParams({ limit: String(limit) })
        if (cursor !== '0') search.set('after', cursor)
        const headers = new Headers()
        if (etag) headers.set('If-None-Match', etag)
        const path = `${endpoint}?${search}`
        const init = { signal: abort.signal, headers }
        const response = privateRead ? await viewerFetch(path, init)
          : await fetch(path, { ...init, credentials: 'omit' })
        if (abort.signal.aborted) return
        if (response.status === 304) {
          idleReads++
          return
        }
        if (!response.ok) {
          if (privateRead) setSnapshot(undefined)
          return
        }
        const value = await response.json() as { messages: Message[] }
        etag = response.headers.get('etag') ?? undefined
        const responseCursor = response.headers.get('x-chat-cursor')
        if (responseCursor && /^(?:0|[1-9]\d*)$/.test(responseCursor)) cursor = responseCursor
        idleReads = value.messages.length ? 0 : idleReads + 1
        if (!abort.signal.aborted) setSnapshot(current => {
          if (!current || current.endpoint !== endpoint || cursor === '0') return { endpoint: endpoint!, messages: value.messages }
          const merged = new Map(current.messages.map(message => [message.id, message]))
          for (const message of value.messages) merged.set(message.id, message)
          return { endpoint: endpoint!, messages: [...merged.values()].slice(-limit) }
        })
      } catch {
        if (!abort.signal.aborted && privateRead) setSnapshot(undefined)
      } finally {
        running = false
        schedule(Math.min(30_000, 2_500 * 2 ** Math.min(idleReads, 4)))
      }
    }
    void read()
    const refresh = () => {
      idleReads = 0
      void read()
    }
    const written = (event: Event) => {
      if ((event as CustomEvent<{ endpoint?: string }>).detail?.endpoint === endpoint) refresh()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('channels:chat-written', written)
    return () => {
      abort.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('channels:chat-written', written)
    }
  }, [active, endpoint, limit, privateRead])
  return active && limit && snapshot && snapshot.endpoint === endpoint ? snapshot.messages.slice(-limit) : []
}

function publicChatEndpoint(programId: string | undefined) {
  return programId ? `/api/programs/${encodeURIComponent(programId)}/chat` : undefined
}

export function AmbientChat({ programId, limit, active }: { programId?: string; limit: number; active: boolean }) {
  const messages = useMessages(publicChatEndpoint(programId), limit, active, false)
  if (!active || !limit || !messages.length) return null
  return <ol className={styles.ambient} aria-label="Recent public chat">
    {messages.map(message => <li key={message.id}><strong>{message.name}</strong> {message.text}</li>)}
  </ol>
}

export function RoomChat({ programId, groupCode, member = false }: { programId?: string; groupCode?: string; member?: boolean }) {
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, noViewer)
  const privateEndpoint = viewer && member && groupCode ? `/api/groups/${groupCode}/chat` : undefined
  const publicEndpoint = publicChatEndpoint(programId)
  const [publicSelected, setPublicSelected] = useState(false)
  const selected = privateEndpoint && (!publicSelected || !publicEndpoint) ? privateEndpoint : publicEndpoint
  if (!selected) return null
  return <section className={styles.window} aria-label="Chat">
    {privateEndpoint && publicEndpoint && <div className={styles.scopes} aria-label="Chat conversation" role="group">
      <button type="button" aria-pressed={!publicSelected} onClick={() => setPublicSelected(false)}>Group</button>
      <button type="button" aria-pressed={publicSelected} onClick={() => setPublicSelected(true)}>Public</button>
    </div>}
    <Thread key={`${viewer?.userId}:${selected}`} endpoint={selected} privateRead={selected === privateEndpoint} signedIn={Boolean(viewer)} />
  </section>
}

function Thread({ endpoint, privateRead, signedIn }: { endpoint: string; privateRead: boolean; signedIn: boolean }) {
  const messages = useMessages(endpoint, 40, true, privateRead)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function send() {
    if (pending || !draft.trim()) return
    setPending(true)
    setFailed(false)
    try {
      const response = await viewerFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, clientId: crypto.randomUUID() }) })
      if (!response.ok) throw new Error(`Chat send returned ${response.status}`)
      setDraft('')
      window.dispatchEvent(new CustomEvent('channels:chat-written', { detail: { endpoint } }))
    } catch { setFailed(true) }
    finally { setPending(false) }
  }

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }
  return <>
    <ol className={styles.messages} aria-label={privateRead ? 'Group messages' : 'Public messages'}>
      {[...messages].reverse().map(message => <li key={message.id}><strong>{message.name}</strong> {message.text}</li>)}
    </ol>
    {signedIn ? <div className={styles.composer}>
      <input aria-label="Chat message" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={submitOnEnter} maxLength={500} readOnly={pending} />
      <button type="button" disabled={pending || !draft.trim()} onClick={() => void send()}>Send</button>
    </div> : <button type="button" onClick={requestSignIn}>Sign in to chat</button>}
    {failed && <p role="alert">Message not sent. Please try again.</p>}
  </>
}
