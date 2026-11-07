import { useState, useCallback } from 'react'
import { useAdminToken } from '../../hooks/useAdminToken'
import { usePolling } from '../../hooks/usePolling'
import { adminFetch } from '../../api/client'
import type { AdminChannel } from '../../types'
import { formatDisplayDate, formatInTimeZone } from '../../lib/dates'

const MODE_STYLES: Record<string, string> = {
  episode: 'text-green-700 bg-green-50',
  preparing: 'text-amber-700 bg-amber-50',
  ambient: 'text-blue-700 bg-blue-50',
  stopped: 'text-gray-500 bg-gray-100',
}

export default function ChannelsTab() {
  const { token } = useAdminToken()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ id: '', name: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchChannels = useCallback(() => adminFetch<AdminChannel[]>('/channels', token), [token])
  const { data: channels, loading, error: fetchError, refresh, lastUpdated } = usePolling(
    fetchChannels,
    10000,
    [token],
  )

  const handleSave = async (channel: AdminChannel) => {
    setSaving(true)
    setError(null)
    try {
      await adminFetch(`/channels/${encodeURIComponent(channel.id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      })
      setEditingId(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      await adminFetch('/channels', token, {
        method: 'POST',
        body: JSON.stringify({ id: createForm.id.trim(), name: createForm.name.trim() }),
      })
      setShowCreate(false)
      setCreateForm({ id: '', name: '' })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex gap-4 mb-4 items-center flex-wrap">
        <button onClick={refresh} className="text-sm text-blue-600 hover:underline">Refresh</button>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-blue-600 hover:underline">
          {showCreate ? 'Cancel' : '+ New channel'}
        </button>
        {lastUpdated && (
          <span className="text-xs text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
        )}
        {(error || fetchError) && (
          <span className="text-xs text-red-500 ml-auto">Error: {error ?? fetchError?.message}</span>
        )}
      </div>

      {showCreate && (
        <div className="mb-4 p-4 border border-gray-200 rounded bg-gray-50 max-w-xl">
          <div className="text-sm font-medium text-gray-700 mb-3">New channel</div>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs text-gray-600">
              Channel id (lowercase, e.g. bears)
              <input
                type="text"
                value={createForm.id}
                onChange={(e) => setCreateForm({ ...createForm, id: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Display name
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !createForm.id.trim() || !createForm.name.trim()}
            className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">ID</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Production</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Binding</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Next session</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels?.map((channel) => {
              const isEditing = editingId === channel.id
              const mode = channel.production?.mode ?? null
              return (
                <tr key={channel.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-sm font-mono text-gray-700">{channel.id}</td>
                  <td className="py-2 px-3 text-sm font-medium">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave(channel)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                        autoFocus
                      />
                    ) : (
                      channel.name
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {mode ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${MODE_STYLES[mode] ?? 'text-gray-500 bg-gray-100'}`}>
                        {mode}
                        {channel.production && channel.production.desired === 'stopped' && mode !== 'stopped' && ' (stopping)'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">no checkpoint</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">
                    {channel.stationId || channel.programId
                      ? `${channel.stationId ?? '—'} / ${channel.programId ?? '—'}`
                      : 'unbound'}
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-600">
                    {channel.nextSession
                      ? formatInTimeZone(new Date(channel.nextSession.startsAt), 'UTC', "MMM d 'at' h:mm a 'UTC'")
                      : '—'}
                    {channel.nextSession?.title && (
                      <div className="text-xs text-gray-400">{channel.nextSession.title}</div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-600">{formatDisplayDate(channel.createdAt)}</td>
                  <td className="py-2 px-3 text-sm">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSave(channel)}
                          disabled={saving || !editName.trim()}
                          className="text-xs text-blue-600 hover:underline mr-3 disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditingId(channel.id); setEditName(channel.name) }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Rename
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {channels?.length === 0 && !loading && (
        <p className="text-gray-500 mt-4 text-sm">No channels found</p>
      )}
    </div>
  )
}
