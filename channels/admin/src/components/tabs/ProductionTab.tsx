import { useState, useCallback } from 'react'
import { useAdminToken } from '../../hooks/useAdminToken'
import { usePolling } from '../../hooks/usePolling'
import { adminFetch } from '../../api/client'
import type { ProductionStatus } from '../../types'
import { formatDisplayDate } from '../../lib/dates'

const MODE_STYLES: Record<string, string> = {
  episode: 'text-green-700 bg-green-50',
  preparing: 'text-amber-700 bg-amber-50',
  ambient: 'text-blue-700 bg-blue-50',
  stopped: 'text-gray-500 bg-gray-100',
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="border border-gray-200 rounded">
      <div className="px-3 py-2 border-b border-gray-200 text-xs font-medium text-gray-600">{title}</div>
      <pre className="p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto">
        {value === undefined || value === null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export default function ProductionTab() {
  const { token } = useAdminToken()
  const [actionResult, setActionResult] = useState<string>('')
  const [acting, setActing] = useState(false)

  const fetchStatus = useCallback(() => adminFetch<ProductionStatus>('/production/status', token), [token])
  const { data: status, loading, error, refresh, lastUpdated } = usePolling(fetchStatus, 10000, [token])

  const runAction = async (action: 'start' | 'stop' | 'test-closing') => {
    if (action === 'stop' && !confirm('Stop production? This ends the show and releases the Reactor session.')) return
    setActing(true)
    setActionResult('')
    try {
      const result = await adminFetch<unknown>(`/production/${action}`, token, { method: 'POST' })
      setActionResult(JSON.stringify(result, null, 2))
      refresh()
    } catch (err) {
      setActionResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex gap-4 mb-4 items-center flex-wrap">
        <button onClick={refresh} className="text-sm text-blue-600 hover:underline">Refresh</button>
        {lastUpdated && (
          <span className="text-xs text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
        )}
        {error && <span className="text-xs text-red-500 ml-auto">Error: {error.message}</span>}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => runAction('start')}
          disabled={acting}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          Start production
        </button>
        <button
          onClick={() => runAction('stop')}
          disabled={acting}
          className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
        >
          Stop production
        </button>
        <button
          onClick={() => runAction('test-closing')}
          disabled={acting}
          className="px-3 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50"
        >
          Test closing (dry-run only)
        </button>
      </div>

      {actionResult && (
        <pre className="mb-4 bg-gray-100 p-3 rounded text-xs overflow-x-auto max-w-2xl">{actionResult}</pre>
      )}

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      <h2 className="text-sm font-semibold text-gray-700 mb-2">Production checkpoints</h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Channel</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Desired</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Mode</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Slot key</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Session</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Updated</th>
            </tr>
          </thead>
          <tbody>
            {status?.checkpoints.map((cp) => (
              <tr key={cp.channelId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 text-sm font-mono text-gray-700">{cp.channelId}</td>
                <td className="py-2 px-3 text-sm text-gray-600">{cp.desired}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${MODE_STYLES[cp.mode] ?? 'text-gray-500 bg-gray-100'}`}>
                    {cp.mode}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs text-gray-500 font-mono">{cp.slotKey ?? '—'}</td>
                <td className="py-2 px-3 text-xs text-gray-500 font-mono">{cp.sessionId ?? '—'}</td>
                <td className="py-2 px-3 text-sm text-gray-600">{formatDisplayDate(cp.updatedAt)}</td>
              </tr>
            ))}
            {status?.checkpoints.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 px-3 text-sm text-gray-400 italic">No production checkpoints</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-2">Bears server</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
        <JsonPanel title="GET /api/health" value={status?.bearsHealth} />
        <JsonPanel title="GET /api/channel" value={status?.bearsChannel} />
      </div>
    </div>
  )
}
