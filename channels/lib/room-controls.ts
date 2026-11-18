export type RoomAccount = {
  balance: number | null
  invite?: { label: string; run: () => void }
}

export type RoomSurface = 'embed' | 'preview'
export { previewElements, type PreviewElements } from './room-preview'

const SOUND_MUTED_KEY = 'channels:sound-muted'

export function getSoundMuted() {
  try {
    return typeof localStorage === 'undefined'
      ? true
      : localStorage.getItem(SOUND_MUTED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, String(muted))
  } catch {
    // Browser storage may be unavailable; audio controls still work in memory.
  }
}

export function createRoomSound(forceMuted = false) {
  let muted = forceMuted || getSoundMuted()
  const listeners = new Set<() => void>()
  return {
    getMuted: () => muted,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    toggle() {
      muted = !muted
      if (!forceMuted) setSoundMuted(muted)
      for (const listener of listeners) listener()
    },
  }
}
