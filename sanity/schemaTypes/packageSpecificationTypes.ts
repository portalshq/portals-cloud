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
    defineField({
      name: 'discount',
      title: 'Discount',
      type: 'object',
      fields: [
        defineField({
          name: 'percentage',
          title: 'Discount percentage',
          type: 'number',
          description: 'Discount percentage (e.g., 25 for 25% off)',
        }),
        defineField({
          name: 'discountAmount',
          title: 'Discount amount',
          type: 'number',
          description: 'Fixed discount amount (alternative to percentage)',
        }),
        defineField({
          name: 'discountDisplayValue',
          title: 'Discount display value',
          type: 'string',
          description: 'How to display the discounted price (e.g., "$7,500")',
        }),
        defineField({
          name: 'limitedSlots',
          title: 'Limited slots available',
          type: 'number',
          description: 'Number of available slots for this discount (e.g., 2)',
        }),
        defineField({
          name: 'urgencyMessage',
          title: 'Urgency message',
          type: 'string',
          description: 'Message to create urgency (e.g., "Only 2 slots remaining")',
        }),
      ],
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

export const pilotOfferVariant = defineType({
  name: 'pilotOfferVariant',
  title: 'Pilot offer variant',
  type: 'document',
  fields: [
    defineField({name: 'slug', title: 'Offer slug', type: 'slug', options: {source: 'internalLabel'}, validation: (rule) => rule.required()}),
    defineField({name: 'internalLabel', title: 'Internal label', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'basePackage', title: 'Base package', type: 'reference', to: [{type: 'packageSpecification'}], validation: (rule) => rule.required()}),
    defineField({name: 'status', title: 'Status', type: 'string', options: {list: [{title: 'Active', value: 'active'}, {title: 'Inactive', value: 'inactive'}]}, validation: (rule) => rule.required()}),
    defineField({name: 'startsAt', title: 'Starts at', type: 'datetime', validation: (rule) => rule.required()}),
    defineField({name: 'endsAt', title: 'Ends at', type: 'datetime', validation: (rule) => rule.required()}),
    defineField({name: 'acceptanceDeadlineLabel', title: 'Acceptance deadline label', type: 'string'}),
    defineField({name: 'pilotPriceAmount', title: 'Pilot price amount', type: 'number', validation: (rule) => rule.required().positive()}),
    defineField({name: 'pilotPriceLabel', title: 'Pilot price label', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'annualCreditAmount', title: 'Annual credit amount', type: 'number', validation: (rule) => rule.required().positive()}),
    defineField({name: 'annualCreditLabel', title: 'Annual credit label', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'pilotDurationDays', title: 'Pilot duration days', type: 'number', initialValue: 21, validation: (rule) => rule.required().positive()}),
    defineField({name: 'annualCreditRedemptionPolicy', title: 'Annual credit redemption policy', type: 'string', initialValue: 'standard-pilot-conversion-window', validation: (rule) => rule.required()}),
    defineField({name: 'allowedEmailDomains', title: 'Allowed email domains', type: 'array', of: [defineArrayMember({type: 'string'})]}),
    defineField({name: 'offerCopy', title: 'Offer copy', type: 'text', rows: 3}),
    defineField({name: 'termsVersion', title: 'Terms version', type: 'string', validation: (rule) => rule.required()}),
  ],
  preview: {select: {title: 'internalLabel', subtitle: 'status'}},
})

export const packageSpecificationTypesWithOffers = [...packageSpecificationTypes, pilotOfferVariant]
