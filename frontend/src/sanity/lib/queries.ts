import {defineQuery} from 'next-sanity'

export const PACKAGE_SPECIFICATION_FIELDS = /* groq */ `
  _id,
  _updatedAt,
  status,
  packageKind,
  name,
  shortName,
  "slug": slug.current,
  sortOrder,
  subtitle,
  price,
  limits,
  features,
  milestones,
  serviceItems,
  ctaLabel,
  microcopy,
  legalNote
`

export const RESOURCE_BY_SLUG_QUERY = defineQuery(`
  *[
    _type == "resourceDocument"
    && slug.current == $slug
    && status == "published"
  ][0] {
    _id,
    _updatedAt,
    status,
    resourceKind,
    title,
    shortTitle,
    "slug": slug.current,
    subtitle,
    abstract,
    audience,
    "coverImageUrl": coverImage.asset->url,
    publisher,
    authors,
    publishedAt,
    edition,

    seo {
      metaTitle,
      metaDescription,
      keywords,
      shareTitle,
      shareDescription,
      "shareImageUrl": shareImage.asset->url,
      canonicalPath,
      noIndex
    },

    landingPage {
      enabled,
      eyebrow,
      headline,
      description,
      primaryCta,
      secondaryCta,
      showPublicationMeta,
      showSectionNavigation
    },

    pdf,

    packageSpecifications[]-> {
      ${PACKAGE_SPECIFICATION_FIELDS}
    },

    sections[] {
      _key,
      sectionType,
      "anchor": anchor.current,
      eyebrow,
      title,
      summary,
      landingExcerpt,
      surfaces,
      sectionCta,
      pdfOptions,

      body[] {
        ...,

        markDefs[] {
          ...,
          _type == "internalLink" => {
            "slug": reference->slug.current
          },
          _type == "packageSpecValue" => {
            valuePath,
            packageSpecification-> {
              ${PACKAGE_SPECIFICATION_FIELDS}
            }
          }
        },

        _type == "figureBlock" => {
          ...,
          "imageUrl": image.asset->url
        },

        _type == "packageSpecReferenceBlock" => {
          ...,
          packageSpecification-> {
            ${PACKAGE_SPECIFICATION_FIELDS}
          }
        }
      }
    },

    finalCta,

    relatedResources[]-> {
      _id,
      title,
      "slug": slug.current,
      abstract
    }
  }
`)

export const PACKAGE_SPECIFICATIONS_QUERY = defineQuery(`
  *[
    _type == "packageSpecification"
    && status == "published"
    && defined(slug.current)
  ] | order(sortOrder asc) {
    ${PACKAGE_SPECIFICATION_FIELDS}
  }
`)

export const PACKAGE_SPECIFICATION_BY_SLUG_QUERY = defineQuery(`
  *[
    _type == "packageSpecification"
    && slug.current == $slug
    && status == "published"
  ][0] {
    ${PACKAGE_SPECIFICATION_FIELDS}
  }
`)

export const RESOURCE_SLUGS_QUERY = defineQuery(`
  *[
    _type == "resourceDocument"
    && status == "published"
    && defined(slug.current)
  ] {
    "slug": slug.current
  }
`)

export const LEGAL_DOCUMENT_BY_TYPE_QUERY = defineQuery(`
  *[
    _type == "legalDocument"
    && documentType == $documentType
    && status == "published"
  ] | order(effectiveDate desc)[0] {
    _id,
    _updatedAt,
    status,
    documentType,
    title,
    "slug": slug.current,
    summary,
    effectiveDate,
    contactEmail,

    sections[] {
      _key,
      "anchor": anchor.current,
      title,
      body[] {
        ...,
        markDefs[] {
          ...
        }
      }
    },

    seo {
      metaTitle,
      metaDescription,
      canonicalPath,
      noIndex
    }
  }
`)

export const USE_CASES_QUERY = defineQuery(/* groq */ `
  *[
    _type == "useCaseDocument"
    && status == "published"
    && defined(slug.current)
  ] | order(sortOrder asc, title asc) {
    _id,
    _updatedAt,
    title,
    "slug": slug.current,
    outcome,
    event,
    buyers,
    remedy,
    booster,
    measure,
    sortOrder
  }
`)

export const USE_CASE_BY_SLUG_QUERY = defineQuery(/* groq */ `
  *[
    _type == "useCaseDocument"
    && status == "published"
    && slug.current == $slug
  ][0] {
    _id,
    _updatedAt,
    title,
    "slug": slug.current,
    outcome,
    event,
    buyers,
    remedy,
    booster,
    measure,
    sortOrder
  }
`)

export const BLOG_CARD_FIELDS = /* groq */ `
  _id,
  _updatedAt,
  title,
  "slug": slug.current,
  definition,
  excerpt,
  publishedAt,
  cluster,
  priority,
  tags,
  "coverImageUrl": coverImage.asset->url,
  keyTakeaways
`

export const BLOG_POSTS_QUERY = defineQuery(/* groq */ `
  *[
    _type == "blogPostDocument"
    && status == "published"
    && defined(slug.current)
  ] | order(priority asc, publishedAt desc) {
    ${BLOG_CARD_FIELDS}
  }
`)

export const BLOG_POST_SLUGS_QUERY = defineQuery(/* groq */ `
  *[
    _type == "blogPostDocument"
    && status == "published"
    && defined(slug.current)
  ] {
    "slug": slug.current
  }
`)

export const BLOG_POST_BY_SLUG_QUERY = defineQuery(/* groq */ `
  *[
    _type == "blogPostDocument"
    && status == "published"
    && slug.current == $slug
  ][0] {
    ${BLOG_CARD_FIELDS},
    authors[]{name, role},
    seo {
      metaTitle,
      metaDescription,
      keywords,
      shareTitle,
      shareDescription,
      "shareImageUrl": shareImage.asset->url,
      canonicalPath,
      noIndex
    },
    body[] {
      ...,
      markDefs[] {
        ...,
        _type == "internalLink" => {
          "slug": reference->slug.current
        }
      },
      _type == "figureBlock" => {
        ...,
        "imageUrl": image.asset->url
      }
    },
    faqs[]{question, answer},
    relatedPosts[]-> {
      ${BLOG_CARD_FIELDS}
    }
  }
`)
