# Pricing Restructure Audit Report
**Date**: 2026-10-19
**Status**: Pricing implementation in progress; latest feature allocation awaits Sanity write permission
**Purpose**: Record pricing architecture, implementation decisions, and deferred entitlement enforcement

## Implementation decisions (2026-10-19)

- Sanity's configured `production` dataset is the package-specification source of truth. The Studio Pilot, Studio, Production Team, and Enterprise package documents were updated with revision checks; Q3/Q4 offer documents were not changed.
- Production Team checkout is authenticated and offers annual payment or the CMS-configured quarterly installment schedule. Quarterly installments are four payments within one annual term; Stripe schedules cancel at the end of the term rather than renew quarterly.
- The one-time onboarding fee and Studio annual price are resolved from Sanity. Stripe catalog synchronization reads those same published specs and is test-mode-only by default; old immutable prices are archived, not deleted.
- Production Team add-on seat purchases are available through a separate annual subscription checkout. The first annual amount is charged at purchase, and each add-on term runs from its own subscription start.
- Membership caps are descriptive/package qualification data only for this release. Do not enforce Studio or add-on limits in invitations, account membership, or billing. Entitlement enforcement requires a separate migration and explicit product decision.
- Studio and Enterprise use the existing paid-pilot room. Enterprise pricing routes to the assisted pilot experience; exception review remains a distinct commercial classification.
- Pricing page values and package CTA destinations are read from Sanity. Enterprise's pilot selection is prefilled as assisted, and public pricing CTAs route to the correct checkout or pilot entry without a scope hash.
- Q3 offer data remains evidence. Do not modify the Q4 offer as part of this change.
- Feature allocation in the checked-in Sanity seed/update scripts places standard production integrations and guided onboarding in Production Team, removes guided onboarding/integrations from Studio's explicit feature list, and places API access, audit history, and multiple production workspaces in Enterprise. The current Sanity credential can read production but was denied `update` permission, so this final feature-list revision is not confirmed in the live dataset.

---

## Executive Summary

This audit identifies all pricing-related components, CMS schema, Stripe configuration, forms, and copy across the codebase. The pricing system is well-structured with CMS-driven values, but several hard-coded values exist that conflict with the new pricing specification.

**Key Findings**:
- Package and offer module exists in Sanity with comprehensive schema
- Pricing section rendered from CMS via `vcs-current/a.tsx`
- Stripe configuration has hard-coded values in `config/stripe-products.ts`
- Header CTA is static, not CMS-driven
- Several hard-coded pricing values scattered across codebase
- Q4 discount mechanism exists via `pilotOfferVariant` documents
- No quarterly installment schedule exists in CMS or Stripe
- No add-on seat mechanism exists

---

## 1. Package and Offer Specification Module

### Location
- **Schema**: `/Users/vibrantceo/Projects/portals/cloud/sanity/schemaTypes/packageSpecificationTypes.ts`
- **Seeding Script**: `/Users/vibrantceo/Projects/portals/cloud/sanity/scripts/publish-package-specifications.mjs`
- **Frontend Helpers**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/package-specifications.ts`
- **Offer Resolution**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/pilot-offers.ts`

### CMS Schema Structure

#### `packageSpecification` Document Type
Fields:
- `status`: 'draft' | 'published' | 'archived'
- `packageKind`: 'paidPilot' | 'subscription' | 'enterprise'
- `name`: string
- `shortName`: string
- `slug`: slug (source: name)
- `sortOrder`: number
- `subtitle`: text
- `banner`: string (pricing banner)
- `price`: packagePrice object
- `limits`: packageLimits object
- `features`: array of strings
- `milestones`: array of specificationValue
- `serviceItems`: array of strings
- `includedItems`: array of strings
- `excludedItems`: array of strings
- `standardIntegrationPaths`: array of strings
- `ctaLabel`: string (initialValue: 'Scope a pilot')
- `microcopy`: text
- `legalNote`: text

#### `packagePrice` Object
Fields:
- `displayValue`: string (e.g., "$5,000")
- `amount`: number (CRM deal value)
- `currency`: string (initialValue: 'USD')
- `periodLabel`: string (e.g., "/month, billed annually")
- `billingNote`: string
- `discount`: object
  - `percentage`: number
  - `discountAmount`: number
  - `discountDisplayValue`: string
  - `limitedSlots`: number
  - `urgencyMessage`: string

#### `packageLimits` Object
Fields:
- `productionTeams`: specificationValue
- `activeWorkflows`: specificationValue
- `historicalProjects`: specificationValue
- `participants`: specificationValue
- `productionMembers`: specificationValue
- `activeRepositories`: specificationValue
- `workspaces`: specificationValue
- `reviewersGuests`: specificationValue

