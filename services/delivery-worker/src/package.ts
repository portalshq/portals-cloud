import {createHash} from 'node:crypto'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export type PackageManifest = {
  jobId: string
  buyerId: string
  accountId: string
  repositoryId: string
  sourceRevision: string
  files: Array<{path: string; sha256: string; bytes: number}>
  packageSha256: string
}

export async function createWorkspace(prefix = 'portals-delivery-'): Promise<string> {
  return mkdtemp(join(process.env.WORKSPACE_ROOT || tmpdir(), prefix))
}

export async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

export async function writeManifest(workspace: string, manifest: Omit<PackageManifest, 'packageSha256'>, packagePath: string): Promise<PackageManifest> {
  await mkdir(workspace, {recursive: true})
  const packageSha256 = await sha256File(packagePath)
  const complete = {...manifest, packageSha256}
  await writeFile(join(workspace, 'manifest.json'), `${JSON.stringify(complete)}\n`, {encoding: 'utf8', flag: 'wx'})
  return complete
}

export async function verifyPackage(path: string, expectedSha256: string): Promise<void> {
  const actual = await sha256File(path)
  if (actual !== expectedSha256) throw new Error('package digest mismatch')
}

export async function cleanupWorkspace(workspace: string): Promise<void> {
  await rm(workspace, {recursive: true, force: true})
}
