import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'}).withConfig({useCdn: false})
const apply = process.argv.includes('--apply')

const updates = [
  {
    id: '8PZUX3ShTf5214Jw1trnB4',
    slug: 'studio-pilot',
    fields: {
      name: 'Studio Pilot',
      shortName: 'Studio Pilot',
      slug: {_type: 'slug', current: 'studio-pilot'},
      ctaLabel: 'Start a pilot',
      ctaDestination: '/pilot',
      limits: {
        _type: 'packageLimits',
        productionTeams: {_type: 'specificationValue', label: 'production team', displayValue: '1', numericValue: 1, unit: 'production team'},
        activeWorkflows: {_type: 'specificationValue', label: 'active workflow', displayValue: '1', numericValue: 1, unit: 'active workflow'},
        historicalProjects: {_type: 'specificationValue', label: 'historical project', displayValue: '1', numericValue: 1, unit: 'historical project'},
        participants: {_type: 'specificationValue', label: 'participants', displayValue: 'up to 5', numericValue: 5, unit: 'participants', qualifier: 'up to'},
      },
      features: [
        'One production team',
        'One active workflow',
        'One historical project',
        'Up to five participating users',
        'Standard onboarding',
        'Pilot success plan',
        'Final results review',
      ],
    },
  },
  {
    id: '22uPhQi95aN0jC0OXsMZKT',
    slug: 'studio',
    fields: {
      name: 'Studio',
      limits: {
        _type: 'packageLimits',
        productionMembers: {_type: 'specificationValue', label: 'production members', displayValue: 'up to 24', numericValue: 24, unit: 'production members', qualifier: 'up to'},
        activeRepositories: {_type: 'specificationValue', label: 'active production repositories', displayValue: '15', numericValue: 15, unit: 'active production repositories'},
        reviewersGuests: {_type: 'specificationValue', label: 'reviewers and guests', displayValue: 'unlimited'},
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
      serviceItems: ['Quarterly workflow review'],
      ctaLabel: 'Start a pilot',
      ctaDestination: '/pilot?tier=studio',
    },
  },
  {
    id: 'AbE0eRTxRWYSaELT1SuSWw',
    slug: 'production-team',
    fields: {
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
  },
  {
    id: 'AbE0eRTxRWYSaELT1SuSig',
    slug: 'enterprise',
    fields: {
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
      ctaLabel: 'Talk through a pilot',
      ctaDestination: '/pilot?mode=assisted&tier=enterprise',
    },
  },
]

for (const update of updates) {
  const current = await client.fetch('*[_type == "packageSpecification" && _id == $id][0]{_id, _rev, "slug": slug.current}', {id: update.id})
  if (!current || current.slug !== update.slug) throw new Error(`Refusing unexpected package document: ${update.id}`)
  if (!apply) {
    console.log(`DRY RUN ${update.slug}: ${Object.keys(update.fields).join(', ')}`)
    continue
  }
  const result = await client.patch(current._id).ifRevisionId(current._rev).set(update.fields).commit()
  console.log(`UPDATED ${result._id} ${update.slug}`)
}

if (!apply) console.log('No changes written. Pass --apply to publish these package-field updates to the configured dataset.')
