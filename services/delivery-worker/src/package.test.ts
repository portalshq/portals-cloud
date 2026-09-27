import assert from 'node:assert/strict'
import {mkdtemp, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {cleanupWorkspace, createWorkspace, sha256File, verifyPackage, writeManifest} from './package.js'

test('package manifest is content-addressed and detects tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portals-package-test-'))
  const workspace = await createWorkspace('nested-')
  const packagePath = join(root, 'package.bin')
  await writeFile(packagePath, 'approved package')
  const digest = await sha256File(packagePath)
  const manifest = await writeManifest(workspace, {
    jobId: 'job-1', buyerId: 'buyer', accountId: 'account', repositoryId: 'repo',
    sourceRevision: 'rev-1', files: [],
  }, packagePath)
  assert.equal(manifest.packageSha256, digest)
  assert.equal((await readFile(join(workspace, 'manifest.json'), 'utf8')).includes(digest), true)
  await verifyPackage(packagePath, digest)
  await writeFile(packagePath, 'tampered')
  await assert.rejects(() => verifyPackage(packagePath, digest), /digest mismatch/)
  await cleanupWorkspace(workspace)
  await cleanupWorkspace(root)
})
