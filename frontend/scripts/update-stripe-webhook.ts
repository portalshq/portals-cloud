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

async function updateStripeWebhook() {
  console.log('Fetching existing webhooks...\n')

  const webhooks = await stripe.webhookEndpoints.list()
  console.log(`Found ${webhooks.data.length} webhook(s):\n`)

  for (const webhook of webhooks.data) {
    console.log(`- ${webhook.url} (ID: ${webhook.id})`)
    console.log(`  Current events: ${webhook.enabled_events.join(', ')}`)
  }

  const requiredEvents = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'payment_intent.succeeded',
  ]

  if (webhooks.data.length === 0) {
    console.log('\nNo webhooks found. Creating new webhook...')
    console.log('Note: You need to provide your webhook URL.')
    console.log('Example: https://your-domain.com/api/stripe/webhook')
    console.log('\nTo create a webhook, use the Stripe Dashboard or update this script with your webhook URL.')
    console.log('\nRequired events for new webhook:')
    requiredEvents.forEach(event => console.log(`  - ${event}`))
    process.exit(0)
  }

  // Update the first webhook (you may want to specify which one)
  const webhook = webhooks.data[0]
  console.log(`\nUpdating webhook: ${webhook.url}`)

  const updatedWebhook = await stripe.webhookEndpoints.update(webhook.id, {
    enabled_events: [
      ...webhook.enabled_events,
      ...requiredEvents.filter(event => !webhook.enabled_events.includes(event)),
    ],
  })

  console.log(`\n✅ Webhook updated successfully!`)
  console.log(`URL: ${updatedWebhook.url}`)
  console.log(`Events: ${updatedWebhook.enabled_events.join(', ')}`)
}

updateStripeWebhook().catch(error => {
  console.error('Error updating webhook:', error)
  process.exit(1)
})
