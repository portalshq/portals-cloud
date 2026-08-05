import type {LeadSubmissionType} from './contracts'
import {DEFAULT_GITHUB_PDF_BASE_URL} from '@/lib/resource-pdf'

const files: Partial<Record<LeadSubmissionType, string>> = {
  guide_download: 'production-memory-field-guide.pdf',
  security_download: 'portals-security-architecture-brief.pdf',
  pilot_brief_download: 'portals-paid-production-pilot-brief.pdf',
}

export function leadDownloadUrl(type: LeadSubmissionType): string | undefined {
  const file = files[type]
  if (!file) return undefined
  const base = process.env.NEXT_PUBLIC_PDF_BASE_URL || DEFAULT_GITHUB_PDF_BASE_URL
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(file)}`
}