#### `specificationValue` Object
Fields:
- `label`: string
- `displayValue`: string
- `numericValue`: number
- `unit`: string
- `qualifier`: string
- `note`: string

#### `pilotOfferVariant` Document Type (Q4 Discount)
Fields:
- `slug`: slug
- `internalLabel`: string
- `basePackage`: reference to packageSpecification
- `status`: 'active' | 'inactive'
- `startsAt`: datetime
- `endsAt`: datetime
- `acceptanceDeadlineLabel`: string
- `pilotPriceAmount`: number
- `pilotPriceLabel`: string
- `annualCreditAmount`: number
- `annualCreditLabel`: string
- `pilotDurationDays`: number
- `annualCreditRedemptionPolicy`: string
- `allowedEmailDomains`: array of strings
- `offerCopy`: text
- `termsVersion`: string

### Pre-change CMS Values (historical audit snapshot)

**Paid Pilot (paid-pilot)**:
- Price: $5,000 one-time
- Period: "one-time"
- Billing note: "upfront pilot fee"
- Members: up to 5 participants
- Features: 1 production team, 1 active workflow, 1 historical project, up to 5 users, defined onboarding, agreed success criteria, first value in 48 hours, final deployment recommendation
- Milestones: 21 days pilot period, 48 hours first value, 14 days annual-credit decision window
- CTA: "Scope a pilot"
- Microcopy: "Annual deployment credit available. Exact pilot pricing, deployment credit, and expiration terms are established before the pilot begins."

**Production Team (production-team)**:
- Price: $750/month, billed annually
- Members: 5 production members
- Repositories: 3 active production repositories
- Reviewers/Guests: unlimited
- Features: 5 production members, 3 active production repositories, unlimited reviewers and guests, complete version history and rollback, provenance tracking, standard sharing, standard integrations, standard support, guided initial setup
- CTA: "Scope a pilot"
- **CONFLICT**: Should be "Get started" routing to login/checkout

**Studio (studio)**:
- Price: $2,500/month, billed annually
- Banner: "Best value"
- Members: 20 production members
- Repositories: 15 active production repositories
- Workspaces: multiple
- Features: 20 production members, 15 active production repositories, unlimited reviewers and guests, everything in Production Team, API access, audit history, role-based permissions, multiple production workspaces, standard production integrations, guided onboarding, quarterly workflow review
- CTA: "Scope a pilot"
- **CONFLICT**: Should be $2,400/month, 24 members, no add-on seats

**Enterprise (enterprise)**:
- Price: Custom, annual agreement
- Members: contracted
- Repositories: contracted
- Workspaces: contracted
- Features: Contracted production-member capacity, contracted repositories and workspaces, everything in Studio, procurement and security support, contractual service commitments, named customer-success owner, custom onboarding and implementation planning
- CTA: "Scope a pilot"
- **CONFLICT**: Should route to pilot form with tier field

### How Components Read the Module

**Frontend helpers** (`package-specifications.ts`):
- `getPackageSpecifications()`: Fetches all published specs from Sanity
- `getPublishedPackageSpecification(slug)`: Fetches single spec by slug
- `packagePriceLabel()`: Returns price.displayValue or default "$5,000"
- `packageDiscountPercentage()`: Returns price.discount.percentage
- `packageLimitLabel()`: Returns limits.displayValue or defaults
- `packageMilestoneLabel()`: Returns milestone.displayValue or defaults
- `packagePricingFeatures()`: Returns features array

**Offer resolution** (`pilot-offers.ts`):
- `resolveCurrentPilotOffer()`: Resolves active pilot offer by date window
- Validates: status=active, startsAt <= now, endsAt > now
- Normalizes currency labels (removes duplicate $)
- Validates email domain restrictions if configured
- Returns PilotOffer with pilotPriceAmount, pilotPriceLabel, annualCreditAmount, annualCreditLabel, pilotDurationDays

### Q4 Discount Modeling

**Current Q4 offer** (from `publish-pilot-offer-variant.mjs`):
- Internal label: "Q3 Fast-Start Offer"
- Slug: "q3-fast-start"
- Base package reference: `8PZUX3ShTf5214Jw1trnB4`
- Status: active
- Window: 2026-09-01 to 2026-10-01
- Pilot price: $3,750 (25% discount from $5,000)
- Annual credit: $5,000 (100% of base price)
- Duration: 21 days
- Redemption policy: "standard-pilot-conversion-window"
- Terms version: "q3-fast-start@1"

