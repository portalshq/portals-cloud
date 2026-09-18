import {defineArrayMember, defineField, defineType} from 'sanity'

export const blogFaqItem = defineType({
  name: 'blogFaqItem',
  title: 'Blog FAQ item',
  type: 'object',
  fields: [
    defineField({name: 'question', title: 'Question', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'answer', title: 'Answer', type: 'text', rows: 3, validation: (rule) => rule.required()}),
  ],
  preview: {select: {title: 'question'}},
})

export const blogPostDocument = defineType({
  name: 'blogPostDocument',
  title: 'Blog post',
  type: 'document',
  fields: [
    defineField({
      name: 'status',
      title: 'Editorial status',
      type: 'string',
      initialValue: 'draft',
      options: {list: [{title: 'Draft', value: 'draft'}, {title: 'Published', value: 'published'}, {title: 'Archived', value: 'archived'}], layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'definition',
      title: 'Direct definition (40–80 words)',
      type: 'text',
      rows: 3,
      description: 'BLUF answer paragraph rendered directly under the H1. Keep it citable for AI Overviews / ChatGPT / Perplexity.',
      validation: (rule) => rule.required().min(20).max(600),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      description: 'Card + meta-description fallback. 150–160 chars.',
      validation: (rule) => rule.required().max(300),
    }),
    defineField({name: 'publishedAt', title: 'Published at', type: 'datetime', validation: (rule) => rule.required()}),
    defineField({name: 'updatedAt', title: 'Updated at', type: 'datetime'}),
    defineField({
      name: 'authors',
      title: 'Authors',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({name: 'name', title: 'Name', type: 'string', validation: (rule) => rule.required()}),
            defineField({name: 'role', title: 'Role', type: 'string'}),
          ],
          preview: {select: {title: 'name', subtitle: 'role'}},
        }),
      ],
    }),
    defineField({name: 'coverImage', title: 'Cover image', type: 'image', options: {hotspot: true}}),
    defineField({
      name: 'cluster',
      title: 'Topic cluster',
      type: 'string',
      initialValue: 'production-memory',
      options: {
        list: [
          {title: 'Production memory', value: 'production-memory'},
          {title: 'Asset management & DAM', value: 'asset-management'},
          {title: 'Provenance & lineage', value: 'provenance-lineage'},
          {title: 'Workflow & operations', value: 'workflow-operations'},
          {title: 'Governance & brand', value: 'governance-brand'},
          {title: 'Economics & measurement', value: 'economics'},
        ],
        layout: 'radio',
      },
    }),
    defineField({name: 'priority', title: 'Publish priority (1 = first)', type: 'number', validation: (rule) => rule.integer().min(1).max(100)}),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
    }),
    defineField({name: 'seo', title: 'SEO', type: 'seoSettings', options: {collapsible: true, collapsed: true}}),
    defineField({name: 'keyTakeaways', title: 'Key takeaways', type: 'array', of: [defineArrayMember({type: 'string'})], validation: (rule) => rule.min(3).max(6)}),
    defineField({name: 'body', title: 'Body', type: 'resourceBody', validation: (rule) => rule.required()}),
    defineField({name: 'faqs', title: 'FAQs', type: 'array', of: [defineArrayMember({type: 'blogFaqItem'})], validation: (rule) => rule.min(3).max(8)}),
    defineField({
      name: 'relatedPosts',
      title: 'Related posts',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'blogPostDocument'}]})],
      validation: (rule) => rule.max(3),
    }),
  ],
  orderings: [
    {title: 'Publish priority', name: 'priorityAsc', by: [{field: 'priority', direction: 'asc'}]},
    {title: 'Publication date', name: 'publishedAtDesc', by: [{field: 'publishedAt', direction: 'desc'}]},
  ],
  preview: {select: {title: 'title', subtitle: 'slug.current', status: 'status'}, prepare: ({title, subtitle, status}) => ({title, subtitle: `${status}: ${subtitle}`})},
})

export const blogDocumentTypes = [blogFaqItem, blogPostDocument]
