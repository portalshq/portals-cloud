import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

/**
 * The PX README is assembled from these authored files plus generated command
 * reference. Keep the landing page pointed at the authored inputs, not at the
 * rendered README, so its technical details change with the documentation.
 */
export type PxTechnicalContent = {
  install: string
  skillInstall: string
  initialize: string
  createCharacter: string
  addRepresentation: string
  mcpSummary: string
  typescriptSdk: string
  pythonSdk: string
  sourcePaths: string[]
}

function pxRoot() {
  const candidates = [
    resolve(process.cwd(), 'px'),
    resolve(process.cwd(), '../px'),
    resolve(process.cwd(), '../../px'),
  ]
  const root = candidates.find((candidate) => existsSync(resolve(candidate, 'docs/authored/installation.md')))

  if (!root) {
    throw new Error('Unable to locate PX documentation sources.')
  }

  return root
}

function authoredFile(root: string, path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

function codeBlock(markdown: string, marker: string) {
  const start = markdown.indexOf(marker)
  if (start === -1) throw new Error(`PX documentation block not found: ${marker}`)
  const afterMarker = markdown.slice(start + marker.length)
  const match = afterMarker.match(/```(?:bash|text)?\n([\s\S]*?)```/)
  if (!match) throw new Error(`PX documentation block is malformed: ${marker}`)
  return match[1].trim()
}

function paragraphAfter(markdown: string, heading: string) {
  const start = markdown.indexOf(heading)
  if (start === -1) throw new Error(`PX documentation heading not found: ${heading}`)
  return markdown
    .slice(start + heading.length)
    .split('\n\n')
    .find((paragraph) => paragraph.trim() && !paragraph.startsWith('```'))
    ?.replaceAll('\n', ' ')
    .trim() ?? ''
}

export function getPxTechnicalContent(): PxTechnicalContent {
  const root = pxRoot()
  const installation = authoredFile(root, 'docs/authored/installation.md')
  const mcp = authoredFile(root, 'docs/authored/mcp/overview.md')
  const primitives = authoredFile(root, 'docs/authored/primitives.md')
  const typescriptPackage = JSON.parse(authoredFile(root, 'typescript/px-sdk/package.json')) as {name: string}

  return {
    install: codeBlock(installation, '### Installation Script'),
    skillInstall: codeBlock(installation, '### Skills Install'),
    initialize: [
      'px init bears --provider local',
      '',
      '# Create a character that the world can resolve',
      'px create character lonnie -u bears -n "Lonnie"',
    ].join('\n'),
    createCharacter: codeBlock(installation, '### Create & Inspect Entities').split('\n').slice(0, 5).join('\n'),
    addRepresentation: codeBlock(primitives, '### Scene Clips as Representations').split('\n').slice(0, 2).join('\n'),
    mcpSummary: paragraphAfter(mcp, '## MCP Server'),
    typescriptSdk: [
      `import {repoCreateEntity} from '${typescriptPackage.name}'`,
      '',
      "const lonnie = repoCreateEntity('bears', 'character', 'lonnie', 'Lonnie')",
    ].join('\n'),
    pythonSdk: [
      'from px_sdk import repo_create_entity',
      '',
      "lonnie = repo_create_entity('bears', 'character', 'lonnie', 'Lonnie')",
    ].join('\n'),
    sourcePaths: [
      'px/README.template.md',
      'px/docs/authored/installation.md',
      'px/docs/authored/primitives.md',
      'px/docs/authored/mcp/overview.md',
      'px/docs/generated/commands/init.md',
      'px/docs/generated/commands/create.md',
      'px/docs/generated/commands/add.md',
      'px/typescript/px-sdk/package.json',
      'px/typescript/px-sdk/src/index.ts',
      'px/python/px-sdk/pyproject.toml',
      'px/python/px-sdk/px_sdk/__init__.py',
    ],
  }
}