**Note**: This is the Q3 offer. The Q4 offer (20% discount, expires December 31) should exist as a separate `pilotOfferVariant` document but was not found in the audit scripts. This needs verification in the actual CMS.

---

## 2. Field Reuse Map

| Value from Section 1 | Existing Field | Current Value | New Field Needed |
|---------------------|----------------|---------------|------------------|
| **Production Team** |
| Monthly price ($750) | price.displayValue | "$750" | No |
| Annual total ($9,000) | **NONE** | N/A | **YES** - `price.annualAmount` |
| Onboarding fee ($1,000) | **NONE** | N/A | **YES** - `price.onboardingFee` |
| Member cap (5) | limits.productionMembers.displayValue | "5" | No |
| Add-on seat price ($150/mo) | **NONE** | N/A | **YES** - `price.addOnSeatPrice` |
| Add-on seat max (2) | **NONE** | N/A | **YES** - `limits.addOnSeatsMax` |
| Installment schedule | **NONE** | N/A | **YES** - `price.installmentSchedule` object |
| Installment availability flag | **NONE** | N/A | **YES** - `price.installmentsAvailable` |
| CTA label ("Get started") | ctaLabel | "Scope a pilot" | No (value change only) |
| CTA destination | **NONE** | N/A | **YES** - `ctaDestination` or route logic |
| **Studio** |
| Monthly price ($2,400) | price.displayValue | "$2,500" | No (value change only) |
| Annual total ($28,800) | **NONE** | N/A | **YES** - `price.annualAmount` |
| Member cap (24) | limits.productionMembers.displayValue | "20" | No (value change only) |
| Pilot base price ($5,000) | **N/A for package** | In offer variant | No (in pilotOfferVariant) |
| Pilot credit percentage (100%) | **N/A for package** | In offer variant | No (in pilotOfferVariant) |
| CTA label ("Scope a pilot") | ctaLabel | "Scope a pilot" | No (no change) |
| **Enterprise** |
| CTA label ("Scope a pilot") | ctaLabel | "Scope a pilot" | No (no change) |
| CTA destination (pilot form) | **NONE** | N/A | **YES** - `ctaDestination` or route logic |
| Internal guidance ($150/seat, 25-seat min) | **NONE** | N/A | **YES** - `price.internalGuidance` (internal-only field) |
| **Cross-cutting** |
| Q4 discount (20%, Dec 31) | pilotOfferVariant | Exists as Q3 | No (create Q4 variant) |

### Proposed New Fields

**packagePrice** object additions:
- `annualAmount`: number (e.g., 9000, 28800)
- `onboardingFee`: number (e.g., 1000)
- `addOnSeatPrice`: number (e.g., 150)
- `addOnSeatPeriodLabel`: string (e.g., "/month, billed annually")
- `installmentsAvailable`: boolean
- `installmentSchedule`: object
  - `count`: number (e.g., 4)
  - `interval`: string (e.g., "quarter")
  - `firstPaymentIncludesOnboarding`: boolean
  - `surcharge`: number (e.g., 0)
- `internalGuidance`: string (internal-only, e.g., "$150/seat/month, 25-seat minimum")

**packageLimits** object additions:
- `addOnSeatsMax`: specificationValue (e.g., displayValue: "2", numericValue: 2)

**packageSpecification** document additions:
- `ctaDestination`: string (e.g., "/assessment", "/pilot", "/checkout")
- OR: Add `ctaType` enum to control routing logic

---

## 3. Pricing Section

