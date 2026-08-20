import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from 'next-sanity'
import { generateForSlugs } from '@/lib/pdf/generate'
import { commitPdfsToGitHub, writePdfsToDisk } from '@/lib/pdf/github'
import { getGenerationFingerprint } from '@/lib/pdf/fingerprint'
import { readManifest } from '@/lib/pdf/manifest'
import path from 'node:path'
import fs from 'node:fs'

export const runtime = 'nodejs'
export const maxDuration = 10

function isValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false
  const sig = signature.trim()
  // Sanity format is `t=timestamp,v1=base64url(HMAC(timestamp.payload))` — see @sanity/webhook
  const match = sig.match(/^t=(\d+)[, ]+v1=([^, ]+)$/)
  if (!match) {
    // Fallback: try plain hex HMAC for backwards compat / manual curl tests
    const hmacHex = crypto.createHmac('sha256', secret.trim()).update(rawBody).digest('hex')
    try {
      // signature may be hex directly
      if (sig.length === hmacHex.length) {
        return crypto.timingSafeEqual(Buffer.from(hmacHex, 'hex'), Buffer.from(sig, 'hex'))
      }
    } catch {}
    return false
  }
  const timestamp = match[1]
  const v1 = match[2]
  const payload = `${timestamp}.${rawBody}`
  const hmacBase64Url = crypto
    .createHmac('sha256', secret.trim())
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  try {
    // timingSafeEqual requires same length
    if (hmacBase64Url.length !== v1.length) return false
    return crypto.timingSafeEqual(Buffer.from(hmacBase64Url), Buffer.from(v1))
  } catch {
    return false
  }
}

function getSanityClient() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
  if (!projectId || !dataset) throw new Error('Missing Sanity projectId/dataset')
  return createClient({ projectId, dataset, apiVersion: '2025-02-19', useCdn: false })
}

