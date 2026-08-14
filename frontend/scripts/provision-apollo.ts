import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import dotenv from 'dotenv'

dotenv.config({path: '.env.local'})

const apiKey = process.env.APOLLO_API_KEY
if (!apiKey) throw new Error('APOLLO_API_KEY is required. Use a Master API key so the script can create and verify workspace resources.')

type Modality = 'contact' | 'account' | 'opportunity'
type FieldType = 'string' | 'textarea' | 'number' | 'boolean'
type ApolloConfig = {
  lists: Array<{name: string; modality: 'contacts' | 'accounts'}>
  customFields: Array<{key: string; label: string; modalities: Modality[]; type: FieldType}>
  dealStages: string[]
}
type ApolloList = {id: string; name: string; modality: 'contacts' | 'accounts'}
type ApolloField = {id: string; label: string; modality: Modality; type?: string}
type ApolloStage = {id: string; name?: string; label?: string}

const config = JSON.parse(
  await readFile(resolve(process.cwd(), 'config/apollo-lead-operations.json'), 'utf8'),
) as ApolloConfig

async function request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.apollo.io${path}`, {
    method,
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  })
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${await response.text()}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

function collection<T>(payload: Record<string, unknown>, keys: string[]): T[] {
  for (const key of keys) {
    const value = payload[key]
    if (Array.isArray(value)) return value as T[]
  }
  return []
}

async function lists(): Promise<ApolloList[]> {
  return collection<ApolloList>(await request<Record<string, unknown>>('/api/v1/labels', 'GET'), ['labels', 'data'])
}

async function fields(): Promise<ApolloField[]> {
  return collection<ApolloField>(await request<Record<string, unknown>>('/api/v1/fields', 'GET'), ['fields', 'custom_fields', 'data'])
}

async function stages(): Promise<ApolloStage[]> {
  return collection<ApolloStage>(await request<Record<string, unknown>>('/api/v1/opportunity_stages', 'GET'), ['opportunity_stages', 'stages', 'data'])
}

let createdLists = 0
let createdFields = 0
const existingLists = new Set((await lists()).map((item) => `${item.modality}:${item.name}`))
for (const list of config.lists) {
  const key = `${list.modality}:${list.name}`
  if (existingLists.has(key)) continue
  try {
    await request('/api/v1/labels', 'POST', {name: list.name, modality: list.modality})
  } catch (error) {
    // Apollo can return a stale or incomplete list response immediately after
    // a create. Its documented duplicate response is still the desired state.
    if (!(error instanceof Error) || !error.message.includes('already exists')) throw error
    process.stdout.write(`existing list accepted: ${key}\n`)
    continue
  }
  createdLists += 1
  process.stdout.write(`created list: ${key}\n`)
}

const existingFields = new Set((await fields()).map((item) => `${item.modality}:${item.label}`))
for (const field of config.customFields) {
  for (const modality of field.modalities) {
    const key = `${modality}:${field.label}`
    if (existingFields.has(key)) continue
    try {
      await request('/api/v1/fields', 'POST', {label: field.label, modality, type: field.type})
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already exists')) throw error
      process.stdout.write(`existing custom field accepted: ${key}\n`)
      continue
    }
    createdFields += 1
    process.stdout.write(`created custom field: ${key} (${field.type})\n`)
  }
}

const finalFields = await fields()
const missingFields = config.customFields.flatMap((field) =>
  field.modalities
    .filter((modality) => !finalFields.some((item) => item.modality === modality && item.label === field.label))
    .map((modality) => `${modality}:${field.label}`),
)
if (missingFields.length > 0) {
  throw new Error(`Apollo did not return these required custom fields after provisioning: ${missingFields.join(', ')}`)
}

const finalStages = await stages()
const stageName = (stage: ApolloStage) => stage.name || stage.label || ''
const missingStages = config.dealStages.filter((name) => !finalStages.some((stage) => stageName(stage) === name))

process.stdout.write(`\nApollo schema complete: ${createdLists} lists created, ${createdFields} custom fields created.\n`)
process.stdout.write('Picklist-shaped fields are stored as strings (or textarea for multi-value fields), because Apollo’s public Custom Fields API supports scalar field types only. Their allowed values remain documented in config/apollo-lead-operations.json.\n')
if (missingStages.length > 0) {
  process.stderr.write(`\nCreate these deal stages in Apollo, then rerun this command: ${missingStages.join(', ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('Required deal stages verified: Pilot Requested, Paid Pilot, Customer.\n')
}