### Location
- **Component**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/views/vcs-current/a.tsx`
- **Lines**: 1006-1085 (PricingSection component)
- **Called from**: VCS component, line ~1087

### Component Structure

```typescript
function PricingSection({ packageSpecifications }: { packageSpecifications: PackageSpecification[] }) {
  const pilotSpec = findPackageSpecification(packageSpecifications, PACKAGE_SPEC_SLUGS.paidPilot);
  const pilotTier = pilotSpec ? pricingTierFromSpec(pilotSpec) : undefined;
  const pricingTiers = [
    PACKAGE_SPEC_SLUGS.productionTeam,
    PACKAGE_SPEC_SLUGS.studio,
    PACKAGE_SPEC_SLUGS.enterprise,
  ]
    .map((slug) => findPackageSpecification(packageSpecifications, slug))
    .filter((specification): specification is PackageSpecification => Boolean(specification))
    .map(pricingTierFromSpec);

  return (
    <section data-header-theme="light" id="pricing">
      {/* Renders pilot card (if exists) */}
      {/* Renders three pricing tier cards */}
    </section>
  );
}
```

### Card Rendering Pattern

**Pilot card** (lines 1034-1054):
- Renders as single-column centered card
- Shows: name, period, subtitle, features list with "+" markers, CTA
- No price displayed (pilot price is in offer module)

**Pricing tier cards** (lines 1055-1081):
- Three-column grid on desktop
- Each card shows:
  - Banner (if exists)
  - Name (h3)
  - Price (h3) + period (small)
  - Subtitle
  - Features list with "+" markers
  - CTA button
  - Microcopy (if exists)

### Current Pricing Display

**Pilot card**:
- Name: "Production Pilot"
- Period: "one-time"
- Subtitle: "For qualified teams proving Portals against one active production workflow."
- Features: 1 production team, 1 active workflow, 1 historical project, up to 5 users, defined onboarding, agreed success criteria, first value in 48 hours, final deployment recommendation
- CTA: "Scope a pilot"
- Microcopy: "Annual deployment credit available. Exact pilot pricing, deployment credit, and expiration terms are established before the pilot begins."
- **CONFLICT**: Per spec, Production Team should have no pilot. This card should be removed or replaced.

**Production Team card**:
- Name: "Production Team"
- Price: "$750"
- Period: "/month, billed annually"
- Subtitle: "For small production teams establishing a trusted system of record for emerging AI workflows."
- Features: 5 production members, 3 active production repositories, unlimited reviewers and guests, complete version history and rollback, provenance tracking, standard sharing, standard integrations, standard support, guided initial setup
- CTA: "Scope a pilot"
- **CONFLICT**: Should be "Get started" routing to login/checkout, should show onboarding fee, should show add-on seat option

**Studio card**:
- Name: "Studio"
- Banner: "Best value"
- Price: "$2,500"
- Period: "/month, billed annually"
- Subtitle: "For studios managing concurrent campaigns, episodic, animation, or game pipelines."
- Features: 20 production members, 15 active production repositories, unlimited reviewers and guests, everything in Production Team, API access, audit history, role-based permissions, multiple production workspaces, standard production integrations, guided onboarding, quarterly workflow review
- CTA: "Scope a pilot"
- **CONFLICT**: Should be $2,400, 24 members, no add-on seats, should show pilot pricing terms

**Enterprise card**:
- Name: "Enterprise"
- Price: "Custom"
- Period: "annual agreement"
- Subtitle: "For multi-team organizations standardizing AI production across business units, clients, productions, or regions."
- Features: Contracted production-member capacity, contracted repositories and workspaces, everything in Studio, procurement and security support, contractual service commitments, named customer-success owner, custom onboarding and implementation planning
- CTA: "Scope a pilot"
- **CONFLICT**: Should add SSO, advanced role permissions, dedicated support to features

### List Item Format

Current format (lines 1042-1048, 1069-1075):
```typescript
<li key={feature} className="flex gap-x-8 t-p-sans">
  <span>+</span>
  <span>{feature}</span>
</li>
```

**Status**: ✅ Compliant - No headings, no bold lead-ins, no sub-labels. Plain single-line text with "+" marker.

### Price Block Pattern

Current format (lines 1064-1066):
```typescript
<span className="t-h3-sans">{tier.price}</span>
<span className="t-m2 !lowercase">{tier.period}</span>
```

**Status**: ❌ Does not match spec. Should be:
- Monthly price prominently
- Then "Billed annually ($X / year)"

Current shows: "$2,500" + "/month, billed annually"
Should show: "$2,400 /month" + "Billed annually ($28,800 / year)"

---

## 4. Other Places That Mention Pricing

### Header CTA
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/components/MarketingHeader/index.tsx`

Current CTA configuration (line 16):
```typescript
'/use-cases': { breadcrumb: [{ href: '/use-cases', label: 'use cases' }], actions: [{ href: '/pilot', label: 'Start a pilot', className: 'fixed top-15 right-sms' }] },
```

**Current state**:
- Label: "Start a pilot" (on /use-cases page only)
- No header CTA on homepage or other pages
- Not anchored to pricing section
- Not CMS-driven

**Required change**: Rename to "Get started", anchor to #pricing, apply across all pages.

### FAQ
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/faqs.ts`

**Relevant entries**:
- Line 84-87: "how is this different from a free trial?" - Mentions pilot fee covers onboarding
- Line 96-99: "what does the {pricePhrase|pilot fee} cover?" - Uses token replacement
- Line 107-112 (commented out): Old FAQ about pilot fee credit to annual

**Status**: Uses token-based system with `{pricePhrase}` placeholder. Should remain token-based for CMS-driven values.

### Stripe Configuration
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/config/stripe-products.ts`

