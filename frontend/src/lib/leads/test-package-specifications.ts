import type {PackageSpecification} from '../../types/resource'

export const TEST_PACKAGE_SPECIFICATIONS: PackageSpecification[] = [
  {
    _id: 'test-studio-pilot',
    status: 'published',
    packageKind: 'paidPilot',
    name: 'Studio Pilot',
    slug: 'studio-pilot',
    sortOrder: 10,
    price: {amount: 5000, displayValue: '$5,000', currency: 'USD', periodLabel: 'one-time'},
    limits: {participants: {label: 'participants', displayValue: 'up to 5', numericValue: 5}},
    milestones: [
      {label: 'pilot period', displayValue: '21 days', numericValue: 21},
      {label: 'annual-credit decision window', displayValue: '14 days', numericValue: 14},
    ],
  },
  {
    _id: 'test-studio',
    status: 'published',
    packageKind: 'subscription',
    name: 'Studio',
    slug: 'studio',
    sortOrder: 30,
    price: {amount: 2400, annualAmount: 28800, displayValue: '$2,400', currency: 'USD', periodLabel: '/month', billingNote: 'Billed annually ($28,800 / year)'},
  },
]
