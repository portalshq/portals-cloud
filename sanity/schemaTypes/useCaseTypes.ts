import {defineField, defineType} from 'sanity'

export const useCaseDocument = defineType({
  name: 'useCaseDocument',
  title: 'Use case document',
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
    defineField({name: 'outcome', title: 'Outcome', type: 'text', rows: 3, validation: (rule) => rule.required()}),
    defineField({name: 'event', title: 'Triggering event', type: 'text', rows: 3, validation: (rule) => rule.required()}),
    defineField({name: 'buyers', title: 'Who owns the pain', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'remedy', title: 'Remedy', type: 'text', rows: 3, validation: (rule) => rule.required()}),
    defineField({name: 'booster', title: 'Booster', type: 'text', rows: 3, validation: (rule) => rule.required()}),
    defineField({name: 'measure', title: 'Pilot measure', type: 'text', rows: 3, validation: (rule) => rule.required()}),
    defineField({name: 'sortOrder', title: 'Sort order', type: 'number', validation: (rule) => rule.required().integer().min(0)}),
  ],
  preview: {select: {title: 'title', subtitle: 'slug.current', status: 'status'}, prepare: ({title, subtitle, status}) => ({title, subtitle: `${status}: ${subtitle}`})},
})

export const useCaseDocumentTypes = [useCaseDocument]
