import { useState, useEffect, useCallback, useRef } from 'react'

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  interval: number,
  deps: React.DependencyList = []
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const runningRef = useRef(false)

  const refresh = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      setError(null)
      const result = await fetchFn()
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error in usePolling');
      // Log for debugging — do not silently swallow
      console.error('[usePolling] Fetch failed:', error);
      setError(error);
    } finally {
      runningRef.current = false
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ...deps])

  useEffect(() => {
    let stopped = false
    const schedule = () => {
      if (stopped || interval <= 0) return
      timerRef.current = setTimeout(async () => {
        if (typeof document === 'undefined' || !document.hidden) await refresh()
        schedule()
      }, interval)
    }
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) void refresh()
    }
    schedule()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopped = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [interval, refresh])

  return { data, loading, error, lastUpdated, refresh }
}
