'use client'

export type FormDraft = Record<string, string>

const DRAFT_PREFIX = 'portals_form_draft'
const DRAFT_TTL_MS = 90 * 24 * 60 * 60 * 1000
const DRAFT_MAX_CHARS = 16_000

const EXCLUDED_DRAFT_FIELDS = new Set(['companyFax'])

type DraftEnvelope = {
  values: FormDraft
  savedAt: number
}

export function formDraftKey(formName: string): string {
  return `${DRAFT_PREFIX}:${formName}`
}

export function readFormDraft(key: string): FormDraft {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const envelope = JSON.parse(raw) as Partial<DraftEnvelope>
    if (!envelope.values || typeof envelope.values !== 'object') return {}
    if (
      typeof envelope.savedAt === 'number' &&
      Date.now() - envelope.savedAt > DRAFT_TTL_MS
    ) {
      window.localStorage.removeItem(key)
      return {}
    }
    const values: FormDraft = {}
    for (const [name, value] of Object.entries(envelope.values)) {
      if (typeof value === 'string' && value) values[name] = value
    }
    return values
  } catch {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // drafts must never throw
    }
    return {}
  }
}

export function writeFormDraft(key: string, values: FormDraft) {
  if (typeof window === 'undefined') return
  const names = Object.keys(values)
  if (names.length === 0) return
  try {
    const serialized = JSON.stringify({
      values,
      savedAt: Date.now(),
    } satisfies DraftEnvelope)
    if (serialized.length <= DRAFT_MAX_CHARS) {
      window.localStorage.setItem(key, serialized)
    }
  } catch {
    // drafts must never break the form
  }
}

export function clearFormDraft(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // drafts must never throw
  }
}

export function clearAllFormDrafts() {
  if (typeof window === 'undefined') return
  try {
    const removable: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const name = window.localStorage.key(index)
      if (name && name.startsWith(`${DRAFT_PREFIX}:`)) removable.push(name)
    }
    for (const name of removable) window.localStorage.removeItem(name)
  } catch {
    // drafts must never throw
  }
}

function isUsableDraftControl(control: Element | RadioNodeList | null): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  )
}

function controlValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    return control.checked ? 'on' : ''
  }
  return control.value
}

export function collectDraftValues(form: HTMLFormElement): FormDraft {
  const values: FormDraft = {}
  const controls = form.elements
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls.item(index)
    if (!isUsableDraftControl(control)) continue
    if (!control.name || EXCLUDED_DRAFT_FIELDS.has(control.name)) continue
    if (control.disabled || control.closest('[inert]')) continue
    if (control instanceof HTMLInputElement && control.type === 'hidden') continue
    const value = controlValue(control)
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (value) values[control.name] = value
      continue
    }
    const trimmed = value.trim()
    if (trimmed) values[control.name] = trimmed
  }
  return values
}

export function applyDraftValues(form: HTMLFormElement, values: FormDraft) {
  for (const [name, value] of Object.entries(values)) {
    const control = form.elements.namedItem(name)
    if (!isUsableDraftControl(control)) continue
    if (control.disabled) continue
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = value === 'on'
    } else if (control instanceof HTMLSelectElement) {
      const matches = [...control.options].some((option) => option.value === value)
      if (matches) control.value = value
    } else {
      control.value = value
    }
  }
}
