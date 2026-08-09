import type {ResourceDocument} from '@/types/resource'

export const DEFAULT_GITHUB_PDF_BASE_URL =
  'https://raw.githubusercontent.com/DigitalCreationsCo/portals-cloud/main/generated-assets/pdfs'

export function resolvePdfFileName(document: ResourceDocument): string {
  const configuredName = document.pdf?.fileName?.trim()
  const rawName = configuredName || document.slug
  const baseName = rawName.split('/').pop()?.split('\\').pop() || document.slug

  return baseName.endsWith('.pdf') ? baseName : `${baseName}.pdf`
}

export function resolvePdfDownloadUrl(document: ResourceDocument): string | null {
  if (document.pdf?.enabled === false) {
    return null
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_PDF_BASE_URL || DEFAULT_GITHUB_PDF_BASE_URL

  return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(resolvePdfFileName(document))}`
}