export async function POST(req: Request) {
  const secret = process.env.SANITY_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const sig = req.headers.get('sanity-webhook-signature') || req.headers.get('Sanity-Webhook-Signature')

  if (!isValidSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const doc = body as Record<string, unknown>
  // Support both flat projection and {document: {...}} wrapper
  const payload = (doc.document as Record<string, unknown>) || doc
  const type = (payload._type as string) || (doc._type as string)
  const id = (payload._id as string) || (doc._id as string)
  const slug = (payload.slug as string) || (doc.slug as string)
  const status = payload.status as string | undefined

  if (!type || !['_type', '_id'].every(() => true)) {
    // ignore unknown
  }

  if (type && !['resourceDocument', 'packageSpecification'].includes(type)) {
    return NextResponse.json({ received: true, ignored: true, reason: `type ${type} not relevant` })
  }

  // Resolve affected slugs
  let affectedSlugs: string[] = []

  if (type === 'resourceDocument') {
    if (slug) affectedSlugs = [slug]
    else if (id) {
      // try fetch by id to get slug
      try {
        const client = getSanityClient()
        const fetched = await client.fetch<{ slug: string } | null>(
          `*[_id == $id][0]{"slug": slug.current}`,
          { id },
        )
        if (fetched?.slug) affectedSlugs = [fetched.slug]
      } catch {}
    }
    // Deletion: if payload indicates delete, we still need old manifest entry
    // We'll handle deletion below via manifest lookup
    const isDelete = (payload.operation as string) === 'delete' || (doc as Record<string, unknown>).operation === 'delete'
    if (isDelete && !affectedSlugs.length) {
      // Fallback: will resolve via manifest reverse lookup in generate step
      // Use slug from payload if present else empty -> handled as deletion via id
    }
  } else if (type === 'packageSpecification') {
    // Find all resourceDocuments that reference this packageSpecification
    try {
      const client = getSanityClient()
      const refs = await client.fetch<Array<{ slug: string }>>(
        `*[_type == "resourceDocument" && defined(slug.current) && references($id)]{"slug": slug.current}`,
        { id },
      )
      affectedSlugs = refs.map((r) => r.slug)
      if (!affectedSlugs.length) {
        // No referencing resources, but paid-pilot doc embeds packageSpec values; still nothing to regen? Still return early
        return NextResponse.json({ received: true, ignored: true, reason: 'no referencing resources' })
      }
    } catch (e) {
      console.error('sanity webhook references fetch failed', e)
      return NextResponse.json({ error: 'references lookup failed' }, { status: 500 })
    }
  } else {
    return NextResponse.json({ received: true, ignored: true })
  }

  // If type is resourceDocument and status explicitly not published and not delete, we may need to delete PDF
  const isUnpublished = type === 'resourceDocument' && status && status !== 'published'

  // Load manifest for commit handling
  const assetsDir = fs.existsSync(path.resolve(process.cwd(), '../generated-assets'))
    ? path.resolve(process.cwd(), '../generated-assets')
    : path.resolve(process.cwd(), 'generated-assets')
  // In Vercel, process.cwd() is frontend dir, assets are one level up
  const altAssetsDir = path.resolve(process.cwd(), '../generated-assets')
  const resolvedAssetsDir = fs.existsSync(altAssetsDir) ? altAssetsDir : path.resolve(process.cwd(), 'generated-assets')
  const manifestPath = path.join(resolvedAssetsDir, 'manifest.json')
  const pdfsDir = path.join(resolvedAssetsDir, 'pdfs')
  const manifest = readManifest(manifestPath)
  const generationFingerprint = getGenerationFingerprint()

  // Deletion / disable handling: if unpublished or delete operation, remove PDF
  const wantsDeletion = isUnpublished || (payload.operation as string) === 'delete' || (doc as Record<string, unknown>).operation === 'delete'

  if (wantsDeletion && affectedSlugs.length) {
    // For each affected slug, if manifest has entry, delete file and manifest entry
    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPO
    const branch = process.env.GITHUB_BRANCH || 'main'
    if (!token || !repo) {
      // Local: delete from disk
      for (const s of affectedSlugs) {
        const entry = manifest[s]
        const fileName = typeof entry === 'string' ? undefined : entry?.fileName
        if (fileName) {
          const p = path.join(pdfsDir, fileName)
          if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        delete manifest[s]
      }
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      return NextResponse.json({ received: true, deleted: affectedSlugs })
    }

    // GitHub deletion commit
    const deletes = affectedSlugs
      .map((s) => {
        const entry = manifest[s]
        const fileName = typeof entry === 'string' ? undefined : entry?.fileName
        if (!fileName) return null
        return { fileName, delete: true as const }
      })
      .filter(Boolean) as Array<{ fileName: string; delete: true }>

    if (deletes.length) {
      for (const s of affectedSlugs) delete (manifest as Record<string, unknown>)[s]
      const newManifestForDelete: Record<string, { hash: string; fileName: string }> = {}
      for (const [k, v] of Object.entries(manifest)) {
        if (typeof v === 'string') continue
        if (v && typeof (v as { hash: string }).hash === 'string') newManifestForDelete[k] = v as { hash: string; fileName: string }
      }
      try {
        await commitPdfsToGitHub({
          token,
          repo,
          branch,
          message: `chore(pdfs): delete ${affectedSlugs.join(', ')} via Sanity webhook`,
          pdfOps: deletes,
          manifest: newManifestForDelete,
          manifestPathRepo: 'generated-assets/manifest.json',
        })
      } catch (e) {
        console.error('github delete commit failed', e)
        return NextResponse.json({ error: 'github commit failed' }, { status: 500 })
      }
    }
    return NextResponse.json({ received: true, deleted: affectedSlugs })
  }

  if (!affectedSlugs.length) {
    return NextResponse.json({ received: true, ignored: true, reason: 'no slugs resolved' })
  }

  // Generate PDFs for affected slugs
  let results: Awaited<ReturnType<typeof generateForSlugs>>
  try {
    results = await generateForSlugs(affectedSlugs, { manifest, generationFingerprint })
  } catch (e) {
    console.error('pdf generate failed', e)
    return NextResponse.json({ error: 'pdf generation failed' }, { status: 500 })
  }

  const toCommit = results.filter((r) => !r.skipped && r.buffer)
  const skipped = results.filter((r) => r.skipped).map((r) => r.slug)

  if (!toCommit.length) {
    return NextResponse.json({ received: true, skipped, regenerated: [] })
  }

  // Mutate manifest for committed entries
  const newManifest: Record<string, { hash: string; fileName: string }> = {}
  for (const [k, v] of Object.entries(manifest)) {
    if (typeof v === 'string') continue
    if (v && typeof v.hash === 'string' && typeof v.fileName === 'string') newManifest[k] = v
  }
  for (const r of toCommit) {
    newManifest[r.slug] = { hash: r.hash, fileName: r.fileName }
  }

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH || 'main'

  if (!token || !repo) {
    // Local / preview without GH creds: write to disk (dev only)
    writePdfsToDisk(pdfsDir, manifestPath, results, newManifest as Record<string, { hash: string; fileName: string }>)
    return NextResponse.json({ received: true, regenerated: toCommit.map((r) => r.fileName), skipped, mode: 'filesystem' })
  }

  // Collect delete ops for renames
  const pdfOps: Array<{ fileName: string; buffer?: Buffer; delete?: boolean }> = toCommit.map((r) => ({
    fileName: r.fileName,
    buffer: r.buffer!,
  }))

  for (const r of toCommit) {
    const old = manifest[r.slug] as { fileName?: string } | string | undefined
    const oldFileName = typeof old === 'string' ? undefined : old?.fileName
    if (oldFileName && oldFileName !== r.fileName) {
      pdfOps.push({ fileName: oldFileName, delete: true })
    }
  }

  try {
    await commitPdfsToGitHub({
      token,
      repo,
      branch,
      message: `chore(pdfs): regenerate ${toCommit.map((r) => r.slug).join(', ')} via Sanity webhook`,
      pdfOps,
      manifest: newManifest,
      manifestPathRepo: 'generated-assets/manifest.json',
    })
  } catch (e) {
    console.error('github commit failed', e)
    return NextResponse.json({ error: 'github commit failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true, regenerated: toCommit.map((r) => r.fileName), skipped })
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: 'sanity-pdf' })
}
