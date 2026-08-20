import fs from 'node:fs'
import path from 'node:path'

type GitHubFileOp = { path: string; contentBase64: string } | { path: string; delete: true }

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

async function ghFetch(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...ghHeaders(token), ...(init.headers as Record<string, string>) } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub ${init.method || 'GET'} ${url} -> ${res.status} ${text}`)
  }
  return res
}

export async function commitPdfsToGitHub(opts: {
  token: string
  repo: string // DigitalCreationsCo/portals-cloud
  branch: string
  message: string
  pdfOps: Array<{ fileName: string; buffer?: Buffer; delete?: boolean }>
  manifest: Record<string, { hash: string; fileName: string }>
  manifestPathRepo: string // generated-assets/manifest.json
}): Promise<void> {
  const [owner, repoName] = opts.repo.split('/')
  const apiBase = 'https://api.github.com'

  // Get branch ref
  const refRes = await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/ref/heads/${opts.branch}`, opts.token)
  const refData = (await refRes.json()) as { object: { sha: string } }
  const baseSha = refData.object.sha

  // Get base commit + tree
  const commitRes = await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/commits/${baseSha}`, opts.token)
  const commitData = (await commitRes.json()) as { tree: { sha: string } }

  // Build blobs for new files
  const blobs: Array<{ path: string; sha: string }> = []

  for (const op of opts.pdfOps) {
    const repoPath = `generated-assets/pdfs/${op.fileName}`
    if (op.delete) {
      // deletion ->handled via tree entry with sha null
      blobs.push({ path: repoPath, sha: '' })
      continue
    }
    if (!op.buffer) continue
    const blobRes = await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/blobs`, opts.token, {
      method: 'POST',
      body: JSON.stringify({ content: op.buffer.toString('base64'), encoding: 'base64' }),
    })
    const blobData = (await blobRes.json()) as { sha: string }
    blobs.push({ path: repoPath, sha: blobData.sha })
  }

  // manifest blob
  const manifestContent = `${JSON.stringify(opts.manifest, null, 2)}\n`
  const manifestBlobRes = await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/blobs`, opts.token, {
    method: 'POST',
    body: JSON.stringify({ content: Buffer.from(manifestContent).toString('base64'), encoding: 'base64' }),
  })
  const manifestBlob = (await manifestBlobRes.json()) as { sha: string }

  // Create tree
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [
    ...blobs
      .filter((b) => b.sha)
      .map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    ...blobs
      .filter((b) => !b.sha)
      .map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: null })),
    { path: opts.manifestPathRepo, mode: '100644', type: 'blob', sha: manifestBlob.sha },
  ]

  // For deletes, GitHub tree API requires sha: null to delete; but if file never existed we can ignore
  // Filter deletes to only those that exist? attempt optimistic
  const treeRes = await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/trees`, opts.token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeEntries }),
  })
  const treeData = (await treeRes.json()) as { sha: string }

  const newCommitRes = await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/commits`, opts.token, {
    method: 'POST',
    body: JSON.stringify({ message: opts.message, tree: treeData.sha, parents: [baseSha] }),
  })
  const newCommit = (await newCommitRes.json()) as { sha: string }

  await ghFetch(`${apiBase}/repos/${owner}/${repoName}/git/refs/heads/${opts.branch}`, opts.token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  })
}

// Fallback for filesystem (local script)
export function writePdfsToDisk(pdfsDir: string, manifestPath: string, results: Array<{ slug: string; fileName: string; buffer?: Buffer; hash: string; skipped: boolean }>, manifest: Record<string, { hash: string; fileName: string }>) {
  for (const r of results) {
    if (r.skipped || !r.buffer) continue
    // delete old file if renamed
    const old = manifest[r.slug]?.fileName
    if (old && old !== r.fileName) {
      const oldPath = path.join(pdfsDir, old)
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
    }
    fs.writeFileSync(path.join(pdfsDir, r.fileName), r.buffer)
    manifest[r.slug] = { hash: r.hash, fileName: r.fileName }
  }
  // purge disabled / not-found entries
  for (const r of results) {
    if (r.skipped && (r as unknown as { reason: string }).reason === 'not-found') {
      const old = manifest[r.slug]?.fileName
      if (old) {
        const p = path.join(pdfsDir, old)
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
      delete manifest[r.slug]
    }
    if (r.skipped && (r as unknown as { reason: string }).reason === 'disabled') {
      const old = manifest[r.slug]?.fileName
      if (old) {
        const p = path.join(pdfsDir, old)
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
      delete manifest[r.slug]
    }
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}
