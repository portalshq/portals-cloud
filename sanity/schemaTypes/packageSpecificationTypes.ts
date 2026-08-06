import {defineArrayMember, defineField, defineType} from 'sanity'

const specValueFields = [
  defineField({
    name: 'label',
    title: 'Label',
    type: 'string',
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'displayValue',
    title: 'Display value',
    type: 'string',
    description: 'Canonical public value for this specification.',
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'numericValue',
    title: 'Numeric value',
    type: 'number',
    description: 'Optional machine-readable value when the spec is numeric.',
  }),
  defineField({
    name: 'unit',
    title: 'Unit',
    type: 'string',
    description: 'Example: days, hours, participants, repositories.',
  }),
  defineField({
    name: 'qualifier',
    title: 'Qualifier',
    type: 'string',
    description: 'Example: up to, billed annually, once.',
  }),
  defineField({
    name: 'note',
    title: 'Note',
    type: 'string',
  }),
]

export const specificationValue = defineType({
  name: 'specificationValue',
  title: 'Specification value',
  type: 'object',
  fields: specValueFields,
  preview: {
    select: {
      title: 'displayValue',
      subtitle: 'label',
    },
  },
})

export const packagePrice = defineType({
  name: 'packagePrice',
  title: 'Package price',
  type: 'object',
  fields: [
    defineField({
      name: 'displayValue',
      title: 'Display value',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      description: 'Optional numeric amount for systems such as CRM deal value.',
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      initialValue: 'USD',
    }),
    defineField({
      name: 'periodLabel',
      title: 'Period label',
      type: 'string',
      description: 'Example: once, /month, billed annually, annual agreement.',
    }),
    defineField({
      name: 'billingNote',
      title: 'Billing note',
      type: 'string',
    }),
  ],
})

export const packageLimits = defineType({
  name: 'packageLimits',
  title: 'Package limits',
  type: 'object',
  fields: [
    defineField({name: 'productionTeams', title: 'Production teams', type: 'specificationValue'}),
    defineField({name: 'activeWorkflows', title: 'Active workflows', type: 'specificationValue'}),
    defineField({name: 'historicalProjects', title: 'Historical projects', type: 'specificationValue'}),
    defineField({name: 'participants', title: 'Participants', type: 'specificationValue'}),
    defineField({name: 'productionMembers', title: 'Production members', type: 'specificationValue'}),
    defineField({name: 'activeRepositories', title: 'Active repositories', type: 'specificationValue'}),
    defineField({name: 'workspaces', title: 'Workspaces', type: 'specificationValue'}),
    defineField({name: 'reviewersGuests', title: 'Reviewers and guests', type: 'specificationValue'}),
  ],
})

export const packageSpecification = defineType({
  name: 'packageSpecification',
  title: 'Package specification',
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
      name: 'packageKind',
      title: 'Package kind',
      type: 'string',
      options: {
        list: [
          {title: 'Paid pilot', value: 'paidPilot'},
          {title: 'Subscription package', value: 'subscription'},
          {title: 'Enterprise package', value: 'enterprise'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'shortName',
      title: 'Short name',
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 80,
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sortOrder',
      title: 'Sort order',
      type: 'number',
      initialValue: 100,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'packagePrice',
    }),
    defineField({
      name: 'limits',
      title: 'Limits and included quantities',
      type: 'packageLimits',
      options: {
        collapsible: true,
        collapsed: false,
      },
    }),
    defineField({
      name: 'features',
      title: 'Canonical feature list',
      type: 'array',
      validation: (rule) => rule.min(1),
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'milestones',
      title: 'Milestones',
      type: 'array',
      of: [defineArrayMember({type: 'specificationValue'})],
    }),
    defineField({
      name: 'serviceItems',
      title: 'Service, support, and commercial commitments',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'includedItems',
      title: 'Included in the package (standard scope boundary)',
      description: 'Exactly what the price covers. Rendered in the pilot agreement.',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'excludedItems',
      title: 'Not included without an amendment',
      description: 'What the price does not cover. Rendered in the pilot agreement.',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'standardIntegrationPaths',
      title: 'Standard integration paths',
      description: 'Import/integration paths included at no extra cost.',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'ctaLabel',
      title: 'CTA label',
      type: 'string',
      initialValue: 'Scope a pilot',
    }),
    defineField({
      name: 'microcopy',
      title: 'Microcopy',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'legalNote',
      title: 'Legal or qualification note',
      type: 'text',
      rows: 3,
    }),
  ],
  orderings: [
    {
      title: 'Sort order',
      name: 'sortOrderAsc',
      by: [{field: 'sortOrder', direction: 'asc'}],
    },
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'packageKind',
    },
  },
})

export const packageSpecificationTypes = [
  specificationValue,
  packagePrice,
  packageLimits,
  packageSpecification,
]
