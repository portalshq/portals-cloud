import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

const specs = [
  {
    status: 'published',
    packageKind: 'paidPilot',
    name: 'Production Pilot',
    shortName: 'Paid Pilot',
    slug: {_type: 'slug', current: 'paid-pilot'},
    sortOrder: 10,
    subtitle:
      'For qualified teams proving Portals against one active production workflow.',
    price: {
      _type: 'packagePrice',
      displayValue: '$5,000',
      amount: 5000,
      currency: 'USD',
      periodLabel: 'once',
      billingNote: 'upfront pilot fee',
    },
    limits: {
      _type: 'packageLimits',
      productionTeams: {
        _type: 'specificationValue',
        label: 'production team',
        displayValue: '1',
        numericValue: 1,
        unit: 'production team',
      },
      activeWorkflows: {
        _type: 'specificationValue',
        label: 'active workflow',
        displayValue: '1',
        numericValue: 1,
        unit: 'active workflow',
      },
      historicalProjects: {
        _type: 'specificationValue',
        label: 'historical project',
        displayValue: '1',
        numericValue: 1,
        unit: 'historical project',
      },
      participants: {
        _type: 'specificationValue',
        label: 'participants',
        displayValue: 'up to 5',
        numericValue: 5,
        unit: 'active team participants',
        qualifier: 'up to',
      },
    },
    features: [
      '1 production team',
      '1 active workflow',
      '1 historical project',
      'Up to 5 participating users',
      'Defined onboarding',
      'Agreed success criteria',
      'First production record established within 48 hours',
      'Final deployment recommendation',
      'Annual deployment terms established before the pilot begins',
    ],
    milestones: [
      {
        _type: 'specificationValue',
        label: 'pilot period',
        displayValue: '21 days',
        numericValue: 21,
        unit: 'days',
      },
      {
        _type: 'specificationValue',
        label: 'first value',
        displayValue: '48 hours',
        numericValue: 48,
        unit: 'hours',
      },
      {
        _type: 'specificationValue',
        label: 'annual-credit decision window',
        displayValue: '14 days',
        numericValue: 14,
        unit: 'days',
      },
    ],
    serviceItems: [
      'Defined onboarding',
      'Agreed integration setup where applicable',
      'Workflow review, onboarding, support, and final evaluation',
      'Annual deployment terms established before kickoff',
    ],
    ctaLabel: 'Scope a pilot',
    microcopy:
      'Credited toward annual deployment when the annual agreement is signed within 14 days of the final pilot review. Enterprise pilots are scoped separately.',
    legalNote:
      'Pilot scope, integrations, annual deployment price, credit terms, success criteria, and final decision date must be agreed in writing before kickoff.',
  },
  {
    status: 'published',
    packageKind: 'subscription',
    name: 'Production Team',
    slug: {_type: 'slug', current: 'production-team'},
    sortOrder: 20,
    subtitle:
      'For small production teams establishing a trusted system of record for AI production.',
    price: {
      _type: 'packagePrice',
      displayValue: '$750',
      amount: 750,
      currency: 'USD',
      periodLabel: '/month, billed annually',
      billingNote: 'billed annually',
    },
    limits: {
      _type: 'packageLimits',
      productionMembers: {
        _type: 'specificationValue',
        label: 'production members',
        displayValue: '5',
        numericValue: 5,
        unit: 'production members',
      },
      activeRepositories: {
        _type: 'specificationValue',
        label: 'active production repositories',
        displayValue: '3',
        numericValue: 3,
        unit: 'active production repositories',
      },
      reviewersGuests: {
        _type: 'specificationValue',
        label: 'reviewers and guests',
        displayValue: 'unlimited',
      },
    },
    features: [
      '5 production members',
      '3 active production repositories',
      'Unlimited reviewers and guests',
      'Complete version history and rollback',
      'Provenance tracking',
      'Standard sharing',
      'Standard integrations',
      'Standard support',
      'Guided initial setup',
    ],
    serviceItems: ['Standard integrations', 'Standard support', 'Guided initial setup'],
    ctaLabel: 'Scope a pilot',
  },
  {
    status: 'published',
    packageKind: 'subscription',
    name: 'Studio',
    slug: {_type: 'slug', current: 'studio'},
    sortOrder: 30,
    subtitle:
      'For organizations running recurring client, campaign, episodic, animation, or game-production workflows.',
    price: {
      _type: 'packagePrice',
      displayValue: '$2,500',
      amount: 2500,
      currency: 'USD',
      periodLabel: '/month, billed annually',
      billingNote: 'billed annually',
    },
    limits: {
      _type: 'packageLimits',
      productionMembers: {
        _type: 'specificationValue',
        label: 'production members',
        displayValue: '20',
        numericValue: 20,
        unit: 'production members',
      },
      activeRepositories: {
        _type: 'specificationValue',
        label: 'active production repositories',
        displayValue: '15',
        numericValue: 15,
        unit: 'active production repositories',
      },
      reviewersGuests: {
        _type: 'specificationValue',
        label: 'reviewers and guests',
        displayValue: 'unlimited',
      },
      workspaces: {
        _type: 'specificationValue',
        label: 'production workspaces',
        displayValue: 'multiple',
      },
    },
    features: [
      '20 production members',
      '15 active production repositories',
      'Unlimited reviewers and guests',
      'Everything in Production Team',
      'API access',
      'Audit history',
      'Role-based permissions',
      'Multiple production workspaces',
      'Standard production integrations',
      'Guided onboarding',
      'Quarterly workflow review',
    ],
    serviceItems: [
      'API access',
      'Audit history',
      'Guided onboarding',
      'Quarterly workflow review',
    ],
    ctaLabel: 'Scope a pilot',
  },
  {
    status: 'published',
    packageKind: 'enterprise',
    name: 'Enterprise',
    slug: {_type: 'slug', current: 'enterprise'},
    sortOrder: 40,
    subtitle:
      'For multi-team organizations standardizing AI production across business units, clients, productions, or regions.',
    price: {
      _type: 'packagePrice',
      displayValue: 'Custom',
      currency: 'USD',
      periodLabel: 'annual agreement',
    },
    limits: {
      _type: 'packageLimits',
      productionMembers: {
        _type: 'specificationValue',
        label: 'production-member capacity',
        displayValue: 'contracted',
      },
      activeRepositories: {
        _type: 'specificationValue',
        label: 'repositories',
        displayValue: 'contracted',
      },
      workspaces: {
        _type: 'specificationValue',
        label: 'workspaces',
        displayValue: 'contracted',
      },
    },
    features: [
      'Contracted production-member capacity',
      'Contracted repositories and workspaces',
      'Everything in Studio',
      'Procurement and security support',
      'Contractual service commitments',
      'Named customer-success owner',
      'Custom onboarding and implementation planning',
    ],
    serviceItems: [
      'Procurement and security support',
      'Contractual service commitments',
      'Named customer-success owner',
      'Custom onboarding and implementation planning',
    ],
    ctaLabel: 'Scope a pilot',
    legalNote:
      'Enterprise availability, support, security, retention, export, data-region, and infrastructure commitments apply only when included in a signed agreement.',
  },
]

async function upsertBySlug(document) {
  const existing = await client.fetch(
    '*[_type == "packageSpecification" && slug.current == $slug][0]{_id}',
    {slug: document.slug.current},
  )

  if (existing?._id) {
    const result = await client.patch(existing._id).set(document).commit()
    console.log(`updated ${result._id}`)
    return result
  }

  const result = await client.create({
    _type: 'packageSpecification',
    ...document,
  })
  console.log(`created ${result._id}`)
  return result
}

for (const spec of specs) {
  await upsertBySlug(spec)
}
