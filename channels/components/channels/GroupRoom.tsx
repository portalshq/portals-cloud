'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import { createRoomSound, type RoomAccount } from '@/lib/room-controls'
import type { groupSnapshot, GroupDestinations } from '@/lib/groups'
import { Rail } from '@/components/shell/Rail'
import { ChannelAppRoom, ChannelProgramSurface } from './ChannelAppRoom'
import { ChannelHeadingFonts } from './ChannelHeadingFonts'
import { RoomPreviewFallback } from './ChannelPreview'
import { RoomChat } from './RoomChat'
import { formatSessionTime } from './data'
import styles from './ChannelsExperience.module.css'

type Snapshot = NonNullable<Awaited<ReturnType<typeof groupSnapshot>>>
const serverViewer = () => null
const serverMuted = () => true

export function GroupRoom({ code, initial, framed = false, destinations }: {
  code: string; initial: Snapshot; framed?: boolean; destinations?: GroupDestinations
}) {
  const router = useRouter()
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, serverViewer)
  const [sound] = useState(() => createRoomSound(framed))
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted, serverMuted)
  const [tuning, setTuning] = useState<Snapshot>(initial)
  const [membership, setMembership] = useState<{ userId: string; member: boolean; owner: boolean }>()
  const [account, setAccount] = useState<RoomAccount | null>(null)
  const [soundAvailable, setSoundAvailable] = useState(false)
  const [failed, setFailed] = useState(false)
  const [membershipError, setMembershipError] = useState(false)
  const [pending, setPending] = useState(false)
  const [inviteLink, setInviteLink] = useState<string>()
  const [invite, setInvite] = useState<string>()
  const [tuneTarget, setTuneTarget] = useState(() => initial.stationId
    ? `station:${initial.stationId}`
    : initial.programId ? `program:${initial.programId}` : '')
  const channel = tuning.channel
  const href = `/g/${code}`
  const api = `/api/groups/${code}`
  const member = Boolean(viewer && membership?.userId === viewer.userId && membership?.member)
  const owner = member && membership?.owner

  useEffect(() => {
    if (framed) return
    const readInvite = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get('invite')
      setInvite(token && /^[A-Za-z0-9_-]{32}$/.test(token) ? token : undefined)
    }
    readInvite()
    window.addEventListener('hashchange', readInvite)
    return () => window.removeEventListener('hashchange', readInvite)
  }, [framed])

  useEffect(() => {
    const abort = new AbortController()
    let timer: number
    let running = false
    let boundary = tuning.boundary
    async function refresh() {
      if (document.hidden || abort.signal.aborted || running) return
      running = true
      clearTimeout(timer)
      try {
        const response = await fetch(`${api}/tuning`, { credentials: 'omit', signal: abort.signal })
        if (!response.ok) throw new Error(`Tuning returned ${response.status}`)
        const next = await response.json() as Snapshot
        if (!abort.signal.aborted) {
          boundary = next.boundary
          setTuning(current => next.revision >= current.revision ? next : current)
          setFailed(false)
        }
      } catch { if (!abort.signal.aborted) setFailed(true) }
      finally {
        running = false
        const untilBoundary = boundary ? Date.parse(boundary) - Date.now() : Infinity
        const interval = 2000 + Math.random() * 1000
        if (!abort.signal.aborted) {
          timer = window.setTimeout(refresh, untilBoundary > 0 ? Math.max(300, Math.min(interval, untilBoundary + 50)) : interval)
        }
      }
    }
    timer = window.setTimeout(refresh, boundary ? Math.max(100, Math.min(1500, Date.parse(boundary) - Date.now())) : 1500)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      abort.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  // The initial boundary seeds the timer; refreshes use the latest server boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  useEffect(() => {
    if (!viewer?.userId || pending) return
    const userId = viewer.userId
    const abort = new AbortController()
    const refresh = async () => {
      try {
        const response = await viewerFetch(`${api}/membership`, { signal: abort.signal })
        if (!response.ok) throw new Error(`Membership returned ${response.status}`)
        const next = await response.json()
        if (!abort.signal.aborted) setMembership({ userId, member: next.member === true, owner: next.owner === true })
      } catch { if (!abort.signal.aborted) setMembership(undefined) }
    }
    void refresh()
    const timer = window.setInterval(refresh, 10_000)
    return () => { abort.abort(); clearInterval(timer) }
  }, [api, pending, viewer?.userId])

  async function change(action: 'join' | 'leave' | 'end' | 'invite' | 'tune') {
    if (pending) return
    if (!viewer?.userId) {
      requestSignIn()
      return
    }
    setPending(true)
    setMembershipError(false)
    try {
      const separator = tuneTarget.indexOf(':')
      const tuneKind = tuneTarget.slice(0, separator)
      const tuneId = tuneTarget.slice(separator + 1)
      const response = await viewerFetch(`${api}/${action === 'tune' ? 'tuning' : 'membership'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'tune' ? {
          [tuneKind === 'station' ? 'stationId' : 'programId']: tuneId,
          revision: tuning.revision,
        } :
          action === 'join' ? { action, invite } : { action }),
      })
      if (!response.ok) throw new Error(`Group action returned ${response.status}`)
      const value = await response.json()
      if (action === 'leave' || action === 'end') {
        setMembership(undefined)
        router.replace(channel ? `/${channel.slug}` : '/')
      } else if (action === 'join') {
        setMembership({ userId: viewer.userId, member: true, owner: false })
        router.replace(href)
      } else if (action === 'invite' && typeof value.invite === 'string') {
        setInviteLink(`${location.origin}${href}#invite=${encodeURIComponent(value.invite)}`)
      } else if (action === 'tune' && typeof value.revision === 'number') {
        setTuning(value as Snapshot)
      }
    } catch { setMembershipError(true) }
    finally { setPending(false) }
  }

  return <>
    {channel && <ChannelHeadingFonts channels={[channel]} />}
    <Rail roomSlug={channel?.slug} roomHref={href} surface={framed ? 'embed' : undefined}
      account={account} sound={{ muted, toggle: sound.toggle, disabled: !soundAvailable && !channel?.stream }}
      menuAction={!framed && !member && invite ? <button type="button" disabled={pending} onClick={() => void change('join')}>Join group</button> : undefined}
      groupControl={!framed && member ? <details className={styles.groupControl}>
        <summary>{tuning.name} · {tuning.memberCount}</summary>
        <div>
          <details>
            <summary>Invite</summary>
            <button type="button" onClick={() => void navigator.clipboard.writeText(location.origin + href).catch(() => setMembershipError(true))}>Copy group link</button>
            <a href={`https://x.com/intent/tweet?${new URLSearchParams({ url: typeof location === 'undefined' ? href : location.origin + href })}`} target="_blank" rel="noopener noreferrer">Share to X</a>
            {owner && <button type="button" disabled={pending} onClick={() => void change('invite')}>Create membership link</button>}
            {inviteLink && owner && <input aria-label="Membership link" readOnly value={inviteLink} onFocus={event => event.target.select()} />}
          </details>
          {owner && <>
            <select aria-label="Move group to" value={tuneTarget} onChange={event => setTuneTarget(event.target.value)}>
              <option value="" disabled>Choose a station or program</option>
              {destinations?.stations.length ? <optgroup label="Stations">
                {destinations.stations.map(station => <option key={station.id} value={`station:${station.id}`}>{station.name}</option>)}
              </optgroup> : null}
              {destinations?.programs.length ? <optgroup label="Programs">
                {destinations.programs.map(program => <option key={program.id} value={`program:${program.id}`}>{program.name}</option>)}
              </optgroup> : null}
            </select>
            <button type="button" disabled={pending || !tuneTarget} onClick={() => void change('tune')}>Move group</button>
          </>}
          <button type="button" disabled={pending} onClick={() => void change(owner ? 'end' : 'leave')}>
            {owner ? 'End group' : 'Leave group'}
          </button>
        </div>
      </details> : undefined}
    />
    {membershipError && <p role="alert">Could not update the group. Please try again.</p>}
    {failed && <p role="status">Could not refresh group tuning. Retrying.</p>}
    <main className={styles.groupRoom} data-channel-room>
      <div className={styles.groupStage}>
        {channel?.app ? <ChannelAppRoom key={channel.slug} app={channel.app} name={channel.title}
          heading={channel.heading} sound={sound} onSoundAvailable={setSoundAvailable} onAccountChange={setAccount} shellChat
          captions={framed ? 'on' : undefined}
          fallback={<RoomPreviewFallback channel={channel} active muted={muted} />} />
          : channel ? <ChannelProgramSurface app={channel.app} heading={channel.heading} variant="preview"><RoomPreviewFallback channel={channel} active muted={muted} /></ChannelProgramSurface> :
            <p>{tuning.nextSession ? <>Next session <time dateTime={tuning.nextSession}>{formatSessionTime(tuning.nextSession)}</time></>
              : 'No upcoming session scheduled.'}</p>}
      </div>
      <RoomChat programId={channel?.programId} groupCode={code} member={member} />
    </main>
  </>
}

export function StartGroup({ programId, className }: { programId: string; className?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function start() {
    if (!getViewer()) return requestSignIn()
    setPending(true)
    setFailed(false)
    try {
      const response = await viewerFetch('/api/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ programId }),
      })
      if (!response.ok) throw new Error(`Group creation returned ${response.status}`)
      const { code } = await response.json()
      router.push(`/g/${code}`)
    } catch { setFailed(true) }
    finally { setPending(false) }
  }
  return <>
    <button type="button" className={className} disabled={pending} onClick={() => void start()}>Start group</button>
    {failed && <p role="alert">Could not start a group. Please try again.</p>}
  </>
}
