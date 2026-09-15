import {createClient} from '@sanity/client'
import dotenv from 'dotenv'
import path from 'path'
import {fileURLToPath} from 'url'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from the cloud/.env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const client = createClient({
  projectId: 'bnqswm24',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN
})

async function updatePilotPackage() {
  try {
    console.log('Updating Production Pilot package with discount pricing...')

    const pilot = await client.fetch(
      `*[_type == "packageSpecification" && slug.current == "paid-pilot" && status == "published"][0]{_id}`,
    )
    if (!pilot?._id) throw new Error('Published paid-pilot package specification was not found')

    await client.patch(pilot._id)
      .set({
        'price.discount': {
          percentage: 25,
          discountDisplayValue: '$3,750',
          limitedSlots: 2,
          urgencyMessage: 'Only 2 slots remaining'
        }
      })
      .commit()
    
    console.log(`✅ Successfully updated ${pilot._id} with discount:`)
    console.log('   - 25% discount applied')
    console.log('   - Discounted price: $3,750 (from $5,000)')
    console.log('   - Limited slots: 2')
    console.log('   - Urgency message: "Only 2 slots remaining"')
    
  } catch (error) {
    console.error('❌ Error updating pilot package:', error.message)
    process.exit(1)
  }
}

updatePilotPackage()
