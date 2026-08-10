import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({path: '.env.local'})

const apiKey = process.env.ATTIO_API_KEY
if (!apiKey) {
  throw new Error(
    'ATTIO_API_KEY is required to provision the Attio workspace. Use a token with the object_configuration:read-write and list_configuration:read-write scopes.',
  )
}

type ListSpec = {
  name: string
  apiSlug: string
  parentObject: string
  history?: boolean
  operationalRank?: number
  manual?: boolean
}

type AttributeSpec = {
  title: string
  apiSlug: string
  type: string
  object: string
  unique?: boolean
  multiline?: boolean
  options?: string[]
}

const config = JSON.parse(
  await readFile(resolve(process.cwd(), 'config/attio-lead-operations.json'), 'utf8'),
) as {lists: ListSpec[]; attributes: AttributeSpec[]}

async function request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.attio.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${await response.text()}`)
  }
  const responseText = await response.text()
  return (responseText ? JSON.parse(responseText) : {}) as T
}

const apiType = (type: string): string =>
  type === 'multi-select' ? 'select' : type

const isSelect = (type: string): boolean =>
  type === 'select' || type === 'multi-select'

type AttioError = {
  status_code?: number
  code?: string
  message?: string
}

function isConflict(caught: unknown): boolean {
  if (!(caught instanceof Error)) return false
  const separator = caught.message.indexOf('): ')
  if (separator < 0) return false
  try {
    const detail = JSON.parse(caught.message.slice(separator + 3)) as AttioError
    return detail.status_code === 409
  } catch {
    return false
  }
}

const summary: string[] = []
const failures: string[] = []

const existingLists = await request<{data: Array<{api_slug: string}>}>(
  '/v2/lists?limit=100',
  'GET',
)
const listSlugs = new Set(existingLists.data.map((list) => list.api_slug))

for (const list of config.lists) {
  if (listSlugs.has(list.apiSlug)) {
    summary.push(`list ok (exists): ${list.apiSlug}`)
    continue
  }
  try {
    await request('/v2/lists', 'POST', {
      data: {
        name: list.name,
        api_slug: list.apiSlug,
        parent_object: list.parentObject,
        workspace_access: 'full-access',
        workspace_member_access: [],
      },
    })
    summary.push(`list created: ${list.apiSlug}`)
  } catch (error) {
    if (isConflict(error)) {
      summary.push(`list ok (exists): ${list.apiSlug}`)
    } else {
      failures.push(`list create failed ${list.apiSlug}: ${String(error)}`)
    }
  }
}

const objectAttributes = new Map<string, Set<string>>()

async function existingSlugs(object: string): Promise<Set<string>> {
  const cached = objectAttributes.get(object)
  if (cached) return cached
  const response = await request<{data: Array<{api_slug: string}>}>(
    `/v2/objects/${object}/attributes`,
    'GET',
  )
  const slugs = new Set(response.data.map((attribute) => attribute.api_slug))
  objectAttributes.set(object, slugs)
  return slugs
}

for (const attribute of config.attributes) {
  for (const object of attribute.object.split(',')) {
    const objectSlug = object.trim()
    let slugs: Set<string>
    try {
      slugs = await existingSlugs(objectSlug)
    } catch (error) {
      failures.push(
        `attribute lookup skipped ${objectSlug} (is the object enabled?): ${String(error)}`,
      )
      continue
    }
    if (!slugs.has(attribute.apiSlug)) {
      try {
        await request(`/v2/objects/${objectSlug}/attributes`, 'POST', {
          data: {
            title: attribute.title,
            description: '',
            api_slug: attribute.apiSlug,
            type: apiType(attribute.type),
            is_required: false,
            is_unique: Boolean(attribute.unique),
            is_multiselect: attribute.type === 'multi-select',
            config: {},
          },
        })
        slugs.add(attribute.apiSlug)
        summary.push(`attribute created: ${objectSlug}/${attribute.apiSlug}`)
      } catch (error) {
        if (isConflict(error)) {
          slugs.add(attribute.apiSlug)
          summary.push(`attribute ok (exists): ${objectSlug}/${attribute.apiSlug}`)
        } else {
          failures.push(
            `attribute create failed ${objectSlug}/${attribute.apiSlug}: ${String(error)}`,
          )
          continue
        }
      }
    } else {
      summary.push(`attribute ok (exists): ${objectSlug}/${attribute.apiSlug}`)
    }
    if (!isSelect(attribute.type)) continue
    if (!attribute.options || attribute.options.length === 0) {
      failures.push(
        `attribute ${objectSlug}/${attribute.apiSlug} has no options: select writes will fail until options exist. Add an "options" array in config/attio-lead-operations.json.`,
      )
      continue
    }
    let existingOptions: Set<string>
    try {
      const response = await request<{data: Array<{title: string}>}>(
        `/v2/objects/${objectSlug}/attributes/${attribute.apiSlug}/options?limit=1000`,
        'GET',
      )
      existingOptions = new Set(response.data.map((option) => option.title))
    } catch (error) {
      failures.push(
        `option lookup failed ${objectSlug}/${attribute.apiSlug}: ${String(error)}`,
      )
      continue
    }
    for (const title of attribute.options) {
      if (existingOptions.has(title)) {
        summary.push(`option ok (exists): ${objectSlug}/${attribute.apiSlug}/${title}`)
        continue
      }
      try {
        await request(
          `/v2/objects/${objectSlug}/attributes/${attribute.apiSlug}/options`,
          'POST',
          {data: {title}},
        )
        summary.push(`option added: ${objectSlug}/${attribute.apiSlug}/${title}`)
      } catch (error) {
        failures.push(
          `option create failed ${objectSlug}/${attribute.apiSlug}/${title}: ${String(error)}`,
        )
      }
    }
  }
}

for (const line of summary) process.stdout.write(`${line}\n`)
if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} failure(s):\n`)
  for (const line of failures) process.stderr.write(`- ${line}\n`)
  const scopeHint =
    'The API key needs the object_configuration:read-write and list_configuration:read-write scopes. A workspace admin can grant them at Workspace settings -> Developers -> [integration] -> Scopes.'
  process.stderr.write(`\n${scopeHint}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('\nAttio lead operations are fully provisioned.\n')
}