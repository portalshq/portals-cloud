import { useState, useCallback, useMemo } from 'react'
import { useAdminToken } from '../../hooks/useAdminToken'
import { usePolling } from '../../hooks/usePolling'
import { adminFetch } from '../../api/client'
import type { AdminChannel, AdminMeta, ProgramSlot, SlotStatus } from '../../types'
import { formatInTimeZone } from '../../lib/dates'

const STATUSES: SlotStatus[] = ['scheduled', 'live', 'completed', 'cancelled']

const getLocalTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/** ISO instant → datetime-local input value in the viewer's local timezone. */
function toLocalInput(iso: string, tz: string): string {
  try {
    return formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd'T'HH:mm")
  } catch {
    return ''
  }
}

/** datetime-local input value (viewer-local) → ISO instant. */
function fromLocalInput(value: string): string | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formatSlotDate(iso: string, tz: string): string {
  try {
    return formatInTimeZone(new Date(iso), tz, "MMM d, yyyy 'at' h:mm a")
  } catch {
    return '—'
  }
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'text-blue-700 bg-blue-50',
  live: 'text-green-700 bg-green-50',
  completed: 'text-gray-500 bg-gray-100',
  cancelled: 'text-red-700 bg-red-50',
}

interface SlotFormState {
  startsAt: string
  endsAt: string
  status: SlotStatus
  title: string
}

const EMPTY_CREATE = {
  channelId: '',
  stationId: '',
  programId: '',
  form: { startsAt: '', endsAt: '', status: 'scheduled' as SlotStatus, title: '' },
}

