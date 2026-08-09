import {defineArrayMember, defineField, defineType} from 'sanity'

export const cta = defineType({
  name: 'cta',
  title: 'Call to action',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'action',
      title: 'Action',
      type: 'string',
      initialValue: 'internal',
      options: {
        list: [
          {title: 'Download generated PDF', value: 'downloadPdf'},
          {title: 'Internal link', value: 'internal'},
          {title: 'External link', value: 'external'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'href',
      title: 'URL or path',
      type: 'string',
      description: 'Not required for generated PDF downloads.',
      hidden: ({parent}) => parent?.action === 'downloadPdf',
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as {action?: string} | undefined
          if (parent?.action !== 'downloadPdf' && !value) {
            return 'A URL or path is required for this action.'
          }
          return true
        }),
    }),
    defineField({
      name: 'style',
      title: 'Visual style',
      type: 'string',
      initialValue: 'primary',
      options: {
        list: [
          {title: 'Primary', value: 'primary'},
          {title: 'Secondary', value: 'secondary'},
          {title: 'Text link', value: 'text'},
        ],
      },
    }),
    defineField({
      name: 'openInNewTab',
      title: 'Open in new tab',
      type: 'boolean',
      initialValue: false,
      hidden: ({parent}) => parent?.action !== 'external',
    }),
  ],
})

export const calloutBlock = defineType({
  name: 'calloutBlock',
  title: 'Callout',
  type: 'object',
  fields: [
    defineField({
      name: 'tone',
      title: 'Tone',
      type: 'string',
      initialValue: 'insight',
      options: {
        list: [
          {title: 'Insight', value: 'insight'},
          {title: 'Important', value: 'important'},
          {title: 'Evidence', value: 'evidence'},
          {title: 'Warning', value: 'warning'},
        ],
      },
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'text',
      title: 'Text',
      type: 'text',
      rows: 4,
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'text',
    },
    prepare({title, subtitle}) {
      return {
        title: title || 'Callout',
        subtitle,
      }
    },
  },
})

export const formulaBlock = defineType({
  name: 'formulaBlock',
  title: 'Formula',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
    }),
    defineField({
      name: 'expression',
      title: 'Expression',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'note',
      title: 'Explanation',
      type: 'text',
      rows: 3,
    }),
  ],
  preview: {
    select: {
      title: 'label',
      subtitle: 'expression',
    },
    prepare({title, subtitle}) {
      return {
        title: title || 'Formula',
        subtitle,
      }
    },
  },
})

export const checklistBlock = defineType({
  name: 'checklistBlock',
  title: 'Checklist',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      validation: (rule) => rule.min(1),
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'text',
              title: 'Text',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'checked',
              title: 'Checked by default',
              type: 'boolean',
              initialValue: false,
            }),
          ],
          preview: {
            select: {
              title: 'text',
              checked: 'checked',
            },
            prepare({title, checked}) {
              return {
                title,
                subtitle: checked ? 'Checked' : 'Unchecked',
              }
            },
          },
        }),
      ],
    }),
  ],
})

export const quoteBlock = defineType({
  name: 'quoteBlock',
  title: 'Pull quote',
  type: 'object',
  fields: [
    defineField({
      name: 'quote',
      title: 'Quote',
      type: 'text',
      rows: 4,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'attribution',
      title: 'Attribution',
      type: 'string',
    }),
  ],
  preview: {
    select: {
      title: 'quote',
      subtitle: 'attribution',
    },
  },
})

export const metricGridBlock = defineType({
  name: 'metricGridBlock',
  title: 'Metric grid',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'items',
      title: 'Metrics',
      type: 'array',
      validation: (rule) => rule.min(1).max(6),
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'value',
              title: 'Value',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'note',
              title: 'Note',
              type: 'string',
            }),
          ],
          preview: {
            select: {
              title: 'value',
              subtitle: 'label',
            },
          },
        }),
      ],
    }),
  ],
})

