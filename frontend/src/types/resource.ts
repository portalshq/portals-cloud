export type Cta = {
  label: string
  action: 'downloadPdf' | 'internal' | 'external'
  href?: string
  style?: 'primary' | 'secondary' | 'text'
  openInNewTab?: boolean
}

export type SpecificationValue = {
  _key?: string
  label: string
  displayValue: string
  numericValue?: number
  unit?: string
  qualifier?: string
  note?: string
}

export type PackageSpecification = {
  _id: string
  _updatedAt?: string
  status: 'draft' | 'published' | 'archived'
  packageKind: 'paidPilot' | 'subscription' | 'enterprise'
  name: string
  shortName?: string
  slug: string
  sortOrder: number
  subtitle?: string
  price?: {
    displayValue: string
    amount?: number
    currency?: string
    periodLabel?: string
    billingNote?: string
  }
  limits?: {
    productionTeams?: SpecificationValue
    activeWorkflows?: SpecificationValue
    historicalProjects?: SpecificationValue
    participants?: SpecificationValue
    productionMembers?: SpecificationValue
    activeRepositories?: SpecificationValue
    workspaces?: SpecificationValue
    reviewersGuests?: SpecificationValue
  }
  features?: string[]
  milestones?: SpecificationValue[]
  serviceItems?: string[]
  ctaLabel?: string
  microcopy?: string
  legalNote?: string
}

export type MarkDefinition = {
  _key: string
  _type: 'link' | 'internalLink' | 'packageSpecValue'
  href?: string
  slug?: string
  valuePath?: string
  packageSpecification?: PackageSpecification
}

export type PortableSpan = {
  _key?: string
  _type: 'span'
  text: string
  marks?: string[]
}

export type PortableTextBlock = {
  _key: string
  _type: string
  style?: 'normal' | 'h2' | 'h3' | 'blockquote'
  listItem?: 'bullet' | 'number'
  level?: number
  children?: PortableSpan[]
  markDefs?: MarkDefinition[]
  tone?: string
  title?: string
  text?: string
  body?: PortableTextBlock[]
  label?: string
  expression?: string
  note?: string
  quote?: string
  attribution?: string
  items?: Array<{
    _key?: string
    text?: string
    checked?: boolean
    value?: string
    label?: string
    note?: string
  }>
  rows?: Array<{
    _key?: string
    cells: string[]
  }>
  hasHeader?: boolean
  caption?: string
  alt?: string
  imageUrl?: string
  packageSpecification?: PackageSpecification
  valuePath?: string
}

export type DocumentSection = {
  _key: string
  sectionType: string
  anchor: string
  eyebrow?: string
  title: string
  summary?: string
  landingExcerpt?: string
  body: PortableTextBlock[]
  surfaces?: {
    landing?: 'hidden' | 'summary' | 'full'
    pdf?: boolean
    tableOfContents?: boolean
  }
  sectionCta?: Cta
  pdfOptions?: {
    startOnNewPage?: boolean
    keepTogether?: boolean
  }
}

export type ResourceDocument = {
  _id: string
  _updatedAt: string
  status: 'draft' | 'published' | 'archived'
  resourceKind: string
  title: string
  shortTitle?: string
  slug: string
  subtitle?: string
  abstract: string
  audience?: string[]
  coverImageUrl?: string
  publisher?: string
  authors?: Array<{
    _key?: string
    name: string
    role?: string
  }>
  publishedAt?: string
  edition?: string
  seo?: {
    metaTitle?: string
    metaDescription?: string
    keywords?: string[]
    shareTitle?: string
    shareDescription?: string
    shareImageUrl?: string
    canonicalPath?: string
    noIndex?: boolean
  }
  landingPage?: {
    enabled?: boolean
    eyebrow?: string
    headline?: string
    description?: string
    primaryCta?: Cta
    secondaryCta?: Cta
    showPublicationMeta?: boolean
    showSectionNavigation?: boolean
  }
  pdf?: {
    enabled?: boolean
    fileName?: string
    titleOverride?: string
    subtitleOverride?: string
    pageSize?: 'LETTER' | 'A4'
    coverStyle?: 'standard' | 'fullPageArtwork'
    coverBackgroundImageUrl?: string
    includeDocumentCoverImage?: boolean
    includeCover?: boolean
    includeTableOfContents?: boolean
    showPageNumbers?: boolean
    headerText?: string
    footerText?: string
    accentColor?: string
    legalNote?: string
  }
  sections: DocumentSection[]
  finalCta?: {
    eyebrow?: string
    headline: string
    description?: string
    primaryCta?: Cta
    secondaryCta?: Cta
  }
  packageSpecifications?: PackageSpecification[]
  relatedResources?: Array<{
    _id: string
    title: string
    slug: string
    abstract?: string
  }>
}

export type LegalDocument = {
  _id: string
  _updatedAt: string
  status: 'draft' | 'published' | 'archived'
  documentType: 'privacyPolicy' | 'termsOfService'
  title: string
  slug: string
  summary: string
  effectiveDate: string
  contactEmail: string
  sections: Array<{
    _key: string
    anchor: string
    title: string
    body: PortableTextBlock[]
  }>
  seo?: {
    metaTitle?: string
    metaDescription?: string
    canonicalPath?: string
    noIndex?: boolean
  }
}
