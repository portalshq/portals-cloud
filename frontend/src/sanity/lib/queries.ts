import {defineQuery} from 'next-sanity'

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
          }
        },

        _type == "figureBlock" => {
          ...,
          "imageUrl": image.asset->url
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
