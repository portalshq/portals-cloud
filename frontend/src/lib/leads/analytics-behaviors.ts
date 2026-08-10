'use client'

import {useEffect, useRef} from 'react'
import {trackEvent} from './analytics-client'

export const SCROLL_DEPTHS = [25, 50, 75, 90, 100] as const
export const MAX_LABEL_LENGTH = 120
export const MAX_DESTINATION_LENGTH = 300
export const SCROLL_DEBOUNCE_MS = 1000

export function scrollBucket(depth: number): number | null {
  const clamped = Math.max(0, Math.min(100, depth))
  let reached: number | null = null
  for (const threshold of SCROLL_DEPTHS) {
    if (clamped >= threshold) reached = threshold
  }
  return reached
}

export function cleanLabel(text: string, maximum = MAX_LABEL_LENGTH): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maximum)
}

export function linkIsExternal(href: string, origin: string): boolean {
  if (href.startsWith('#') || href.startsWith('?') || href.startsWith('//')) {
    return href.startsWith('//')
  }
  if (href.startsWith('/')) return false
  try {
    const host = new URL(href, origin).host
    const current = new URL(origin).host
    return host !== current
  } catch {
    return true
  }
}

function scrollDepth(): number {
  const height = document.documentElement.scrollHeight - window.innerHeight
  if (height <= 0) return 100
  return Math.round((window.scrollY / height) * 100)
}

export function useBehaviorTracking(pathname: string, active: boolean) {
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const reachedRef = useRef<Set<number>>(new Set())
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveSentRef = useRef(false)
  const startedAtRef = useRef(Date.now())

  useEffect(() => {
    pathnameRef.current = pathname
    reachedRef.current = new Set()
    leaveSentRef.current = false
    startedAtRef.current = Date.now()
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = null
    }
    if (!active) return

    const trackPageLeave = () => {
      if (leaveSentRef.current) return
      leaveSentRef.current = true
      void trackEvent('page_leave', {
        path: pathnameRef.current,
        time_on_page_seconds: Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        ),
      })
    }

    const onScroll = () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => {
        const bucket = scrollBucket(scrollDepth())
        if (bucket === null || reachedRef.current.has(bucket)) return
        reachedRef.current.add(bucket)
        void trackEvent('scroll_depth', {
          path: pathnameRef.current,
          depth_pct: bucket,
        })
      }, SCROLL_DEBOUNCE_MS)
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const faqTrigger = target.closest<HTMLElement>('[data-faq-question]')
      if (faqTrigger?.dataset.faqQuestion) {
        void trackEvent('faq_expanded', {
          faq_question: cleanLabel(faqTrigger.dataset.faqQuestion),
          path: pathnameRef.current,
        })
        return
      }
      if (target.closest('[data-analytics-cta]')) return
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (anchor) {
        const href = anchor.getAttribute('href') || ''
        void trackEvent('link_clicked', {
          link_text: cleanLabel(
            anchor.textContent || anchor.getAttribute('aria-label') || href,
          ),
          destination: cleanLabel(href, MAX_DESTINATION_LENGTH),
          external: linkIsExternal(href, window.location.origin),
          path: pathnameRef.current,
        })
        return
      }
      const button = target.closest<HTMLButtonElement>('button')
      if (button) {
        void trackEvent('button_clicked', {
          button_text: cleanLabel(
            button.textContent || button.getAttribute('aria-label') || '',
          ),
          path: pathnameRef.current,
        })
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') trackPageLeave()
    }

    window.addEventListener('scroll', onScroll, {passive: true})
    document.addEventListener('click', onClick, true)
    window.addEventListener('pagehide', trackPageLeave)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('pagehide', trackPageLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [pathname, active])
}