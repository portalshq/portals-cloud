import React from 'react'
import {
  ResourcePdfDocument,
  type ResourcePdfAssets,
} from '../components/pdf/ResourcePdfDocument'
import type {ResourceDocument} from '../types/resource'

export type ResourceTemplateProps = {
  document: ResourceDocument
  assets?: ResourcePdfAssets
}

/**
 * Broad PDF resource template. Content, cover style, page size, metadata,
 * sections, tables, figures, legal notes, and running furniture are data-driven.
 */
export function ResourceTemplate({document, assets}: ResourceTemplateProps) {
  return <ResourcePdfDocument document={document} assets={assets} />
}
