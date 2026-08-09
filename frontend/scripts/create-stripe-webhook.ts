import Stripe from 'stripe'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({path: '.env.local'})

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY environment variable is required')
  process.exit(1)
}

const webhookUrl = process.env.STRIPE_WEBHOOK_URL
if (!webhookUrl) {
  console.error('STRIPE_WEBHOOK_URL environment variable is required')
  console.log('Example: STRIPE_WEBHOOK_URL=https://your-domain.com/api/stripe/webhook')
  process.exit(1)
}

const stripe = new Stripe(secretKey)

async function createStripeWebhook() {
  console.log(`Creating webhook for: ${webhookUrl}\n`)

  const requiredEvents = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'payment_intent.succeeded',
  ]

  const webhook = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: requiredEvents,
  })

  console.log(`✅ Webhook created successfully!`)
  console.log(`Webhook ID: ${webhook.id}`)
  console.log(`URL: ${webhook.url}`)
  console.log(`Events: ${webhook.enabled_events.join(', ')}`)
  console.log(`\n⚠️ IMPORTANT: Add this webhook secret to your .env.local:`)
  console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`)
}

createStripeWebhook().catch(error => {
  console.error('Error creating webhook:', error)
  process.exit(1)
})
