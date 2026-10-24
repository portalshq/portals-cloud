'use client'

import {useEffect, useState} from 'react'
import {useRouter} from 'next/navigation'

const REDIRECT_SECONDS = 6

export function CheckoutSuccessRedirect({href}: {href: string}) {
  const router = useRouter()
  const [secondsRemaining, setSecondsRemaining] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    const redirectTimeout = window.setTimeout(
      () => router.replace(href),
      REDIRECT_SECONDS * 1000,
    )
    const countdownInterval = window.setInterval(() => {
      setSecondsRemaining((remaining) => Math.max(remaining - 1, 0))
    }, 1000)

    return () => {
      window.clearTimeout(redirectTimeout)
      window.clearInterval(countdownInterval)
    }
  }, [href, router])

  return (
    <p className="mt-16 t-p-sans text-white/80" role="status" aria-live="polite">
      Redirecting in {secondsRemaining}…
    </p>
  )
}
