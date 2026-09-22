/**
 * The PX README is assembled from these authored files plus generated command
 * reference. Keep the landing page pointed at the authored inputs, not at the
 * rendered README, so its technical details change with the documentation.
 *
 * Content is fetched from the remote PX repository
 * (portalshq/narrativeengine) at build/render time so the marketing site never
 * depends on a local px checkout.
 */
export type PxTechnicalContent = {
  install: string
  skillInstall: string
  codexMcpInstall: string
  claudeMcpInstall: string
  initialize: string
  createCharacter: string
  addRepresentation: string
  mcpSummary: string
  typescriptSdk: string
  pythonSdk: string
  sourcePaths: string[]
}

const PX_REPO = 'portalshq/narrativeengine'
const PX_REF = process.env.PX_CONTENT_REF ?? 'main'
const PX_RAW_BASE =
  process.env.PX_CONTENT_BASE ?? `https://raw.githubusercontent.com/${PX_REPO}/${PX_REF}`
const PX_BLOB_BASE = `https://github.com/${PX_REPO}/blob/${PX_REF}`

async function remoteFile(path: string) {
  const url = `${PX_RAW_BASE}/${path}`
  const res = await fetch(url, {next: {revalidate: 3600}})
  if (!res.ok) {
    throw new Error(`PX documentation fetch failed: ${path} (${res.status})`)
  }
  return res.text()
}

function firstCodeBlock(markdown: string, label: string) {
  const match = markdown.match(/```(?:bash|text)?\n([\s\S]*?)```/)
  if (!match) throw new Error(`PX documentation block is malformed: ${label}`)
  return match[1].trim()
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

export async function getPxTechnicalContent(): Promise<PxTechnicalContent> {
  const [installation, mcp, mcpInstall, addCommand, typescriptPackageJson] = await Promise.all([
    remoteFile('docs/authored/installation.md'),
    remoteFile('docs/authored/mcp/overview.md'),
    remoteFile('docs/authored/mcp/install.md'),
    remoteFile('docs/generated/commands/add.md'),
    remoteFile('typescript/px-sdk/package.json'),
  ])
  const typescriptPackage = JSON.parse(typescriptPackageJson) as {name: string}
  // The install guide ships a single one-liner (px + skills); the skills
  // snippet is the trailing `npx skills ...` segment of that line.
  const install = firstCodeBlock(installation, 'Installation')
  const skillInstall = install.includes('&&') ? install.split('&&').pop()!.trim() : install

  return {
    install,
    skillInstall,
    codexMcpInstall: codeBlock(mcpInstall, '## Connect with Codex'),
    claudeMcpInstall: codeBlock(mcpInstall, '## Connect with Claude Code'),
    initialize: [
      'px init bears',
      '',
      '# Create a character that the world can resolve',
      'px create character lonnie -u bears -n "Lonnie"',
    ].join('\n'),
    createCharacter: codeBlock(installation, '### Create & Inspect Entities').split('\n').slice(0, 5).join('\n'),
    addRepresentation: codeBlock(addCommand, '## Examples').split('\n').slice(0, 2).join('\n'),
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
      'README.template.md',
      'docs/authored/installation.md',
      'docs/authored/mcp/overview.md',
      'docs/authored/mcp/install.md',
      'docs/generated/commands/init.md',
      'docs/generated/commands/create.md',
      'docs/generated/commands/add.md',
      'typescript/px-sdk/package.json',
      'typescript/px-sdk/src/index.ts',
      'python/px-sdk/pyproject.toml',
      'python/px-sdk/px_sdk/__init__.py',
    ].map((path) => `${PX_BLOB_BASE}/${path}`),
  }
}