**Current products**:
```typescript
productionTeamAnnual: {
  productId: process.env.STRIPE_PRODUCT_PRODUCTION_TEAM_ID || '',
  priceId: process.env.STRIPE_PRICE_PRODUCTION_TEAM_ID || '',
  name: 'Production Team Annual',
  description: 'Annual Production Team subscription',
  amount: 900000, // $9,000 in cents
  currency: 'usd',
  type: 'recurring',
  interval: 'year',
},
productionTeamOnboarding: {
  productId: process.env.STRIPE_PRODUCT_ONBOARDING_ID || '',
  priceId: process.env.STRIPE_PRICE_ONBOARDING_ID || '',
  name: 'Production Team Onboarding',
  description: 'Standard onboarding for Production Team',
  amount: 250000, // $2,500 in cents ⚠️ CONFLICT
  currency: 'usd',
  type: 'one_time',
},
studioAnnual: {
  productId: process.env.STRIPE_PRODUCT_STUDIO_ID || '',
  priceId: process.env.STRIPE_PRICE_STUDIO_ID || '',
  name: 'Studio Annual',
  description: 'Annual Studio subscription',
  amount: 3000000, // $30,000 in cents ⚠️ CONFLICT
  currency: 'usd',
  type: 'recurring',
  interval: 'year',
},
studioPilot: {
  productId: process.env.STRIPE_PRODUCT_STUDIO_PILOT_ID || '',
  priceId: process.env.STRIPE_PRICE_STUDIO_PILOT_ID || '',
  name: 'Studio Pilot',
  description: 'Studio pilot evaluation',
  amount: 500000, // $5,000 in cents
  currency: 'usd',
  type: 'one_time',
},
```

**CONFLICTS**:
- Onboarding fee is $2,500, should be $1,000
- Studio annual is $30,000, should be $28,800
- No add-on seat product
- No quarterly installment schedule
- No metadata for tier, member caps, add-on caps

### Forms

**Pilot scope form**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/components/leads/PilotScopeForm.tsx`
- Multi-stage form (eligibility, scope, success, purchase, confirmation)
- Shows pilot pricing from offer terms
- No tier selection (assumes Studio pilot)
- **CONFLICT**: Should add tier field (Studio vs Enterprise)

**Assessment form**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/components/leads/AssessmentForm.tsx`
- Routes to pilot application after assessment
- No pricing display

**Contact form**: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/(marketing)/contact/page.tsx`
- General inquiry form
- No pricing tier selection

### Pilot Room
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/components/leads/PilotApprovalRoom.tsx`

**Current display**:
- Shows pilot scope, terms, success criteria
- Shows pricing from offer (if applicable)
- Shows member limits
- **CONFLICT**: Should be Studio and Enterprise only, should show updated member cap (24), should not show Production Team pilot content

### Emails
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/email.ts`

**Email types**:
- Welcome emails
- Pilot confirmation emails
- Receipt emails
- Upgrade prompt emails

**Status**: Likely hard-coded values exist. Needs audit of email templates for pricing references.

### Legal Pages
**Locations**:
- Terms of Service: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/(marketing)/terms-of-service/page.tsx`
- Privacy Policy: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/(marketing)/privacy-policy/page.tsx`

**Current approach**: Both pages read from Sanity `legalDocument` type (`termsOfService`, `privacyPolicy`).

**Status**: Terms of Service needs Fair Use clause addition. No hard-coded pricing terms found (rely on CMS).

### Checkout Routes
**Locations**:
- Production Team: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/api/stripe/checkout/production-team/route.ts`
- Studio Annual: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/api/stripe/checkout/studio-annual/route.ts`
- Enterprise: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/api/stripe/checkout/enterprise/route.ts`

**Production Team checkout** (lines 60-66):
```typescript
if (body.includeOnboarding) {
  lineItems.push({
    price: onboardingConfig.priceId,
    quantity: 1,
  })
}
```

**Status**: Supports optional onboarding add-on. No quarterly installment option.

### Stripe Webhook
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/app/api/stripe/webhook/route.ts`

**Handled events**:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.paid`
- `invoice.payment_failed`
- `subscription_schedule.*` (needs verification)

**Status**: Handles basic payment success/failure. No subscription schedule logic for quarterly installments.

