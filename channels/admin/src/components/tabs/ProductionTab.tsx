import { useState, useCallback } from 'react'
import { useAdminToken } from '../../hooks/useAdminToken'
import { usePolling } from '../../hooks/usePolling'
import { adminFetch } from '../../api/client'
import type { ProductionAppStatus, ProductionStatus } from '../../types'
import { formatDisplayDate } from '../../lib/dates'

const MODE_STYLES: Record<string, string> = {
  episode: 'text-[#24110c] bg-[#F06C49]',
  preparing: 'text-amber-700 bg-amber-50',
  ambient: 'text-blue-700 bg-blue-50',
  stopped: 'text-gray-500 bg-gray-100',
}

type ProductionAction = 'start' | 'stop' | 'test-closing'

const ACTIONS: { id: ProductionAction; label: string; className: string }[] = [
  {
    id: 'start',
    label: 'Start production',
    className: 'bg-[#F06C49] text-[#24110c] hover:bg-[#F58C70] disabled:bg-gray-500',
  },
  {
    id: 'stop',
    label: 'Stop production',
    className: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-500',
  },
  {
    id: 'test-closing',
    label: 'Test closing (dry-run only)',
    className: 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-gray-500',
  },
]

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="border border-gray-200 rounded">
      <div className="px-3 py-2 border-b border-gray-200 fontMicro text-gray-600">{title}</div>
      <pre className="p-3 fontMicro overflow-x-auto max-h-64 overflow-y-auto">
        {value === undefined || value === null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function AppPanel({ app, onAction }: {
  app: ProductionAppStatus
  onAction: (app: ProductionAppStatus, action: ProductionAction) => void
}) {
  const [acting, setActing] = useState<ProductionAction | null>(null)

  const runAction = async (action: ProductionAction) => {
    if (action === 'stop' && !confirm(`Stop production on ${app.channelId}? This ends the show and releases its sessions.`)) return
    setActing(action)
    try {
      await onAction(app, action)
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="border border-gray-200 rounded p-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h3 className="fontH2 text-gray-700">{app.channelId}</h3>
        <span className="fontMicro text-gray-400">{app.origin}</span>
        {!app.controlConfigured && (
          <span
            className="px-2 py-0.5 rounded fontMicro text-amber-700 bg-amber-50"
            title="No credential in channel_app_control_tokens for this channel"
          >
            control not configured
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => void runAction(action.id)}
            disabled={acting !== null || !app.controlConfigured}
            className={`px-3 py-1.5 rounded fontNormal disabled:cursor-not-allowed ${action.className}`}
          >
            {acting === action.id ? '…' : action.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonPanel title="GET /api/health" value={app.health} />
        <JsonPanel title="GET /api/channel" value={app.channel} />
      </div>
    </div>
  )
}

/**
 * Production across every registered app in the token's scope. Each panel
 * proxies start/stop/test-closing to that app's own production-control
 * endpoint with a server-side credential — the browser only holds the admin
 * token. The checkpoint table below shows the configured app database's
 * desired/mode state when one is available.
 */
export default function ProductionTab() {
  const { token } = useAdminToken()
  const [actionResults, setActionResults] = useState<Record<string, string>>({})

  const fetchStatus = useCallback((signal: AbortSignal) => adminFetch<ProductionStatus>('/production/status', token, { signal }), [token])
  const { data: status, loading, error, refresh, lastUpdated } = usePolling(fetchStatus, 10000, [token])

  const runAction = async (app: ProductionAppStatus, action: ProductionAction) => {
    setActionResults((results) => ({ ...results, [app.channelId]: '' }))
    try {
      const result = await adminFetch<unknown>(
        `/production/${encodeURIComponent(app.channelId)}/${action}`,
        token,
        { method: 'POST' },
      )
      setActionResults((results) => ({ ...results, [app.channelId]: JSON.stringify(result, null, 2) }))
      refresh()
    } catch (err) {
      setActionResults((results) => ({
        ...results,
        [app.channelId]: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }))
    }
  }

  return (
    <div className="p-4">
      <div className="flex gap-4 mb-4 items-center flex-wrap">
        <button onClick={refresh} className="fontNormal text-blue-600 hover:underline">Refresh</button>
        {lastUpdated && (
          <span className="fontMicro text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
        )}
        {error && <span className="fontMicro text-red-500 ml-auto">Error: {error.message}</span>}
      </div>

      {loading && <p className="text-gray-500 fontNormal">Loading…</p>}

      <h2 className="fontH2 text-gray-700 mb-2">Registered apps</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        {status?.apps.map((app) => (
          <div key={app.channelId}>
            <AppPanel app={app} onAction={runAction} />
            {actionResults[app.channelId] && (
              <pre className="mt-2 bg-gray-100 p-3 rounded fontMicro overflow-x-auto">{actionResults[app.channelId]}</pre>
            )}
          </div>
        ))}
        {status && status.apps.length === 0 && !loading && (
          <p className="text-gray-500 fontNormal">No registered apps in this token's scope</p>
        )}
      </div>

      <h2 className="fontH2 text-gray-700 mb-2">Production checkpoints</h2>
      <p className="fontMicro text-gray-400 mb-2">
        From the configured app database. Apps own their own checkpoints; the table below only covers the app database Channels can reach.
      </p>
      <div className="overflow-x-auto mb-6">
        <table className="w-full fontNormal border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Channel</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Desired</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Mode</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Slot key</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Session</th>
              <th className="text-left py-2 px-3 fontMicro text-gray-500 uppercase tracking-wide">Updated</th>
            </tr>
          </thead>
          <tbody>
            {status?.checkpoints.map((cp) => (
              <tr key={cp.channelId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 fontNormal text-gray-700">{cp.channelId}</td>
                <td className="py-2 px-3 fontNormal text-gray-600">{cp.desired}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded fontMicro ${MODE_STYLES[cp.mode] ?? 'text-gray-500 bg-gray-100'}`}>
                    {cp.mode}
                  </span>
                </td>
                <td className="py-2 px-3 fontMicro text-gray-500">{cp.slotKey ?? '—'}</td>
                <td className="py-2 px-3 fontMicro text-gray-500">{cp.sessionId ?? '—'}</td>
                <td className="py-2 px-3 fontNormal text-gray-600">{formatDisplayDate(cp.updatedAt)}</td>
              </tr>
            ))}
            {status?.checkpoints.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 px-3 fontNormal text-gray-400 italic">No production checkpoints</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
