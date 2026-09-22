import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})
const offer = {
  _type: 'pilotOfferVariant',
  internalLabel: 'Q3 Fast-Start Offer',
  slug: {_type: 'slug', current: 'q3-fast-start'},
  basePackage: {_type: 'reference', _ref: '8PZUX3ShTf5214Jw1trnB4'},
  status: 'active',
  startsAt: '2026-09-01T04:00:00.000Z',
  endsAt: '2026-10-01T03:59:59.000Z',
  acceptanceDeadlineLabel: 'September 30, 2026',
  pilotPriceAmount: 3750,
  pilotPriceLabel: '$3,750',
  annualCreditAmount: 5000,
  annualCreditLabel: '$5,000',
  pilotDurationDays: 21,
  annualCreditRedemptionPolicy: 'standard-pilot-conversion-window',
  offerCopy: 'Sign by September 30 to lock the $3,750 pilot rate and $5,000 first-year credit. Your 21-day pilot can kick off in early October.',
  termsVersion: 'q3-fast-start@1',
}
const existing = await client.fetch('*[_type == "pilotOfferVariant" && slug.current == $slug][0]{_id}', {slug: offer.slug.current})
if (existing?._id) {
  await client.patch(existing._id).set(offer).commit()
  console.log(`updated ${existing._id}`)
} else {
  const created = await client.create(offer)
  console.log(`created ${created._id}`)
}
