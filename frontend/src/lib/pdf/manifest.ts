import fs from 'node:fs'

export type ManifestEntry = string | { hash: string; fileName: string }
export type Manifest = Record<string, ManifestEntry>

export function readManifest(manifestPath: string): Manifest {
  if (!fs.existsSync(manifestPath)) return {}
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
}

export function getManifestHash(entry: ManifestEntry | undefined): string | undefined {
  return typeof entry === 'string' ? entry : entry?.hash
}

export function getManifestFileName(entry: ManifestEntry | undefined): string | undefined {
  return typeof entry === 'string' ? undefined : entry?.fileName
}
