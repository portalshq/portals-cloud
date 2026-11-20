import { useState, useEffect, useCallback, useRef } from 'react'

export function usePolling<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  interval: number,
  deps: React.DependencyList = []
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const failuresRef = useRef(0)
  const runningRef = useRef(false)

  const refresh = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      setError(null)
      const result = await fetchFn(controller.signal)
      setData(result)
      setLastUpdated(new Date())
      failuresRef.current = 0
    } catch (err) {
      if (controller.signal.aborted) return
      const error = err instanceof Error ? err : new Error('Unknown error in usePolling');
      // Log for debugging — do not silently swallow
      console.error('[usePolling] Fetch failed:', error);
      setError(error);
      failuresRef.current++
    } finally {
      if (controllerRef.current === controller) controllerRef.current = undefined
      runningRef.current = false
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    void refresh()
    return () => controllerRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ...deps])

  useEffect(() => {
    let stopped = false
    const schedule = () => {
      if (stopped || interval <= 0) return
      timerRef.current = setTimeout(async () => {
        if (typeof document === 'undefined' || !document.hidden) await refresh()
        schedule()
      }, Math.round(interval * 2 ** Math.min(failuresRef.current, 4) * (0.9 + Math.random() * 0.2)))
    }
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) void refresh()
    }
    schedule()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopped = true
      if (timerRef.current) clearTimeout(timerRef.current)
      controllerRef.current?.abort()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [interval, refresh])

  return { data, loading, error, lastUpdated, refresh }
}