export const packageSpecReferenceBlock = defineType({
  name: 'packageSpecReferenceBlock',
  title: 'Package specification reference',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'packageSpecification',
      title: 'Package specification',
      type: 'reference',
      to: [{type: 'packageSpecification'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'valuePath',
      title: 'Value path',
      type: 'string',
      description:
        'Optional. Examples: price.displayValue, limits.participants.displayValue, milestones.firstValue.displayValue.',
    }),
    defineField({
      name: 'label',
      title: 'Label override',
      type: 'string',
    }),
    defineField({
      name: 'note',
      title: 'Note',
      type: 'string',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'packageSpecification.name',
    },
    prepare({title, subtitle}) {
      return {
        title: title || 'Package specification reference',
        subtitle,
      }
    },
  },
})

export const dataTableBlock = defineType({
  name: 'dataTableBlock',
  title: 'Data table',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'hasHeader',
      title: 'First row is a header',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'rows',
      title: 'Rows',
      type: 'array',
      validation: (rule) => rule.min(1),
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'cells',
              title: 'Cells',
              type: 'array',
              validation: (rule) => rule.min(1),
              of: [defineArrayMember({type: 'string'})],
            }),
          ],
          preview: {
            select: {
              cells: 'cells',
            },
            prepare({cells = []}) {
              return {
                title: cells.join(' | '),
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'string',
    }),
  ],
})

export const figureBlock = defineType({
  name: 'figureBlock',
  title: 'Figure',
  type: 'object',
  fields: [
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'alt',
      title: 'Alternative text',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'string',
    }),
  ],
  preview: {
    select: {
      title: 'caption',
      media: 'image',
    },
    prepare({title, media}) {
      return {
        title: title || 'Figure',
        media,
      }
    },
  },
})

export const dividerBlock = defineType({
  name: 'dividerBlock',
  title: 'Divider',
  type: 'object',
  fields: [
    defineField({
      name: 'style',
      title: 'Style',
      type: 'string',
      initialValue: 'line',
      options: {
        list: [
          {title: 'Line', value: 'line'},
          {title: 'Space', value: 'space'},
        ],
      },
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Divider',
      }
    },
  },
})

export const resourceBody = defineType({
  name: 'resourceBody',
  title: 'Resource body',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Body', value: 'normal'},
        {title: 'Heading 2', value: 'h2'},
        {title: 'Heading 3', value: 'h3'},
        {title: 'Blockquote', value: 'blockquote'},
      ],
      lists: [
        {title: 'Bulleted list', value: 'bullet'},
        {title: 'Numbered list', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
          {title: 'Code', value: 'code'},
        ],
        annotations: [
          {
            name: 'packageSpecValue',
            title: 'Package specification value',
            type: 'object',
            fields: [
              defineField({
                name: 'packageSpecification',
                title: 'Package specification',
                type: 'reference',
                to: [{type: 'packageSpecification'}],
                validation: (rule) => rule.required(),
              }),
              defineField({
                name: 'valuePath',
                title: 'Value path',
                type: 'string',
                description:
                  'Examples: price.displayValue, limits.participants.displayValue.',
                validation: (rule) => rule.required(),
              }),
            ],
          },
          {
            name: 'link',
            title: 'External link',
            type: 'object',
            fields: [
              defineField({
                name: 'href',
                title: 'URL',
                type: 'url',
                validation: (rule) =>
                  rule.uri({
                    allowRelative: false,
                    scheme: ['http', 'https', 'mailto'],
                  }),
              }),
            ],
          },
          {
            name: 'internalLink',
            title: 'Internal resource link',
            type: 'object',
            fields: [
              defineField({
                name: 'reference',
                title: 'Resource',
                type: 'reference',
                to: [{type: 'resourceDocument'}],
              }),
            ],
          },
        ],
      },
    }),
    defineArrayMember({type: 'calloutBlock'}),
    defineArrayMember({type: 'formulaBlock'}),
    defineArrayMember({type: 'checklistBlock'}),
    defineArrayMember({type: 'quoteBlock'}),
    defineArrayMember({type: 'metricGridBlock'}),
    defineArrayMember({type: 'packageSpecReferenceBlock'}),
    defineArrayMember({type: 'dataTableBlock'}),
    defineArrayMember({type: 'figureBlock'}),
    defineArrayMember({type: 'dividerBlock'}),
  ],
})

