'use client'

import {useState} from 'react'
import styles from './PxLandingPage.module.css'

export function PxCodeBlock({children}: {children: string}) {
  const [copied, setCopied] = useState(false)

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={styles.codeWrap}>
      <pre className={`${styles.code} p-18`}><code>{children}</code></pre>
      <button type="button" className={styles.copyButton} onClick={copyCommand} aria-label={copied ? 'Copied command' : 'Copy command'}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
