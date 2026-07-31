import {defineArrayMember, defineField, defineType} from 'sanity'

export const legalDocumentSection = defineType({
  name: 'legalDocumentSection',
  title: 'Legal document section',
  type: 'object',
  fields: [
    defineField({
      name: 'anchor',
      title: 'Anchor',
      type: 'slug',
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
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'resourceBody',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
    },
  },
})

export const legalDocument = defineType({
  name: 'legalDocument',
  title: 'Legal document',
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
      name: 'documentType',
      title: 'Document type',
      type: 'string',
      options: {
        list: [
          {title: 'Privacy policy', value: 'privacyPolicy'},
          {title: 'Terms of service', value: 'termsOfService'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required(),
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
      name: 'summary',
      title: 'Summary',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'effectiveDate',
      title: 'Effective date',
      type: 'date',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact email',
      type: 'string',
      validation: (rule) => rule.required().email(),
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      validation: (rule) => rule.min(1),
      of: [defineArrayMember({type: 'legalDocumentSection'})],
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
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'documentType',
    },
  },
})

export const legalDocumentTypes = [legalDocumentSection, legalDocument]
