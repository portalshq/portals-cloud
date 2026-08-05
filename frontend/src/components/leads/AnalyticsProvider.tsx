'use client'

import {useEffect, useState} from 'react'
import {usePathname, useSearchParams} from 'next/navigation'
import {CTAButton} from '@/components/CTAButton'
import {
  analyticsConsent,
  captureFirstTouch,
  captureQualificationBehavior,
  setAnalyticsConsent,
  trackEvent,
  type AnalyticsConsent,
} from '@/lib/leads/analytics-client'

export function AnalyticsProvider() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [consent, setConsent] = useState<AnalyticsConsent>(null)

  useEffect(() => {
    captureFirstTouch()
    setConsent(analyticsConsent())
  }, [])

  useEffect(() => {
    captureQualificationBehavior(pathname)
    if (consent === 'accepted') {
      void trackEvent('page_viewed', {
        path: pathname,
        query_present: searchParams.size > 0,
      })
    }
  }, [consent, pathname, searchParams])

  if (consent !== null) return null

  return (
    <aside
      aria-label="analytics preferences"
      className="fixed inset-x-0 bottom-0 z-[10000] bg-[#101010] px-sms py-16 text-white shadow-[0_-12px_40px_rgba(0,0,0,0.28)]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-16 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[58em] t-p-sm-sans text-white">
          portals uses optional analytics to understand which workflows lead to useful commercial outcomes. no form answers or free text are sent to analytics.
        </p>
        <div className="flex shrink-0 gap-10">
          <CTAButton
            type="button"
            className="!min-w-0"
            onClick={() => {
              setAnalyticsConsent('rejected')
              setConsent('rejected')
            }}
          >
            decline
          </CTAButton>
          <CTAButton
            type="button"
            className="!min-w-0"
            onClick={() => {
              setAnalyticsConsent('accepted')
              setConsent('accepted')
            }}
          >
            allow analytics
          </CTAButton>
        </div>
      </div>
    </aside>
  )
}
