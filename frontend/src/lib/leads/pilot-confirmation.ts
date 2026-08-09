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

export function readPilotConfirmation(): PilotConfirmation | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONFIRMATION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Partial<PilotConfirmation>
    if (
      typeof stored.confirmedAt !== 'number' ||
      Date.now() - stored.confirmedAt > CONFIRMATION_TTL_MS
    ) {
      window.localStorage.removeItem(CONFIRMATION_KEY)
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
      window.localStorage.removeItem(CONFIRMATION_KEY)
    } catch {
      // persistence must never throw
    }
    return null
  }
}

export function writePilotConfirmation(
  confirmation: Omit<PilotConfirmation, 'confirmedAt'>,
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      CONFIRMATION_KEY,
      JSON.stringify({...confirmation, confirmedAt: Date.now()}),
    )
  } catch {
    // persistence must never throw
  }
}

export function clearPilotConfirmation() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CONFIRMATION_KEY)
  } catch {
    // persistence must never throw
  }
}