import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

const specs = [
  {
    status: 'published',
    packageKind: 'paidPilot',
    name: 'Studio Pilot',
    shortName: 'Studio Pilot',
    slug: {_type: 'slug', current: 'studio-pilot'},
    sortOrder: 10,
    subtitle:
      'For studios managing concurrent campaigns, episodic, animation, or game pipelines.',
    price: {
      _type: 'packagePrice',
      displayValue: '$5,000',
      amount: 5000,
      currency: 'USD',
      periodLabel: 'one-time',
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
        unit: 'participants',
        qualifier: 'up to',
      },
    },
    features: [
      'Up to 5 participants',
      'One production team',
      'One active workflow',
      'One historical project',
      'Standard onboarding',
      'Pilot success plan',
      'Final results review',
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
    ctaLabel: 'Start a pilot',
    ctaDestination: '/pilot',
    microcopy: 'Any promotional pricing or conversion credit follows the selected offer and accepted terms.',
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
      'For small production teams establishing a trusted system of record for emerging AI workflows.',
    price: {
      _type: 'packagePrice',
      displayValue: '$750',
      amount: 750,
      currency: 'USD',
      periodLabel: '/month',
      billingNote: 'Billed annually ($9,000 / year)',
      annualAmount: 9000,
      onboardingFee: 1000,
      addOnSeatPrice: 150,
      addOnSeatPeriodLabel: '/month, billed annually',
      installmentsAvailable: true,
      installmentSchedule: {
        count: 4,
        interval: 'quarter',
        firstPaymentIncludesOnboarding: true,
        surcharge: 0,
      },
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
        displayValue: '5 reviewers and 5 guests',
      },
      addOnSeatsMax: {
        _type: 'specificationValue',
        label: 'add-on seats maximum',
        displayValue: '2',
        numericValue: 2,
        unit: 'add-on seats',
      },
    },
    features: [
      '5 production members included',
      'Add up to 2 more members at $150/month each, billed annually',
      '$1,000 one-time onboarding fee at account creation',
      '3 active production repositories',
      '5 reviewers and 5 guests',
      'Complete version history and rollback',
      'Provenance tracking',
      'Standard sharing',
      'Standard production integrations',
      'Standard support',
      'Guided onboarding',
    ],
    serviceItems: ['Standard production integrations', 'Standard support', 'Guided onboarding'],
    ctaLabel: 'Get started',
    ctaDestination: '/auth/sign-in?next=%2Fcheckout%2Fproduction-team',
    microcopy: 'Installment payments available upon request',
  },
  {
    status: 'published',
    packageKind: 'subscription',
    name: 'Studio',
    slug: {_type: 'slug', current: 'studio'},
    sortOrder: 30,
    banner: 'Best value',
    subtitle:
      'For studios managing concurrent campaigns, episodic, animation, or game pipelines.',
    price: {
      _type: 'packagePrice',
      displayValue: '$2,400',
      amount: 2400,
      currency: 'USD',
      periodLabel: '/month',
      billingNote: 'Billed annually ($28,800 / year)',
      annualAmount: 28800,
    },
    limits: {
      _type: 'packageLimits',
      productionMembers: {
        _type: 'specificationValue',
        label: 'production members',
        displayValue: 'up to 24',
        numericValue: 24,
        unit: 'production members',
        qualifier: 'up to',
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
    },
    features: [
      'Up to 24 production members',
      'Paid Studio Pilot required',
      '100% of the pilot fee credited toward your annual agreement when you sign before the pilot ends',
      '15 active production repositories',
      'Unlimited reviewers and guests',
      'Complete version history and rollback',
      'Provenance tracking',
      'Standard sharing',
      'Standard support',
      'Role-based permissions',
      'Quarterly workflow review',
    ],
    serviceItems: [
      'Quarterly workflow review',
    ],
    ctaLabel: 'Start a pilot',
    ctaDestination: '/pilot?tier=studio',
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
      internalGuidance: '$150/seat/month, 25-seat minimum ($45,000/year ACV)',
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
      '25+ production members, contracted capacity',
      'Contracted repositories and workspaces',
      'Everything in Studio',
      'API access',
      'Audit history',
      'Multiple production workspaces',
      'Single sign-on (SSO)',
      'Advanced role permissions',
      'Dedicated support',
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
  let existing = await client.fetch(
    '*[_type == "packageSpecification" && slug.current == $slug][0]{_id}',
    {slug: document.slug.current},
  )

  if (!existing?._id && document.packageKind === 'paidPilot') {
    existing = await client.fetch(
      '*[_type == "packageSpecification" && packageKind == "paidPilot"][0]{_id}',
    )
  }

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
