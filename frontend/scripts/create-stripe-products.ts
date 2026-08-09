import Stripe from 'stripe'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({path: '.env.local'})

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY environment variable is required')
  process.exit(1)
}

const stripe = new Stripe(secretKey)

async function createStripeProducts() {
  console.log('Creating Stripe Products and Prices...\n')

  // 1. Production Team Annual - $9,000/year
  console.log('Creating Production Team Annual product...')
  const productionTeamProduct = await stripe.products.create({
    name: 'Production Team Annual',
    description: 'Annual Production Team subscription',
    metadata: {
      product_type: 'production-team',
    },
  })

  const productionTeamPrice = await stripe.prices.create({
    product: productionTeamProduct.id,
    unit_amount: 900000, // $9,000 in cents
    currency: 'usd',
    recurring: {
      interval: 'year',
    },
  })

  console.log(`✓ Production Team Annual: Product ID=${productionTeamProduct.id}, Price ID=${productionTeamPrice.id}`)

  // 2. Production Team Onboarding - $2,500 one-time
  console.log('\nCreating Production Team Onboarding product...')
  const onboardingProduct = await stripe.products.create({
    name: 'Production Team Onboarding',
    description: 'Standard onboarding for Production Team',
    metadata: {
      product_type: 'onboarding',
    },
  })

  const onboardingPrice = await stripe.prices.create({
    product: onboardingProduct.id,
    unit_amount: 250000, // $2,500 in cents
    currency: 'usd',
  })

  console.log(`✓ Production Team Onboarding: Product ID=${onboardingProduct.id}, Price ID=${onboardingPrice.id}`)

  // 3. Studio Annual - $30,000/year
  console.log('\nCreating Studio Annual product...')
  const studioAnnualProduct = await stripe.products.create({
    name: 'Studio Annual',
    description: 'Annual Studio subscription',
    metadata: {
      product_type: 'studio',
    },
  })

  const studioAnnualPrice = await stripe.prices.create({
    product: studioAnnualProduct.id,
    unit_amount: 3000000, // $30,000 in cents
    currency: 'usd',
    recurring: {
      interval: 'year',
    },
  })

  console.log(`✓ Studio Annual: Product ID=${studioAnnualProduct.id}, Price ID=${studioAnnualPrice.id}`)

  // 4. Studio Pilot - $5,000 one-time
  console.log('\nCreating Studio Pilot product...')
  const studioPilotProduct = await stripe.products.create({
    name: 'Studio Pilot',
    description: 'Studio pilot evaluation',
    metadata: {
      product_type: 'studio-pilot',
    },
  })

  const studioPilotPrice = await stripe.prices.create({
    product: studioPilotProduct.id,
    unit_amount: 500000, // $5,000 in cents
    currency: 'usd',
  })

  console.log(`✓ Studio Pilot: Product ID=${studioPilotProduct.id}, Price ID=${studioPilotPrice.id}`)

  // Output environment variables
  console.log('\n' + '='.repeat(60))
  console.log('Add these environment variables to your .env file:')
  console.log('='.repeat(60))
  console.log(`STRIPE_PRODUCT_PRODUCTION_TEAM_ID=${productionTeamProduct.id}`)
  console.log(`STRIPE_PRICE_PRODUCTION_TEAM_ID=${productionTeamPrice.id}`)
  console.log(`STRIPE_PRODUCT_ONBOARDING_ID=${onboardingProduct.id}`)
  console.log(`STRIPE_PRICE_ONBOARDING_ID=${onboardingPrice.id}`)
  console.log(`STRIPE_PRODUCT_STUDIO_ID=${studioAnnualProduct.id}`)
  console.log(`STRIPE_PRICE_STUDIO_ID=${studioAnnualPrice.id}`)
  console.log(`STRIPE_PRODUCT_STUDIO_PILOT_ID=${studioPilotProduct.id}`)
  console.log(`STRIPE_PRICE_STUDIO_PILOT_ID=${studioPilotPrice.id}`)
  console.log('='.repeat(60))
  console.log('\n✅ All Stripe Products and Prices created successfully!')
}

createStripeProducts().catch(error => {
  console.error('Error creating Stripe products:', error)
  process.exit(1)
})