### Database Schema
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/migrations/004_billing_schema.sql`

**Tables**:
- `billing_customers`
- `billing_subscriptions`
- `billing_invoices`
- `billing_payments`

**Status**: Standard billing schema. No add-on seat tracking, no installment schedule tracking.

### Entitlement Enforcement
**Status**: **NOT AUDITED YET**. Backend enforcement of member caps (5, 20) and repository limits needs investigation in backend service code.

### Tests
**Test files found**:
- `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/route.test.ts`
- `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/store.test.ts`
- `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/pilot.test.ts`
- `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/scoring.test.ts`
- `/Users/vibrantceo/Projects/portals/cloud/frontend/src/lib/leads/assessment-diagnostic.test.ts`

**Status**: Tests exist for lead/pilot flow. No tests found for pricing calculations, installment math, or add-on seat limits.

### Hard-Coded Value Audit Script
**Location**: `/Users/vibrantceo/Projects/portals/cloud/frontend/scripts/audit-package-specifications.ts`

**Forbidden patterns** (lines 35-49):
```typescript
const forbiddenPatterns = [
  /\$5,000\b/,
  /\$750\b/,
  /\$2,500\b/,
  /\b21 days\b/i,
  /\b48 hours\b/i,
  /\b14 days\b/i,
  /\b10 users\b/i,
  /\bup to 10\b/i,
  /\bup to 5\b/i,
  /\b5 production members\b/i,
  /\b3 active production repositories\b/i,
  /\b20 production members\b/i,
  /\b15 active production repositories\b/i,
]
```

**Status**: ✅ Excellent enforcement mechanism. Should be updated with new forbidden patterns after pricing restructure.

---

## 5. Conflict Register

### Conflict 1: "Production Pilot" Card Removal
**Existing**: Production Pilot card displayed in pricing section with copy about annual deployment credit
**Proposed**: Remove or replace; Production Team has no pilot in new spec
**Also affects**: Pilot room, pilot form routing, CRM mapping, FAQ, pilot-offers.ts
**Reversion**: Restore pilot card from git history, restore pilot routing in header and forms
**File paths**:
- `frontend/src/views/vcs-current/a.tsx` (lines 1034-1054)
- `frontend/src/components/MarketingHeader/index.tsx` (line 16)
- `frontend/src/lib/package-specifications.ts` (PACKAGE_SPEC_SLUGS.paidPilot)
- Sanity: packageSpecification document with slug "paid-pilot"

### Conflict 2: Studio Member Cap (20 → 24)
**Existing**: Studio package has `limits.productionMembers.displayValue: "20"`, `numericValue: 20`
**Proposed**: Change to 24
**Also affects**: CMS document, Stripe metadata, pilot room, feature list
**Reversion**: Change numericValue back to 20, update feature list
**File paths**:
- `sanity/scripts/publish-package-specifications.mjs` (lines 172-178)
- Sanity: packageSpecification document with slug "studio"
- `frontend/src/views/vcs-current/a.tsx` (rendered features)

### Conflict 3: Onboarding Fee ($2,500 → $1,000)
**Existing**: Stripe product has `amount: 250000` ($2,500)
**Proposed**: Change to $1,000
**Also affects**: Stripe price object, checkout route, CMS billing note, emails
**Reversion**: Archive new price, restore old price ID in config
**File paths**:
- `frontend/config/stripe-products.ts` (lines 31-40)
- Stripe: Create new price with amount 100000, archive old price
- `frontend/app/api/stripe/checkout/production-team/route.ts` (uses onboardingConfig)
- Sanity: packageSpecification document (may need onboardingFee field)

### Conflict 4: Add-On Seats (New Feature)
**Existing**: No add-on seat mechanism
**Proposed**: Add up to 2 extra seats at $150/month each, billed annually
**Also affects**: Stripe (new product/price), CMS schema (new fields), checkout route, entitlement enforcement, receipts
**Reversion**: Remove add-on seat product from Stripe, remove CMS fields, remove checkout logic
**File paths**:
- CMS schema: `sanity/schemaTypes/packageSpecificationTypes.ts` (add fields)
- Sanity seeding: `sanity/scripts/publish-package-specifications.mjs` (add values)
- Stripe: Create new add-on seat product
- `frontend/config/stripe-products.ts` (add config)
- Checkout routes: Add add-on seat selection UI and logic
- Backend: Add entitlement enforcement for add-on seat limit

### Conflict 5: Quarterly Installment Schedule (New Feature)
**Existing**: Annual-only billing
**Proposed**: Quarterly option for Production Team (4 payments of $2,250, first includes $1,000 onboarding)
**Also affects**: Stripe subscription schedules, webhooks, dunning, access rules, checkout UI
**Reversion**: Remove schedule logic, force annual checkout only
**File paths**:
- CMS schema: Add installment schedule fields
- Stripe: Create subscription schedule configuration
- `frontend/app/api/stripe/checkout/production-team/route.ts` (add schedule logic)
- `frontend/app/api/stripe/webhook/route.ts` (handle schedule events)
- Database: Add schedule tracking if needed

### Conflict 6: "Exact Pilot Pricing" Copy
**Existing**: Pilot microcopy says "Exact pilot pricing, deployment credit, and expiration terms are established before the pilot begins."
**Proposed**: Replace with published pilot price, credit, and expiry terms from offer module
**Also affects**: Pilot form, pilot room, emails
**Reversion**: Restore old microcopy string in CMS
**File paths**:
- `sanity/scripts/publish-package-specifications.mjs` (line 97)
- Sanity: packageSpecification document (microcopy field)
- `frontend/src/lib/leads/pilot-offers.ts` (offer display logic)

### Conflict 7: Studio Price ($2,500 → $2,400)
**Existing**: Studio package has `price.displayValue: "$2,500"`, `amount: 2500`
**Proposed**: Change to $2,400/month, $28,800/year
**Also affects**: CMS document, Stripe product amount, structured data, meta tags
**Reversion**: Change displayValue back to "$2,500", amount back to 2500
**File paths**:
- `sanity/scripts/publish-package-specifications.mjs` (lines 162-169)
- Sanity: packageSpecification document with slug "studio"
- `frontend/config/stripe-products.ts` (line 48: amount 3000000 → 2880000)
- Stripe: Update price amount

### Conflict 8: Enterprise CTA Routing
**Existing**: CTA "Scope a pilot" routes to pilot form without tier distinction
**Proposed**: Route to pilot form with hidden tier field (Studio vs Enterprise)
**Also affects**: Form schema, CRM mapping, notifications, thank-you copy
**Reversion**: Remove tier field from form, restore single routing
**File paths**:
- `frontend/src/views/vcs-current/a.tsx` (pricingTierHref function)
- `frontend/src/components/leads/PilotScopeForm.tsx` (add tier field)
- `frontend/src/lib/leads/contracts.ts` (add tier to schema)
- `frontend/config/apollo-lead-operations.json` (add tier to CRM mapping)
- `frontend/src/lib/leads/crm.ts` (map tier to CRM)

### Conflict 9: Header CTA Label and Destination
**Existing**: "Start a pilot" on /use-cases only, no anchor to pricing
**Proposed**: "Get started" anchored to #pricing section across all pages
**Also affects**: Header component, mobile menu, analytics events
**Reversion**: Restore "Start a pilot", remove anchor, limit to /use-cases
**File paths**:
- `frontend/src/components/MarketingHeader/index.tsx` (line 16)
- `frontend/src/components/PortalsHeader/index.tsx` (component implementation)
- Analytics event tracking

### Conflict 10: Terms of Service Fair Use Clause
**Existing**: No Fair Use clause
**Proposed**: Add Fair Use clause to Terms of Service
**Also affects**: Legal document CMS, checkout terms
**Reversion**: Remove Fair Use clause section from CMS
**File paths**:
- Sanity: legalDocument with type "termsOfService"
- CMS seeding: `sanity/scripts/publish-legal-documents.mjs`
- Legal rendering: `frontend/src/views/legal-document.tsx`

### Conflict 11: New CMS Fields
**Existing**: No fields for annualAmount, onboardingFee, addOnSeatPrice, installmentSchedule, ctaDestination, internalGuidance
**Proposed**: Add these fields to packagePrice and packageSpecification schemas
**Also affects**: Schema types, CMS editor UI, seeding scripts, frontend types
**Reversion**: Remove new fields from schema, revert type definitions
**File paths**:
- `sanity/schemaTypes/packageSpecificationTypes.ts` (add fields)
- `frontend/src/types/resource.ts` (update PackageSpecification type)
- `sanity/scripts/publish-package-specifications.mjs` (add values)
- Frontend helpers: `frontend/src/lib/package-specifications.ts` (add helper functions)

### Conflict 12: "Get Started" Login-Then-Checkout Path
**Existing**: No direct login-then-checkout path for Production Team
**Proposed**: Build login → Stripe Checkout flow for Production Team "Get started"
**Also affects**: Auth flow, checkout routes, redirects, success page
**Reversion**: Remove login-then-checkout route, restore pilot form routing
**File paths**:
- Auth: `frontend/app/auth/sign-in/page.tsx`
- Checkout: `frontend/app/checkout/success/page.tsx`
- New route: `/checkout/production-team` or similar
- `frontend/src/views/vcs-current/a.tsx` (pricingTierHref logic)

---

## 6. Open Items

### Open Item 1: Add-On Seat Charge Mechanic
**Instruction**: "Charge a new seat the annual term immediately"
**Default interpretation**: Charge full annual seat price ($1,800) immediately with no proration; seat runs 12 months from date added
**Alternative (co-termination)**: Prorate to main renewal date
**Decision needed**: Which approach?
**Impact**: Stripe invoice timing, receipt calculation, entitlement expiry logic

### Open Item 2: Quarterly Term End Behavior
**Instruction**: "After the fourth installment, the customer renews on a new annual or quarterly schedule at their choice, with notice before renewal"
**Default interpretation**: Customer chooses renewal cadence at term end, receives notice before renewal
**Alternative**: Force annual renewal after quarterly term ends
**Decision needed**: What happens at term end?
**Impact**: Stripe schedule configuration, renewal UI, notice emails

### Open Item 3: Installment Wording
**Instruction**: "Installment payments available at checkout"
**Current**: No wording exists
**Alternative from instruction**: "Installment payments available upon request" (earlier wording)
**Decision needed**: Which wording?
**Impact**: CMS microcopy field, checkout UI label

---

## 7. Additional Findings

### Missing Features
1. **No rate limiting infrastructure**: Agent metering and server-side rate limits are explicitly excluded per spec
2. **No upgrade prompt UI**: No existing prompt when Production Team reaches 7 members or attempts 8th
3. **No Studio add-on seat blocking**: No logic to prevent Studio add-on seat purchases
4. **No internal-only field mechanism**: No way to mark CMS fields as internal-only (not rendered publicly)

### Technical Debt
1. **Hard-coded Stripe product IDs**: Environment variables required for all Stripe products
2. **No sync script for Stripe-CMS**: No script to read CMS and create/update Stripe products
3. **No Stripe metadata on products**: No tier, member cap, or add-on cap metadata on Stripe objects
4. **No subscription schedule implementation**: No existing quarterly schedule infrastructure

### CMS Documentation
- **Schema**: Well-documented in TypeScript schema types
- **Seeding**: Clear script for publishing package specifications
- **Q4 offer**: Exists as `pilotOfferVariant` with date-windowed activation
- **Legal documents**: CMS-driven via `legalDocument` type

### Test Coverage
- Lead/pilot flow: Good coverage
- Pricing calculations: No coverage
- Installment math: No coverage
- Add-on seat limits: No coverage
- Stripe webhooks: Limited coverage

---

## 8. Recommendations for Approval

### Priority 1 (Required for Phase 2)
1. ✅ Approve Audit Report findings
2. ⚠️ Approve Conflict Register items 1-12 (each may be approved individually)
3. ⚠️ Decide Open Items 1-3 (charge mechanic, term end, wording)
4. ⚠️ Verify Q4 offer exists in CMS (Q3 offer found in script, Q4 needs verification)

### Priority 2 (Architecture Decisions)
1. Approve new CMS field additions (Conflict 11)
2. Approve Stripe sync script approach (read CMS, use stable lookup keys)
3. Approve quarterly Stripe schedule implementation approach
4. Approve internal-only field mechanism for Enterprise guidance

### Priority 3 (Implementation Order)
1. CMS schema and field additions (Conflict 11)
2. CMS document updates (Conflicts 2, 3, 6, 7, 10)
3. Stripe product/price updates (Conflicts 3, 4, 5, 7)
4. Frontend component updates (Conflicts 1, 8, 9, 12)
5. Backend entitlement enforcement (new feature)
6. Form and routing updates (Conflict 8)
7. Email template updates
8. Test coverage additions

---

## 9. Approval Required

**Do not proceed to Phase 2 until owner approval is received.**

Required approvals:
- [ ] Audit Report accuracy
- [ ] Conflict Register item 1: Remove Production Pilot card
- [ ] Conflict Register item 2: Studio cap 20 → 24
- [ ] Conflict Register item 3: Onboarding fee $2,500 → $1,000
- [ ] Conflict Register item 4: Add-on seats (new feature)
- [ ] Conflict Register item 5: Quarterly installments (new feature)
- [ ] Conflict Register item 6: "Exact pilot pricing" copy replacement
- [ ] Conflict Register item 7: Studio price $2,500 → $2,400
- [ ] Conflict Register item 8: Enterprise CTA routing with tier field
- [ ] Conflict Register item 9: Header CTA "Get started" with anchor
- [ ] Conflict Register item 10: Terms of Service Fair Use clause
- [ ] Conflict Register item 11: New CMS fields
- [ ] Conflict Register item 12: Login-then-checkout path (new feature)
- [ ] Open Item 1: Add-on seat charge mechanic (immediate vs prorated)
- [ ] Open Item 2: Quarterly term end behavior
- [ ] Open Item 3: Installment wording ("at checkout" vs "upon request")

---

**END OF PHASE 1 AUDIT REPORT**
