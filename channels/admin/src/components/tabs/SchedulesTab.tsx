import { useState, useCallback, useMemo } from 'react';
import { useAdminToken } from '../../hooks/useAdminToken';
import { usePolling } from '../../hooks/usePolling';
import { adminFetch } from '../../api/client';
import type { AdminChannel, AdminMeta, ScheduleConfig, ScheduleRule } from '../../types';
import { TIMEZONE_OPTIONS, msToMinutes, minutesToMs, formatInTimeZone } from '../../lib/dates';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

interface ScheduleFormState {
  scheduledDays: string[]
  scheduledTime: string
  timezone: string
  episodeMinutes: number
  ambientMinutes: number
}

function formFromSchedule(schedule: ScheduleConfig): ScheduleFormState {
  return {
    scheduledDays: schedule.scheduledDays ?? [],
    scheduledTime: schedule.scheduledTime,
    timezone: schedule.timezone,
    episodeMinutes: msToMinutes(schedule.episodeDurationMs) ?? 30,
    ambientMinutes: msToMinutes(schedule.ambientDurationMs) ?? 15,
  }
}

function scheduleFromForm(form: ScheduleFormState): Partial<ScheduleConfig> {
  return {
    scheduledDays: form.scheduledDays.length ? form.scheduledDays : undefined,
    scheduledTime: form.scheduledTime,
    timezone: form.timezone,
    episodeDurationMs: minutesToMs(form.episodeMinutes) ?? undefined,
    ambientDurationMs: minutesToMs(form.ambientMinutes) ?? undefined,
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60_000)
  const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`
  return diff < 0 ? `${label} ago` : `in ${label}`
}

function ScheduleEditor({
  form,
  onChange,
}: {
  form: ScheduleFormState
  onChange: (form: ScheduleFormState) => void
}) {
  const toggleDay = (day: string) => {
    onChange({
      ...form,
      scheduledDays: form.scheduledDays.includes(day)
        ? form.scheduledDays.filter((d) => d !== day)
        : [...form.scheduledDays, day],
    })
  }
  return (
    <div className="grid grid-cols-2 gap-4 max-w-2xl">
      <div className="col-span-2">
        <div className="text-xs font-medium text-gray-600 mb-1">Days (none = every day)</div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label key={day} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={form.scheduledDays.includes(day)}
                onChange={() => toggleDay(day)}
              />
              <span className="capitalize">{day.slice(0, 3)}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="text-xs text-gray-600">
        Time (HH:MM)
        <input
          type="time"
          value={form.scheduledTime}
          onChange={(e) => onChange({ ...form, scheduledTime: e.target.value })}
          className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-gray-600">
        Timezone
        <select
          value={form.timezone}
          onChange={(e) => onChange({ ...form, timezone: e.target.value })}
          className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
        >
          {[...TIMEZONE_OPTIONS.map((o) => o.value), form.timezone]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
        </select>
      </label>
      <label className="text-xs text-gray-600">
        Episode duration (minutes)
        <input
          type="number"
          min={1}
          value={form.episodeMinutes}
          onChange={(e) => onChange({ ...form, episodeMinutes: Number(e.target.value) })}
          className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-gray-600">
        Ambient duration (minutes)
        <input
          type="number"
          min={1}
          value={form.ambientMinutes}
          onChange={(e) => onChange({ ...form, ambientMinutes: Number(e.target.value) })}
          className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </label>
    </div>
  )
}

const EMPTY_CREATE = {
  channelId: '',
  stationId: '',
  programId: '',
  form: {
    scheduledDays: [] as string[],
    scheduledTime: '19:00',
    timezone: 'America/Denver',
    episodeMinutes: 30,
    ambientMinutes: 15,
  } as ScheduleFormState,
}

export default function SchedulesTab() {
  const { token } = useAdminToken()
  const [channelFilter, setChannelFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ScheduleFormState | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchChannels = useCallback(() => adminFetch<AdminChannel[]>('/channels', token), [token])
  const { data: channels } = usePolling(fetchChannels, 30000, [token])

  const fetchMeta = useCallback(() => adminFetch<AdminMeta>('/meta', token), [token])
  const { data: meta } = usePolling(fetchMeta, 60000, [token])

  const fetchSchedules = useCallback(() => {
    const query = new URLSearchParams()
    if (channelFilter) query.set('channelId', channelFilter)
    return adminFetch<ScheduleRule[]>(`/schedules?${query}`, token)
  }, [token, channelFilter])
  const { data: schedules, loading, error: fetchError, refresh, lastUpdated } = usePolling(
    fetchSchedules,
    10000,
    [token, channelFilter],
  )

  const channelName = useMemo(() => {
    const map = new Map(channels?.map((c) => [c.id, c.name]) ?? [])
    return (id: string) => map.get(id) ?? id
  }, [channels])

  const handleSave = async (rule: ScheduleRule) => {
    if (!editForm) return
    setSaving(true)
    setError(null)
    try {
      await adminFetch(`/schedules/${rule.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ schedule: scheduleFromForm(editForm) }),
      })
      setEditingId(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rule: ScheduleRule) => {
    setError(null)
    try {
      await adminFetch(`/schedules/${rule.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      await adminFetch('/schedules', token, {
        method: 'POST',
        body: JSON.stringify({
          channelId: createForm.channelId,
          stationId: createForm.stationId || null,
          programId: createForm.programId,
          schedule: scheduleFromForm(createForm.form),
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
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value); setEditingId(null) }}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {channels?.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </label>
        <button onClick={refresh} className="text-sm text-blue-600 hover:underline">Refresh</button>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="text-sm text-blue-600 hover:underline"
        >
          {showCreate ? 'Cancel' : '+ New rule'}
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
          <div className="text-sm font-medium text-gray-700 mb-3">New schedule rule</div>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mb-3">
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
          </div>
          <ScheduleEditor
            form={createForm.form}
            onChange={(form) => setCreateForm({ ...createForm, form })}
          />
          <button
            onClick={handleCreate}
            disabled={saving || !createForm.channelId || !createForm.programId}
            className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create rule'}
          </button>
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Channel</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Station / Program</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Days</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Durations</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Next run</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules?.map((rule) => (
              <ScheduleRuleRow
                key={rule.id}
                rule={rule}
                channelName={channelName(rule.channelId)}
                isEditing={editingId === rule.id}
                editForm={editingId === rule.id ? editForm : null}
                saving={saving}
                onEditStart={() => {
                  setEditingId(editingId === rule.id ? null : rule.id)
                  setEditForm(editingId === rule.id ? null : formFromSchedule(rule.schedule))
                }}
                onEditChange={setEditForm}
                onSave={() => handleSave(rule)}
                onToggle={() => handleToggle(rule)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {schedules?.length === 0 && !loading && (
        <p className="text-gray-500 mt-4 text-sm">No schedule rules found</p>
      )}
    </div>
  )
}

function ScheduleRuleRow({
  rule,
  channelName,
  isEditing,
  editForm,
  saving,
  onEditStart,
  onEditChange,
  onSave,
  onToggle,
}: {
  rule: ScheduleRule
  channelName: string
  isEditing: boolean
  editForm: ScheduleFormState | null
  saving: boolean
  onEditStart: () => void
  onEditChange: (form: ScheduleFormState) => void
  onSave: () => void
  onToggle: () => void
}) {
  const days = rule.schedule.scheduledDays?.length
    ? rule.schedule.scheduledDays.map((d) => d.slice(0, 3)).join(', ')
    : 'Every day'
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="py-2 px-3 text-sm font-medium">{channelName}</td>
        <td className="py-2 px-3 text-xs text-gray-500">
          {rule.stationId ?? '—'} / {rule.programId}
        </td>
        <td className="py-2 px-3 text-sm text-gray-600 capitalize">{days}</td>
        <td className="py-2 px-3 text-sm text-gray-600">
          {rule.schedule.scheduledTime} <span className="text-xs text-gray-400">({rule.schedule.timezone})</span>
        </td>
        <td className="py-2 px-3 text-xs text-gray-500">
          {msToMinutes(rule.schedule.episodeDurationMs) ?? '—'}m ep · {msToMinutes(rule.schedule.ambientDurationMs) ?? '—'}m amb
        </td>
        <td className="py-2 px-3">
          <button
            onClick={onToggle}
            title="Toggle enabled"
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              rule.enabled ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'
            }`}
          >
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </td>
        <td
          className="py-2 px-3 text-sm text-gray-600"
          title={rule.nextRunAt ? formatInTimeZone(new Date(rule.nextRunAt), rule.schedule.timezone, 'yyyy-MM-dd HH:mm zzz') : undefined}
        >
          {formatRelative(rule.nextRunAt)}
        </td>
        <td className="py-2 px-3 text-sm">
          <button onClick={onEditStart} className="text-xs text-blue-600 hover:underline">
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
        </td>
      </tr>
      {isEditing && editForm && (
        <tr>
          <td colSpan={8} className="px-4 py-4 bg-gray-50 border-b border-gray-200">
            <ScheduleEditor form={editForm} onChange={onEditChange} />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={onSave}
                disabled={saving}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save & reschedule'}
              </button>
              <span className="text-xs text-gray-400">
                Saving resets next_run_at; the slot scheduler recomputes occurrences on its next tick.
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
