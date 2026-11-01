import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import dotenv from 'dotenv'

dotenv.config({path: '.env.local'})

const apiKey = process.env.HUBSPOT_API_KEY
if (!apiKey) throw new Error('HUBSPOT_API_KEY is required. Use a HubSpot Private App API key with proper permissions.')

type HubSpotConfig = {
  version: string
  description: string
  lists: Array<{name: string; objectType: 'contacts' | 'companies'}>
  customFields: {
    contacts: Array<{name: string; label: string; fieldType: string; options?: string[]; description?: string}>
    companies: Array<{name: string; label: string; fieldType: string; options?: string[]; description?: string}>
    deals: Array<{name: string; label: string; fieldType: string; options?: string[]; description?: string}>
    tickets: Array<{name: string; label: string; fieldType: string; options?: string[]; description?: string}>
  }
  pipelines: {
    contacts: {lifecycle: {stages: string[]; defaultStage: string}}
    companies: {lifecycle: {stages: string[]; defaultStage: string}}
    deals: {sales_pipeline: {stages: string[]; defaultStage: string}}
    tickets: {support_pipeline: {stages: string[]; defaultStage: string}}
  }
}

type HubSpotObjectType = 'contacts' | 'companies' | 'deals' | 'tickets'
type HubSpotField = {name: string; label: string; type: string; fieldType?: string; options?: Array<{value: string; label: string}>}

const OBJECT_TYPE_MAPPING: Record<string, HubSpotObjectType> = {
  contacts: 'contacts',
  companies: 'companies',
  deals: 'deals',
  tickets: 'tickets',
}

const config = JSON.parse(
  await readFile(resolve(process.cwd(), 'config/hubspot-lead-operations.json'), 'utf8'),
) as HubSpotConfig

async function request<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${method} ${path} failed (${response.status}): ${errorText}`)
  }
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

async function createCustomField(
  objectType: HubSpotObjectType,
  fieldConfig: {name: string; label: string; fieldType: string; options?: string[]; description?: string},
): Promise<void> {
  const fieldTypeMapping: Record<string, string> = {
    single_line_text: 'string',
    multiple_line_text: 'string',
    number: 'number',
    booleancheckbox: 'boolean',
    date: 'date',
    select: 'enumeration',
    multi_select: 'string',
  }

  const fieldDefinition: Record<string, unknown> = {
    name: fieldConfig.name,
    label: fieldConfig.label,
    type: fieldTypeMapping[fieldConfig.fieldType] || 'string',
    fieldType: fieldConfig.fieldType,
    description: fieldConfig.description || '',
    hidden: false,
    formField: true,
  }

  if (fieldConfig.options && fieldConfig.options.length > 0) {
    if (fieldConfig.fieldType === 'select') {
      fieldDefinition.options = fieldConfig.options.map((option) => ({
        value: option,
        label: option,
        hidden: false,
      }))
    } else if (fieldConfig.fieldType === 'multi_select') {
      fieldDefinition.options = fieldConfig.options.map((option) => ({
        value: option,
        label: option,
        hidden: false,
      }))
    }
  }

  try {
    await request(`/crm/v3/properties/${objectType}`, 'POST', fieldDefinition)
    process.stdout.write(`created custom field: ${objectType}.${fieldConfig.name} (${fieldConfig.fieldType})\n`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      process.stdout.write(`existing custom field accepted: ${objectType}.${fieldConfig.name}\n`)
    } else {
      throw error
    }
  }
}

async function verifyCustomField(objectType: HubSpotObjectType, fieldName: string): Promise<boolean> {
  try {
    const response = await request<{results: Array<{name: string}>}>(`/crm/v3/properties/${objectType}?limit=100`, 'GET')
    return response.results.some((field) => field.name === fieldName)
  } catch {
    return false
  }
}

async function createPropertyGroup(objectType: HubSpotObjectType, groupName: string): Promise<void> {
  try {
    await request(`/crm/v3/properties/${objectType}/groups`, 'POST', {
      name: groupName,
      label: groupName,
      displayOrder: 5,
    })
    process.stdout.write(`created property group: ${objectType}.${groupName}\n`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      process.stdout.write(`existing property group accepted: ${objectType}.${groupName}\n`)
    } else {
      throw error
    }
  }
}

async function createPipeline(objectType: HubSpotObjectType, pipelineId: string, stages: string[], defaultStage: string): Promise<void> {
  const pipelineDefinition = {
    label: pipelineId,
    stages: stages.map((stage, index) => ({
      label: stage,
      displayOrder: index,
      metadata: {
        probability: index === stages.length - 1 ? 1 : index / stages.length,
      },
    })),
  }

  try {
    await request(`/crm/v3/pipelines/${objectType}`, 'POST', pipelineDefinition)
    process.stdout.write(`created pipeline: ${objectType}.${pipelineId}\n`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      process.stdout.write(`existing pipeline accepted: ${objectType}.${pipelineId}\n`)
    } else {
      throw error
    }
  }
}

async function main(): Promise<void> {
  let createdFields = 0
  let createdPipelines = 0

  // Create property groups for organization
  for (const objectType of ['contacts', 'companies', 'deals', 'tickets'] as HubSpotObjectType[]) {
    await createPropertyGroup(objectType, 'portals_lead_qualification')
    await createPropertyGroup(objectType, 'portals_pilot_management')
    await createPropertyGroup(objectType, 'portals_assessment')
  }

  // Create custom fields for each object type
  for (const [objectType, fields] of Object.entries(config.customFields)) {
    const hubspotObjectType = OBJECT_TYPE_MAPPING[objectType]
    if (!hubspotObjectType) continue

    for (const field of fields as Array<{name: string; label: string; fieldType: string; options?: string[]; description?: string}>) {
      const exists = await verifyCustomField(hubspotObjectType, field.name)
      if (exists) {
        process.stdout.write(`existing custom field verified: ${hubspotObjectType}.${field.name}\n`)
        continue
      }

      await createCustomField(hubspotObjectType, field)
      createdFields += 1
    }
  }

  // Create pipelines
  if (config.pipelines.contacts?.lifecycle) {
    await createPipeline('contacts', 'lifecycle', config.pipelines.contacts.lifecycle.stages, config.pipelines.contacts.lifecycle.defaultStage)
    createdPipelines += 1
  }

  if (config.pipelines.companies?.lifecycle) {
    await createPipeline('companies', 'lifecycle', config.pipelines.companies.lifecycle.stages, config.pipelines.companies.lifecycle.defaultStage)
    createdPipelines += 1
  }

  if (config.pipelines.deals?.sales_pipeline) {
    await createPipeline('deals', 'sales_pipeline', config.pipelines.deals.sales_pipeline.stages, config.pipelines.deals.sales_pipeline.defaultStage)
    createdPipelines += 1
  }

  if (config.pipelines.tickets?.support_pipeline) {
    await createPipeline('tickets', 'support_pipeline', config.pipelines.tickets.support_pipeline.stages, config.pipelines.tickets.support_pipeline.defaultStage)
    createdPipelines += 1
  }

  process.stdout.write(`\nHubSpot schema complete: ${createdFields} custom fields created, ${createdPipelines} pipelines created.\n`)
  process.stdout.write('Property groups created for: portals_lead_qualification, portals_pilot_management, portals_assessment\n')
  process.stdout.write('Note: Lists in HubSpot are managed as static lists or active lists in the HubSpot UI, not via API.\n')
}

main().catch((error) => {
  process.stderr.write(`\nError: ${error.message}\n`)
  process.exit(1)
})
