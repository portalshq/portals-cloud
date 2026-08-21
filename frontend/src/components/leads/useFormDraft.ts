'use client'

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  applyDraftValues,
  clearFormDraft,
  collectDraftValues,
  formDraftKey,
  readFormDraft,
  writeFormDraft,
  type FormDraft,
} from '@/lib/leads/form-draft'
import {shouldSkipFormDraftRestore} from '@/lib/leads/client'

const PERSIST_DELAY_MS = 350

export function useFormDraft(formName: string) {
  const storageKey = useMemo(() => formDraftKey(formName), [formName])
  const [formElement, setFormElement] = useState<HTMLFormElement | null>(null)
  const [restored, setRestored] = useState<FormDraft>({})
  const timerRef = useRef<number | null>(null)

  const ref = useCallback((element: HTMLFormElement | null) => {
    setFormElement(element)
  }, [])

  const persist = useCallback(() => {
    if (!formElement) return
    writeFormDraft(storageKey, collectDraftValues(formElement))
  }, [formElement, storageKey])

  const schedulePersist = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(persist, PERSIST_DELAY_MS)
  }, [persist])

  useEffect(() => {
    if (!formElement) return
    formElement.addEventListener('input', schedulePersist)
    formElement.addEventListener('change', schedulePersist)
    return () => {
      formElement.removeEventListener('input', schedulePersist)
      formElement.removeEventListener('change', schedulePersist)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [formElement, schedulePersist])

  useEffect(() => {
    if (!formElement) return
    
    // Skip draft restoration if a profile reset just occurred
    if (shouldSkipFormDraftRestore()) {
      setRestored({})
      return
    }
    
    const values = readFormDraft(storageKey)
    setRestored(values)
    applyDraftValues(formElement, values)
    const frame = window.requestAnimationFrame(() => {
      applyDraftValues(formElement, readFormDraft(storageKey))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [formElement, storageKey])

  const flush = useCallback(() => {
    persist()
  }, [persist])

  const clear = useCallback(() => {
    clearFormDraft(storageKey)
    setRestored({})
  }, [storageKey])

  return {ref, restored, flush, clear}
}
