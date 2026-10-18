'use client'

export type PilotConfirmation = {
  pilotUrl?: string
  calendarUrl?: string
  downloadUrl?: string
  pilotRoute?: string
  preview?: boolean
  confirmedAt: number
}

const CONFIRMATION_KEY = 'portals_pilot_confirmation'
const CONFIRMATION_TTL_MS = 90 * 24 * 60 * 60 * 1000

export function readPilotConfirmation(scope?: string): PilotConfirmation | null {
  if (typeof window === 'undefined') return null
  const key = scope ? `${CONFIRMATION_KEY}:${scope}` : CONFIRMATION_KEY
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const stored = JSON.parse(raw) as Partial<PilotConfirmation>
    if (
      typeof stored.confirmedAt !== 'number' ||
      Date.now() - stored.confirmedAt > CONFIRMATION_TTL_MS
    ) {
      window.localStorage.removeItem(key)
      return null
    }
    return {
      pilotUrl: typeof stored.pilotUrl === 'string' ? stored.pilotUrl : undefined,
      calendarUrl:
        typeof stored.calendarUrl === 'string' ? stored.calendarUrl : undefined,
      downloadUrl:
        typeof stored.downloadUrl === 'string' ? stored.downloadUrl : undefined,
      pilotRoute:
        typeof stored.pilotRoute === 'string' ? stored.pilotRoute : undefined,
      preview:
        typeof stored.preview === 'boolean' ? stored.preview : undefined,
      confirmedAt: stored.confirmedAt,
    }
  } catch {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // persistence must never throw
    }
    return null
  }
}

export function writePilotConfirmation(
  confirmation: Omit<PilotConfirmation, 'confirmedAt'>,
  scope?: string,
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      scope ? `${CONFIRMATION_KEY}:${scope}` : CONFIRMATION_KEY,
      JSON.stringify({...confirmation, confirmedAt: Date.now()}),
    )
  } catch {
    // persistence must never throw
  }
}

export function clearPilotConfirmation(scope?: string) {
  if (typeof window === 'undefined') return
  try {
    if (scope) window.localStorage.removeItem(`${CONFIRMATION_KEY}:${scope}`)
    else {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith(CONFIRMATION_KEY)) window.localStorage.removeItem(key)
    }
  } catch {
    // persistence must never throw
  }
}
