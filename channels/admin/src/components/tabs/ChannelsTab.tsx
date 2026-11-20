import { useState, useCallback } from 'react'
import { useAdminToken } from '../../hooks/useAdminToken'
import { usePolling } from '../../hooks/usePolling'
import { adminFetch } from '../../api/client'
import type { AdminChannel } from '../../types'
import { formatInTimeZone } from '../../lib/dates'

const MODE_STYLES: Record<string, string> = {
  episode: 'text-[#24110c] bg-[#F06C49]',
  preparing: 'text-amber-700 bg-amber-50',
  ambient: 'text-blue-700 bg-blue-50',
  stopped: 'text-gray-500 bg-gray-100',
}

function ProgramCopyEditor({ programs, token, refresh, onError }: {
  programs: AdminChannel['programs']
  token: string
  refresh: () => void
  onError: (message: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagline, setTagline] = useState('')
  const [saving, setSaving] = useState(false)

  const select = (id: string) => {
    const program = programs.find((item) => item.id === id)
    setSelected(id)
    setName(program?.name ?? '')
    setDescription(program?.description ?? '')
    setTagline(program?.tagline ?? '')
  }
  const save = async () => {
    if (!selected) return
    setSaving(true)
    onError(null)
    try {
      await adminFetch(`/programs/${encodeURIComponent(selected)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(name.trim() ? { name: name.trim() } : {}),
          description: description.trim(),
          tagline: tagline.trim(),
        }),
      })
      setEditing(false)
      refresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!programs.length) return <span className="fontMicro text-gray-400">—</span>
  if (!editing) return <button className="fontMicro text-blue-600 hover:underline" onClick={() => {
    select(programs.length === 1 ? programs[0].id : '')
    setEditing(true)
  }}>Edit program details</button>

  return (
    <div className="min-w-64 space-y-2">
      <label className="block fontMicro text-gray-600">Program
        <select className="block w-full border rounded px-2 py-1" value={selected} onChange={(event) => select(event.target.value)}>
          <option value="">Select a program</option>
          {programs.map((program) => <option key={program.id} value={program.id}>{program.name} ({program.id})</option>)}
        </select>
      </label>
      {selected && <>
        <label className="block fontMicro text-gray-600">Name
          <input className="block w-full border rounded px-2 py-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block fontMicro text-gray-600">Description
          <textarea className="block w-full border rounded px-2 py-1" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        <label className="block fontMicro text-gray-600">Tagline
          <input className="block w-full border rounded px-2 py-1" value={tagline} onChange={(event) => setTagline(event.target.value)} />
        </label>
      </>}
      <button className="fontMicro text-blue-600 hover:underline mr-3 disabled:text-gray-500" disabled={!selected || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
      <button className="fontMicro text-gray-500 hover:underline" onClick={() => setEditing(false)}>Cancel</button>
    </div>
  )
}

/**
 * Channels as the central database and app registry define them: a channel
 * exists when a program is bound to it (schedule rules or session slots) or
 * an app is registered for it. Channel rows inside an app's own database are
 * managed by that app, not here.
 */
export default function ChannelsTab() {
  const { token } = useAdminToken()
  const [error, setError] = useState<string | null>(null)

  const fetchChannels = useCallback((signal: AbortSignal) => adminFetch<AdminChannel[]>('/channels', token, { signal }), [token])
  const { data: channels, loading, error: fetchError, refresh, lastUpdated } = usePolling(
    fetchChannels,
    10000,
    [token],
  )

  return (
    <div className="p-4">
      <div className="flex gap-4 mb-4 items-center flex-wrap">
        <button onClick={refresh} className="fontNormal text-blue-600 hover:underline">Refresh</button>
        {lastUpdated && (
          <span className="fontMicro text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
        )}
        {(error || fetchError) && (
          <span className="fontMicro text-red-500 ml-auto">Error: {error ?? fetchError?.message}</span>
        )}
      </div>

      {loading && <p className="text-gray-500 fontNormal">Loading…</p>}

      <div className="overflow-x-auto">
        <table className="w-full fontNormal border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">ID</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">App</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Production</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Bindings</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Program details</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Next session</th>
            </tr>
          </thead>
          <tbody>
            {channels?.map((channel) => {
              const mode = channel.production?.mode ?? null
              return (
                <tr key={channel.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 fontNormal text-gray-700">{channel.id}</td>
                  <td className="py-2 px-3 fontNormal">{channel.name}</td>
                  <td className="py-2 px-3 fontMicro text-gray-500">
                    {channel.app ? (
                      <span title={channel.app.origin}>{channel.app.name}</span>
                    ) : (
                      <span className="text-gray-400 italic">no app</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {mode ? (
                      <span className={`px-2 py-0.5 rounded fontMicro ${MODE_STYLES[mode] ?? 'text-gray-500 bg-gray-100'}`}>
                        {mode}
                        {channel.production && channel.production.desired === 'stopped' && mode !== 'stopped' && ' (stopping)'}
                      </span>
                    ) : (
                      <span className="fontMicro text-gray-400 italic">no checkpoint</span>
                    )}
                  </td>
                  <td className="py-2 px-3 fontMicro text-gray-500">
                    {channel.bindings.length
                      ? channel.bindings
                          .map((binding) => `${binding.stationId ?? '—'} / ${binding.programId}`)
                          .join(', ')
                      : 'unbound'}
                  </td>
                  <td className="py-2 px-3 align-top"><ProgramCopyEditor programs={channel.programs ?? []} token={token} refresh={refresh} onError={setError} /></td>
                  <td className="py-2 px-3 fontNormal text-gray-600">
                    {channel.nextSession
                      ? formatInTimeZone(new Date(channel.nextSession.startsAt), 'UTC', "MMM d 'at' h:mm a 'UTC'")
                      : '—'}
                    {channel.nextSession?.title && (
                      <div className="fontMicro text-gray-400">{channel.nextSession.title}</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {channels?.length === 0 && !loading && (
        <p className="text-gray-500 mt-4 fontNormal">No channels found</p>
      )}
    </div>
  )
}