export const documentSection = defineType({
  name: 'documentSection',
  title: 'Document section',
  type: 'object',
  fields: [
    defineField({
      name: 'sectionType',
      title: 'Section type',
      type: 'string',
      initialValue: 'narrative',
      options: {
        list: [
          {title: 'Narrative', value: 'narrative'},
          {title: 'Executive summary', value: 'summary'},
          {title: 'Framework', value: 'framework'},
          {title: 'Diagnostic', value: 'diagnostic'},
          {title: 'Workflow risk', value: 'risk'},
          {title: 'Cost model', value: 'cost'},
          {title: 'Standard', value: 'standard'},
          {title: 'Evaluation guidance', value: 'evaluation'},
          {title: 'Product', value: 'product'},
          {title: 'Offer', value: 'offer'},
          {title: 'Appendix', value: 'appendix'},
        ],
      },
    }),
    defineField({
      name: 'anchor',
      title: 'Anchor',
      type: 'slug',
      description: 'Used for URLs and PDF table-of-contents links.',
      options: {
        source: (_document, context) => {
          const parent = context.parent as {title?: string} | undefined
          return parent?.title || ''
        },
        maxLength: 80,
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'eyebrow',
      title: 'Eyebrow',
      type: 'string',
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'summary',
      title: 'Canonical summary',
      type: 'text',
      rows: 3,
      description: 'A concise summary reusable across surfaces.',
    }),
    defineField({
      name: 'body',
      title: 'Full section body',
      type: 'resourceBody',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'surfaces',
      title: 'Surface controls',
      type: 'object',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        defineField({
          name: 'landing',
          title: 'Landing-page treatment',
          type: 'string',
          initialValue: 'summary',
          options: {
            list: [
              {title: 'Do not show', value: 'hidden'},
              {title: 'Show summary only', value: 'summary'},
              {title: 'Show full section', value: 'full'},
            ],
            layout: 'radio',
          },
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'pdf',
          title: 'Include in PDF',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'tableOfContents',
          title: 'Include in table of contents',
          type: 'boolean',
          initialValue: true,
        }),
      ],
    }),
    defineField({
      name: 'landingExcerpt',
      title: 'Landing-page excerpt override',
      type: 'text',
      rows: 4,
      description:
        'Optional. Used instead of the canonical summary when the section is shown as a summary.',
      hidden: ({parent}) => parent?.surfaces?.landing !== 'summary',
    }),
    defineField({
      name: 'sectionCta',
      title: 'Section CTA',
      type: 'cta',
      hidden: ({parent}) => parent?.surfaces?.landing === 'hidden',
    }),
    defineField({
      name: 'pdfOptions',
      title: 'PDF options',
      type: 'object',
      options: {
        collapsible: true,
        collapsed: true,
      },
      fields: [
        defineField({
          name: 'startOnNewPage',
          title: 'Start on a new page',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'keepTogether',
          title: 'Try to keep section together',
          type: 'boolean',
          initialValue: false,
          description:
            'Use only for short sections. Long sections must be allowed to wrap.',
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'sectionType',
    },
  },
})

export const seoSettings = defineType({
  name: 'seoSettings',
  title: 'SEO settings',
  type: 'object',
  fields: [
    defineField({
      name: 'metaTitle',
      title: 'Meta title',
      type: 'string',
      validation: (rule) => rule.max(65),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.max(170),
    }),
    defineField({
      name: 'keywords',
      title: 'Keywords',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {
        layout: 'tags',
      },
    }),
    defineField({
      name: 'shareTitle',
      title: 'Social title',
      type: 'string',
    }),
    defineField({
      name: 'shareDescription',
      title: 'Social description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'shareImage',
      title: 'Social image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'canonicalPath',
      title: 'Canonical path',
      type: 'string',
      description: 'Example: /resources/production-memory-field-guide',
    }),
    defineField({
      name: 'noIndex',
      title: 'Prevent search indexing',
      type: 'boolean',
      initialValue: false,
    }),
  ],
})

export const landingPageSettings = defineType({
  name: 'landingPageSettings',
  title: 'Landing-page settings',
  type: 'object',
  fields: [
    defineField({
      name: 'enabled',
      title: 'Enable landing page',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'eyebrow',
      title: 'Hero eyebrow',
      type: 'string',
    }),
    defineField({
      name: 'headline',
      title: 'Hero headline override',
      type: 'string',
      description: 'Falls back to the document title.',
    }),
    defineField({
      name: 'description',
      title: 'Hero description override',
      type: 'text',
      rows: 4,
      description: 'Falls back to the document abstract.',
    }),
    defineField({
      name: 'primaryCta',
      title: 'Primary CTA',
      type: 'cta',
      description:
        'When omitted, the page displays a generated PDF download CTA.',
    }),
    defineField({
      name: 'secondaryCta',
      title: 'Secondary CTA',
      type: 'cta',
    }),
    defineField({
      name: 'showPublicationMeta',
      title: 'Show publication metadata',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'showSectionNavigation',
      title: 'Show section navigation',
      type: 'boolean',
      initialValue: true,
    }),
  ],
})

export const pdfSettings = defineType({
  name: 'pdfSettings',
  title: 'PDF settings',
  type: 'object',
  fields: [
    defineField({
      name: 'enabled',
      title: 'Enable generated PDF',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'fileName',
      title: 'Download filename',
      type: 'string',
      description: 'Example: production-memory-field-guide.pdf',
    }),
    defineField({
      name: 'titleOverride',
      title: 'PDF title override',
      type: 'string',
    }),
    defineField({
      name: 'subtitleOverride',
      title: 'PDF subtitle override',
      type: 'string',
    }),
    defineField({
      name: 'pageSize',
      title: 'Page size',
      type: 'string',
      initialValue: 'LETTER',
      options: {
        list: [
          {title: 'US Letter', value: 'LETTER'},
          {title: 'A4', value: 'A4'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'coverStyle',
      title: 'Cover style',
      type: 'string',
      initialValue: 'standard',
      options: {
        list: [
          {title: 'Standard resource cover', value: 'standard'},
          {title: 'Full-page cover artwork', value: 'fullPageArtwork'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'coverBackgroundImageUrl',
      title: 'Full-page cover artwork URL',
      type: 'url',
      hidden: ({parent}) => parent?.coverStyle !== 'fullPageArtwork',
    }),
    defineField({
      name: 'includeDocumentCoverImage',
      title: 'Include document cover image on the abstract page',
      type: 'boolean',
      initialValue: true,
      hidden: ({parent}) => parent?.coverStyle === 'fullPageArtwork',
    }),
    defineField({
      name: 'includeCover',
      title: 'Include cover',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'includeTableOfContents',
      title: 'Include table of contents',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'showPageNumbers',
      title: 'Show page numbers',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'headerText',
      title: 'Running header',
      type: 'string',
    }),
    defineField({
      name: 'footerText',
      title: 'Running footer',
      type: 'string',
    }),
    defineField({
      name: 'accentColor',
      title: 'Accent color',
      type: 'string',
      initialValue: '#111111',
      validation: (rule) =>
        rule.custom((value) => {
          if (!value) return true
          return /^#[0-9a-fA-F]{6}$/.test(value)
            ? true
            : 'Use a six-digit hexadecimal color such as #111111.'
        }),
    }),
    defineField({
      name: 'legalNote',
      title: 'Legal or publication note',
      type: 'text',
      rows: 3,
    }),
  ],
})

export const finalCtaBlock = defineType({
  name: 'finalCtaBlock',
  title: 'Final CTA',
  type: 'object',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Eyebrow',
      type: 'string',
    }),
    defineField({
      name: 'headline',
      title: 'Headline',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'primaryCta',
      title: 'Primary CTA',
      type: 'cta',
    }),
    defineField({
      name: 'secondaryCta',
      title: 'Secondary CTA',
      type: 'cta',
    }),
  ],
})

export const resourceDocument = defineType({
  name: 'resourceDocument',
  title: 'Resource document',
  type: 'document',
  fields: [
    defineField({
      name: 'status',
      title: 'Editorial status',
      type: 'string',
      initialValue: 'draft',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Published', value: 'published'},
          {title: 'Archived', value: 'archived'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'resourceKind',
      title: 'Resource type',
      type: 'string',
      initialValue: 'fieldGuide',
      options: {
        list: [
          {title: 'Field guide', value: 'fieldGuide'},
          {title: 'Brief', value: 'brief'},
          {title: 'Report', value: 'report'},
          {title: 'White paper', value: 'whitePaper'},
          {title: 'Case study', value: 'caseStudy'},
          {title: 'Memo', value: 'memo'},
          {title: 'Playbook', value: 'playbook'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Canonical title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'shortTitle',
      title: 'Short title',
      type: 'string',
      description: 'Used in navigation, running headers, and compact cards.',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle',
      type: 'string',
    }),
    defineField({
      name: 'abstract',
      title: 'Abstract',
      type: 'text',
      rows: 5,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'audience',
      title: 'Audience',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {
        layout: 'tags',
      },
    }),
    defineField({
      name: 'coverImage',
      title: 'Cover image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'publisher',
      title: 'Publisher',
      type: 'string',
      initialValue: 'Portals',
    }),
    defineField({
      name: 'authors',
      title: 'Authors',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'role',
              title: 'Role',
              type: 'string',
            }),
          ],
          preview: {
            select: {
              title: 'name',
              subtitle: 'role',
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
    }),
    defineField({
      name: 'edition',
      title: 'Edition or version',
      type: 'string',
      description: 'Example: First edition or Version 1.2.',
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seoSettings',
      options: {
        collapsible: true,
        collapsed: true,
      },
    }),
    defineField({
      name: 'landingPage',
      title: 'Landing page',
      type: 'landingPageSettings',
      options: {
        collapsible: true,
        collapsed: false,
      },
    }),
    defineField({
      name: 'pdf',
      title: 'Generated PDF',
      type: 'pdfSettings',
      options: {
        collapsible: true,
        collapsed: true,
      },
    }),
    defineField({
      name: 'sections',
      title: 'Document sections',
      type: 'array',
      validation: (rule) => rule.min(1),
      of: [defineArrayMember({type: 'documentSection'})],
    }),
    defineField({
      name: 'packageSpecifications',
      title: 'Referenced package specifications',
      type: 'array',
      description:
        'Standalone package specification documents referenced by this resource. Do not duplicate package values in the resource.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'packageSpecification'}],
        }),
      ],
    }),
    defineField({
      name: 'finalCta',
      title: 'Final CTA',
      type: 'finalCtaBlock',
      options: {
        collapsible: true,
        collapsed: true,
      },
    }),
    defineField({
      name: 'relatedResources',
      title: 'Related resources',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'resourceDocument'}],
        }),
      ],
    }),
  ],
  orderings: [
    {
      title: 'Publication date',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'resourceKind',
      media: 'coverImage',
    },
  },
})

export const resourceTypes = [
  cta,
  calloutBlock,
  formulaBlock,
  checklistBlock,
  quoteBlock,
  metricGridBlock,
  packageSpecReferenceBlock,
  dataTableBlock,
  figureBlock,
  dividerBlock,
  resourceBody,
  documentSection,
  seoSettings,
  landingPageSettings,
  pdfSettings,
  finalCtaBlock,
  resourceDocument,
]