export default function SessionsTab() {
  const { token } = useAdminToken()
  const localTz = useMemo(getLocalTimezone, [])

  const [filters, setFilters] = useState({ channelId: '', status: '', scope: 'upcoming' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<SlotFormState | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchChannels = useCallback(() => adminFetch<AdminChannel[]>('/channels', token), [token])
  const { data: channels } = usePolling(fetchChannels, 30000, [token])

  const fetchMeta = useCallback(() => adminFetch<AdminMeta>('/meta', token), [token])
  const { data: meta } = usePolling(fetchMeta, 60000, [token])

  const fetchSessions = useCallback(() => {
    const query = new URLSearchParams()
    if (filters.channelId) query.set('channelId', filters.channelId)
    if (filters.status) query.set('status', filters.status)
    if (filters.scope === 'all') query.set('scope', 'all')
    return adminFetch<ProgramSlot[]>(`/sessions?${query}`, token)
  }, [token, filters])
  const { data: sessions, loading, error: fetchError, refresh, lastUpdated } = usePolling(
    fetchSessions,
    10000,
    [token, filters],
  )

  const channelName = useMemo(() => {
    const map = new Map(channels?.map((c) => [c.id, c.name]) ?? [])
    return (id: string) => map.get(id) ?? id
  }, [channels])

  const handleSave = async (slot: ProgramSlot) => {
    if (!editForm) return
    const startsAt = editForm.startsAt ? fromLocalInput(editForm.startsAt) : undefined
    const endsAt = editForm.endsAt ? fromLocalInput(editForm.endsAt) : undefined
    if ((editForm.startsAt && !startsAt) || (editForm.endsAt && !endsAt)) {
      setError('Invalid date in edit form')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminFetch(`/sessions/${slot.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
          status: editForm.status,
          title: editForm.title.trim() ? editForm.title.trim() : null,
        }),
      })
      setEditingId(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (slot: ProgramSlot) => {
    if (!confirm(`Cancel the ${formatSlotDate(slot.startsAt, localTz)} session on ${channelName(slot.channelId)}?`)) return
    setError(null)
    try {
      await adminFetch(`/sessions/${slot.id}/cancel`, token, { method: 'POST' })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed')
    }
  }

  const handleCreate = async () => {
    const startsAt = fromLocalInput(createForm.form.startsAt)
    const endsAt = fromLocalInput(createForm.form.endsAt)
    if (!startsAt || !endsAt) {
      setError('Start and end are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminFetch('/sessions', token, {
        method: 'POST',
        body: JSON.stringify({
          channelId: createForm.channelId,
          stationId: createForm.stationId || null,
          programId: createForm.programId,
          startsAt,
          endsAt,
          title: createForm.form.title.trim() || undefined,
        }),
      })
      setShowCreate(false)
      setCreateForm(EMPTY_CREATE)
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
        <label className="text-sm">
          Channel:
          <select
            value={filters.channelId}
            onChange={(e) => setFilters({ ...filters, channelId: e.target.value })}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {channels?.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Status:
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Scope:
          <select
            value={filters.scope}
            onChange={(e) => setFilters({ ...filters, scope: e.target.value })}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="upcoming">Upcoming + active</option>
            <option value="all">All history</option>
          </select>
        </label>
        <button onClick={refresh} className="text-sm text-blue-600 hover:underline">Refresh</button>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-blue-600 hover:underline">
          {showCreate ? 'Cancel' : '+ New slot'}
        </button>
        {lastUpdated && (
          <span className="text-xs text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
        )}
        {(error || fetchError) && (
          <span className="text-xs text-red-500 ml-auto">Error: {error ?? fetchError?.message}</span>
        )}
      </div>

      {showCreate && (
        <div className="mb-4 p-4 border border-gray-200 rounded bg-gray-50">
          <div className="text-sm font-medium text-gray-700 mb-3">New one-off session window</div>
          <div className="grid grid-cols-3 gap-4 max-w-3xl">
            <label className="text-xs text-gray-600">
              Channel
              <select
                value={createForm.channelId}
                onChange={(e) => setCreateForm({ ...createForm, channelId: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {channels?.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Station
              <select
                value={createForm.stationId}
                onChange={(e) => setCreateForm({ ...createForm, stationId: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {meta?.stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Program
              <select
                value={createForm.programId}
                onChange={(e) => setCreateForm({ ...createForm, programId: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {meta?.programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Starts ({localTz})
              <input
                type="datetime-local"
                value={createForm.form.startsAt}
                onChange={(e) => setCreateForm({ ...createForm, form: { ...createForm.form, startsAt: e.target.value } })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Ends ({localTz})
              <input
                type="datetime-local"
                value={createForm.form.endsAt}
                onChange={(e) => setCreateForm({ ...createForm, form: { ...createForm.form, endsAt: e.target.value } })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Title (optional)
              <input
                type="text"
                value={createForm.form.title}
                onChange={(e) => setCreateForm({ ...createForm, form: { ...createForm.form, title: e.target.value } })}
                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !createForm.channelId || !createForm.programId || !createForm.form.startsAt || !createForm.form.endsAt}
            className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create slot'}
          </button>
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Channel</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Starts</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Ends</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions?.map((slot) => (
              <SessionRow
                key={slot.id}
                slot={slot}
                channelName={channelName(slot.channelId)}
                localTz={localTz}
                isEditing={editingId === slot.id}
                editForm={editingId === slot.id ? editForm : null}
                saving={saving}
                onEditStart={() => {
                  setEditingId(editingId === slot.id ? null : slot.id)
                  setEditForm(
                    editingId === slot.id
                      ? null
                      : {
                          startsAt: toLocalInput(slot.startsAt, localTz),
                          endsAt: toLocalInput(slot.endsAt, localTz),
                          status: (STATUSES as string[]).includes(slot.status) ? (slot.status as SlotStatus) : 'scheduled',
                          title: slot.title ?? '',
                        },
                  )
                }}
                onEditChange={setEditForm}
                onSave={() => handleSave(slot)}
                onCancel={() => handleCancel(slot)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {sessions?.length === 0 && !loading && (
        <p className="text-gray-500 mt-4 text-sm">No session windows found</p>
      )}
    </div>
  )
}

function SessionRow({
  slot,
  channelName,
  localTz,
  isEditing,
  editForm,
  saving,
  onEditStart,
  onEditChange,
  onSave,
  onCancel,
}: {
  slot: ProgramSlot
  channelName: string
  localTz: string
  isEditing: boolean
  editForm: SlotFormState | null
  saving: boolean
  onEditStart: () => void
  onEditChange: (form: SlotFormState) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="py-2 px-3 text-sm font-medium">
          {channelName}
          <div className="text-xs text-gray-400 font-normal">{slot.programId}</div>
        </td>
        <td className="py-2 px-3 text-sm text-gray-600">{slot.title ?? <span className="text-gray-400 italic">—</span>}</td>
        <td
          className="py-2 px-3 text-sm text-gray-600"
          title={formatInTimeZone(new Date(slot.startsAt), localTz, 'yyyy-MM-dd HH:mm zzz')}
        >
          {formatSlotDate(slot.startsAt, localTz)}
        </td>
        <td className="py-2 px-3 text-sm text-gray-600">{formatSlotDate(slot.endsAt, localTz)}</td>
        <td className="py-2 px-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[slot.status] ?? 'text-gray-500 bg-gray-100'}`}>
            {slot.status}
          </span>
        </td>
        <td className="py-2 px-3 text-sm whitespace-nowrap">
          <button onClick={onEditStart} className="text-xs text-blue-600 hover:underline mr-3">
            {isEditing ? 'Cancel edit' : 'Edit'}
          </button>
          {(slot.status === 'scheduled' || slot.status === 'live') && (
            <button onClick={onCancel} className="text-xs text-red-600 hover:underline">
              Cancel slot
            </button>
          )}
        </td>
      </tr>
      {isEditing && editForm && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-4 gap-4 max-w-3xl">
              <label className="text-xs text-gray-600">
                Starts ({localTz})
                <input
                  type="datetime-local"
                  value={editForm.startsAt}
                  onChange={(e) => onEditChange({ ...editForm, startsAt: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                Ends ({localTz})
                <input
                  type="datetime-local"
                  value={editForm.endsAt}
                  onChange={(e) => onEditChange({ ...editForm, endsAt: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                Status
                <select
                  value={editForm.status}
                  onChange={(e) => onEditChange({ ...editForm, status: e.target.value as SlotStatus })}
                  className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Title
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => onEditChange({ ...editForm, title: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </label>
            </div>
            <button
              onClick={onSave}
              disabled={saving}
              className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}
