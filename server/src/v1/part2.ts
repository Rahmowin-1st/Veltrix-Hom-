import type { Request } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { openPdf, extractPageText } from '../services/pdfText.js'
import { embedOne } from '../services/gemini.js'
import { canonicalAuth } from './auth.js'
import { defaultAiRouter } from './aiRouter.js'
import { digestSecret, safeEqualText } from './crypto.js'
import { ApiError } from './errors.js'
import { beginIdempotency, completeIdempotency, failIdempotency, requestFingerprint } from './idempotency.js'
import { enqueueJob, registerJobHandler } from './jobs.js'
import { finalizeLibraryQuota, getQuotaPolicy, libraryQuotaStatus, reserveLibraryQuota } from './quota.js'
import { consumeRateLimit, RATE_LIMIT_DEFAULTS } from './rateLimit.js'

const MiB = 1024 * 1024
const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

function idempotencyKey(req: Request) {
  const value = req.header('Idempotency-Key')
  if (!value) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required.')
  return value
}

function normalizeName(value: string, max = 160) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > max) throw new ApiError(400, 'NAME_INVALID', 'Name is invalid.')
  return normalized
}

export function normalizeTagName(value: string) {
  return normalizeName(value, 80).normalize('NFKC').toLocaleLowerCase('en-US')
}

function projectResource(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name, icon: row.icon, accent: row.accent, purpose: row.purpose,
    archivedAt: row.archived_at, trashedAt: row.trashed_at, purgeAfter: row.purge_after,
    revision: Number(row.revision), createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function notebookResource(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name, description: row.description, icon: row.icon, accent: row.accent,
    aiConfig: row.ai_config ?? {}, archivedAt: row.archived_at, trashedAt: row.trashed_at,
    purgeAfter: row.purge_after, revision: Number(row.revision), createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

// ---------- Projects ----------
router.post('/projects', async (req, res, next) => {
  const id = accountId(req)
  const key = idempotencyKey(req)
  const route = '/api/v1/projects'
  const body = z.object({
    name: z.string(), icon: z.string().max(64).optional(), accent: z.string().max(64).optional(), purpose: z.string().max(2000).optional(),
  }).parse(req.body)
  body.name = normalizeName(body.name)
  const fingerprint = requestFingerprint('POST', route, body)
  try {
    const replay = await beginIdempotency(id, route, key, fingerprint)
    if (replay) return res.status(replay.status).json(replay.body)
    const { data, error } = await admin.from('vh_projects').insert({
      account_id: id, name: body.name, icon: body.icon ?? null, accent: body.accent ?? null, purpose: body.purpose?.trim() || null,
    }).select('*').single()
    if (error) throw error
    const resource = projectResource(data)
    await completeIdempotency(id, route, key, 201, resource)
    res.status(201).json(resource)
  } catch (error) { await failIdempotency(id, route, key).catch(() => undefined); next(error) }
})

router.get('/projects', async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
    const { data, error } = await admin.from('vh_projects').select('*').eq('account_id', accountId(req)).is('trashed_at', null)
      .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
    if (error) throw error
    res.json({ items: (data ?? []).map(projectResource) })
  } catch (error) { next(error) }
})

router.get('/projects/:projectId', async (req, res, next) => {
  try {
    const projectId = z.string().uuid().parse(req.params.projectId)
    const { data, error } = await admin.from('vh_projects').select('*').eq('id', projectId).eq('account_id', accountId(req)).single()
    if (error) throw error
    res.json(projectResource(data))
  } catch (error) { next(error) }
})

router.patch('/projects/:projectId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const projectId = z.string().uuid().parse(req.params.projectId)
    const patch = z.object({ name: z.string().optional(), icon: z.string().max(64).nullable().optional(), accent: z.string().max(64).nullable().optional(), purpose: z.string().max(2000).nullable().optional(), archived: z.boolean().optional(), expectedRevision: z.number().int().positive() }).parse(req.body)
    const nextPatch: Record<string, unknown> = { updated_at: new Date().toISOString(), revision: patch.expectedRevision + 1 }
    if (patch.name !== undefined) nextPatch.name = normalizeName(patch.name)
    if (patch.icon !== undefined) nextPatch.icon = patch.icon
    if (patch.accent !== undefined) nextPatch.accent = patch.accent
    if (patch.purpose !== undefined) nextPatch.purpose = patch.purpose?.trim() || null
    if (patch.archived !== undefined) nextPatch.archived_at = patch.archived ? new Date().toISOString() : null
    const { data, error } = await admin.from('vh_projects').update(nextPatch).eq('id', projectId).eq('account_id', id).eq('revision', patch.expectedRevision).is('trashed_at', null).select('*').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(409, 'REVISION_CONFLICT', 'Project revision changed. Reload before updating.')
    res.json(projectResource(data))
  } catch (error) { next(error) }
})

router.post('/projects/:projectId/references', async (req, res, next) => {
  try {
    const id = accountId(req)
    const projectId = z.string().uuid().parse(req.params.projectId)
    const { assetId } = z.object({ assetId: z.string().uuid() }).parse(req.body)
    const { data, error } = await admin.rpc('vh_add_project_reference', { p_account_id: id, p_project_id: projectId, p_asset_id: assetId })
    if (error) {
      const message = String(error.message)
      if (message.includes('count_exceeded')) throw new ApiError(409, 'PROJECT_REFERENCE_COUNT_EXCEEDED', 'A Project can have at most 20 References.')
      if (message.includes('bytes_exceeded')) throw new ApiError(413, 'PROJECT_REFERENCE_BYTES_EXCEEDED', 'Project References can total at most 50 MB.')
      if (message.includes('not_found')) throw new ApiError(404, 'PROJECT_REFERENCE_TARGET_NOT_FOUND', 'Project or Library asset was not found.')
      throw error
    }
    res.status(201).json({ referenceId: String(data), projectId, assetId })
  } catch (error) { next(error) }
})

router.delete('/projects/:projectId/references/:assetId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const projectId = z.string().uuid().parse(req.params.projectId)
    const assetId = z.string().uuid().parse(req.params.assetId)
    const { error } = await admin.from('vh_project_references').delete().eq('account_id', id).eq('project_id', projectId).eq('asset_id', assetId)
    if (error) throw error
    res.status(204).end()
  } catch (error) { next(error) }
})

// ---------- Library ingestion ----------
const SOURCE_KINDS = ['pdf','document','pptx','text','spreadsheet','epub','image','audio','video','web','pasted','scanned','other'] as const
export type SourceKind = typeof SOURCE_KINDS[number]
type Detected = { mime: string; kind: SourceKind; assetClass: 'file' | 'image' | 'web' | 'text'; supported: boolean }

export function detectSource(buffer: Buffer, declaredMime: string): Detected {
  const d = declaredMime.toLowerCase().split(';')[0]!.trim()
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', kind: 'pdf', assetClass: 'file', supported: true }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG') return { mime: 'image/png', kind: 'image', assetClass: 'image', supported: true }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', kind: 'image', assetClass: 'image', supported: true }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', kind: 'image', assetClass: 'image', supported: true }
  const zip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  if (zip) {
    const marker = buffer.toString('latin1')
    if (marker.includes('word/')) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document', assetClass: 'file', supported: false }
    if (marker.includes('ppt/')) return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'pptx', assetClass: 'file', supported: false }
    if (marker.includes('META-INF/container.xml')) return { mime: 'application/epub+zip', kind: 'epub', assetClass: 'file', supported: false }
    return { mime: d || 'application/zip', kind: 'other', assetClass: 'file', supported: false }
  }
  if (d.startsWith('audio/')) return { mime: d, kind: 'audio', assetClass: 'file', supported: false }
  if (d.startsWith('video/')) return { mime: d, kind: 'video', assetClass: 'file', supported: false }
  if (d === 'text/csv' || d.includes('spreadsheet') || d.includes('excel')) return { mime: d || 'text/csv', kind: 'spreadsheet', assetClass: 'file', supported: true }
  if (d.startsWith('text/') || d === 'application/json') return { mime: d || 'text/plain', kind: 'text', assetClass: 'text', supported: true }
  return { mime: d || 'application/octet-stream', kind: 'other', assetClass: 'file', supported: false }
}

function mimeCompatible(declared: string, detected: string) {
  const d = declared.toLowerCase().split(';')[0]!.trim()
  if (d === 'application/octet-stream' || d === 'binary/octet-stream') return true
  if (d === detected) return true
  if (d.startsWith('text/') && detected.startsWith('text/')) return true
  return false
}

router.post('/library/ingest/init', async (req, res, next) => {
  try {
    const input = z.object({
      fileName: z.string().trim().min(1).max(255), displayTitle: z.string().trim().min(1).max(255).optional(),
      mimeType: z.string().trim().min(1).max(255), sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
      sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(), origin: z.string().trim().min(1).max(80),
      contextKind: z.string().trim().max(80).optional(), contextId: z.string().uuid().optional(),
    }).parse(req.body)
    const id = accountId(req)
    await consumeRateLimit(`upload:${id}`, RATE_LIMIT_DEFAULTS.upload.limit, RATE_LIMIT_DEFAULTS.upload.windowSeconds)
    if (input.sha256) {
      const { data: existing, error: existingError } = await admin.from('vh_library_assets').select('id,processing_status,trashed_at').eq('account_id', id).eq('content_sha256', input.sha256).maybeSingle()
      if (existingError) throw existingError
      if (existing && !existing.trashed_at) {
        await recordAssetUsage(id, existing.id, input.origin, input.contextKind, input.contextId, { clientHashMatch: true })
        return res.json({ deduplicated: true, assetId: existing.id, processingStatus: existing.processing_status, quota: await libraryQuotaStatus(id) })
      }
    }
    const reservationId = await reserveLibraryQuota(id, input.sizeBytes)
    const objectPath = `${id}/${randomUUID()}/original`
    try {
      const { data: ticket, error: ticketError } = await admin.storage.from('vh-library').createSignedUploadUrl(objectPath)
      if (ticketError) throw ticketError
      const { data: object, error: objectError } = await admin.from('vh_storage_objects').insert({
        account_id: id, bucket: 'vh-library', object_path: objectPath, kind: 'library', mime_type: input.mimeType, size_bytes: input.sizeBytes, state: 'pending',
      }).select('id').single()
      if (objectError) throw objectError
      const { data: ingest, error: ingestError } = await admin.from('vh_ingest_sessions').insert({
        account_id: id, storage_object_id: object.id, quota_reservation_id: reservationId, original_filename: input.fileName,
        display_title: input.displayTitle ?? input.fileName, declared_mime: input.mimeType, declared_size_bytes: input.sizeBytes,
        client_sha256: input.sha256 ?? null, origin_surface: input.origin, context_kind: input.contextKind ?? null, context_id: input.contextId ?? null,
      }).select('id').single()
      if (ingestError) throw ingestError
      res.status(201).json({ ingestId: ingest.id, objectId: object.id, reservationId, path: objectPath, signedUrl: ticket.signedUrl, token: ticket.token, quota: await libraryQuotaStatus(id) })
    } catch (error) { await finalizeLibraryQuota(reservationId, false).catch(() => undefined); throw error }
  } catch (error) { next(error) }
})

router.post('/library/ingest/:ingestId/commit', async (req, res, next) => {
  try {
    const id = accountId(req)
    const ingestId = z.string().uuid().parse(req.params.ingestId)
    const { data: ingest, error } = await admin.from('vh_ingest_sessions').select('id,status').eq('id', ingestId).eq('account_id', id).single()
    if (error) throw error
    if (ingest.status === 'COMPLETED' || ingest.status === 'DEDUP_REUSED') return res.json({ ingestId, status: ingest.status })
    if (ingest.status !== 'UPLOADING') throw new ApiError(409, 'INGEST_NOT_COMMITTABLE', 'This ingest is not awaiting upload commit.')
    const { error: updateError } = await admin.from('vh_ingest_sessions').update({ status: 'VERIFY_QUEUED', updated_at: new Date().toISOString() }).eq('id', ingestId).eq('account_id', id).eq('status', 'UPLOADING')
    if (updateError) throw updateError
    const job = await enqueueJob({ accountId: id, kind: 'part2.asset.verify', payload: { ingestId }, idempotencyKey: `verify:${ingestId}`, maxAttempts: 3, provenance: { ingestId } })
    res.status(202).json({ ingestId, status: 'VERIFY_QUEUED', jobId: job.id })
  } catch (error) { next(error) }
})

async function recordAssetUsage(id: string, assetId: string, origin: string, contextKind?: string | null, contextId?: string | null, provenance: Record<string, unknown> = {}) {
  const { error } = await admin.from('vh_asset_usages').upsert({
    account_id: id, asset_id: assetId, origin_surface: origin, context_kind: contextKind ?? null, context_id: contextId ?? null, provenance,
  }, { onConflict: 'account_id,asset_id,origin_surface,context_kind,context_id', ignoreDuplicates: true })
  if (error && error.code !== '23505') throw error
  await admin.from('vh_library_assets').update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', assetId).eq('account_id', id)
}

async function failIngest(ingest: Record<string, unknown>, code: string) {
  const reservationId = String(ingest.quota_reservation_id)
  await finalizeLibraryQuota(reservationId, false).catch(() => undefined)
  await admin.from('vh_ingest_sessions').update({ status: 'FAILED', safe_failure_code: code, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', String(ingest.id))
  await admin.from('vh_storage_objects').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', String(ingest.storage_object_id))
}

async function verifyIngest(ingestId: string) {
  const { data: ingest, error } = await admin.from('vh_ingest_sessions').select('*').eq('id', ingestId).single()
  if (error) throw error
  if (ingest.status === 'COMPLETED' || ingest.status === 'DEDUP_REUSED') return { assetId: ingest.asset_id, deduplicated: ingest.status === 'DEDUP_REUSED' }
  await admin.from('vh_ingest_sessions').update({ status: 'VERIFYING', updated_at: new Date().toISOString() }).eq('id', ingestId)
  const { data: object, error: objectError } = await admin.from('vh_storage_objects').select('*').eq('id', ingest.storage_object_id).eq('account_id', ingest.account_id).single()
  if (objectError) throw objectError
  const { data: blob, error: downloadError } = await admin.storage.from(object.bucket).download(object.object_path)
  if (downloadError || !blob) { await failIngest(ingest, 'UPLOAD_NOT_FOUND'); throw downloadError ?? new Error('upload_not_found') }
  const bytes = Buffer.from(await blob.arrayBuffer())
  if (bytes.byteLength !== Number(ingest.declared_size_bytes) || bytes.byteLength !== Number(object.size_bytes)) {
    await failIngest(ingest, 'UPLOAD_SIZE_MISMATCH'); throw new Error('upload_size_mismatch')
  }
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (ingest.client_sha256 && ingest.client_sha256 !== sha) { await failIngest(ingest, 'UPLOAD_HASH_MISMATCH'); throw new Error('upload_hash_mismatch') }
  const detected = detectSource(bytes, String(ingest.declared_mime))
  if (!mimeCompatible(String(ingest.declared_mime), detected.mime)) { await failIngest(ingest, 'UPLOAD_MIME_MISMATCH'); throw new Error('upload_mime_mismatch') }
  const { data: existing, error: existingError } = await admin.from('vh_library_assets').select('id,processing_status,trashed_at').eq('account_id', ingest.account_id).eq('content_sha256', sha).maybeSingle()
  if (existingError) throw existingError
  if (existing && !existing.trashed_at) {
    await finalizeLibraryQuota(String(ingest.quota_reservation_id), false)
    await admin.storage.from(object.bucket).remove([object.object_path])
    await admin.from('vh_storage_objects').delete().eq('id', object.id).eq('account_id', ingest.account_id)
    await recordAssetUsage(ingest.account_id, existing.id, ingest.origin_surface, ingest.context_kind, ingest.context_id, { ingestId, deduplicated: true })
    await admin.from('vh_ingest_sessions').update({ status: 'DEDUP_REUSED', asset_id: existing.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ingestId)
    return { assetId: existing.id, deduplicated: true }
  }
  const status = detected.supported ? 'QUEUED' : 'UNSUPPORTED'
  const extraction = detected.supported ? 'PENDING' : 'UNSUPPORTED'
  const { data: asset, error: assetError } = await admin.from('vh_library_assets').insert({
    account_id: ingest.account_id, storage_object_id: object.id, original_filename: ingest.original_filename, display_title: ingest.display_title,
    declared_mime: ingest.declared_mime, detected_mime: detected.mime, source_kind: detected.kind, asset_class: detected.assetClass,
    original_size_bytes: bytes.byteLength, origin_surface: ingest.origin_surface, content_sha256: sha,
    processing_status: status, extraction_status: extraction, safe_failure_code: detected.supported ? null : 'SOURCE_TYPE_UNSUPPORTED',
    provenance: { ingestId, verifiedSha256: sha, detectedMime: detected.mime },
  }).select('id').single()
  if (assetError) throw assetError
  try {
    await finalizeLibraryQuota(String(ingest.quota_reservation_id), true)
  } catch (error) { await admin.from('vh_library_assets').delete().eq('id', asset.id); throw error }
  await admin.from('vh_storage_objects').update({ state: 'ready', mime_type: detected.mime, size_bytes: bytes.byteLength, updated_at: new Date().toISOString() }).eq('id', object.id).eq('account_id', ingest.account_id)
  await recordAssetUsage(ingest.account_id, asset.id, ingest.origin_surface, ingest.context_kind, ingest.context_id, { ingestId, deduplicated: false })
  await admin.from('vh_ingest_sessions').update({ status: 'COMPLETED', asset_id: asset.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ingestId)
  if (detected.supported) await enqueueJob({ accountId: ingest.account_id, kind: 'part2.source.process', payload: { assetId: asset.id }, idempotencyKey: `process:${asset.id}:1`, maxAttempts: 3, provenance: { ingestId, assetId: asset.id } })
  return { assetId: asset.id, deduplicated: false }
}

// ---------- Library query, cursor, tags, collections ----------
type CursorPayload = { v: 1; fingerprint: string; sort: string; dir: 'asc' | 'desc'; value: string | number | null; id: string; mac?: string }
function cursorMac(payload: Omit<CursorPayload, 'mac'>) { return digestSecret(JSON.stringify(payload), 'library-cursor') }
export function encodeLibraryCursor(payload: Omit<CursorPayload, 'mac'>) {
  const full: CursorPayload = { ...payload, mac: cursorMac(payload) }
  return Buffer.from(JSON.stringify(full)).toString('base64url')
}
export function decodeLibraryCursor(value: string, expectedFingerprint: string): CursorPayload {
  let parsed: CursorPayload
  try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorPayload } catch { throw new ApiError(400, 'CURSOR_INVALID', 'Library cursor is invalid.') }
  const { mac, ...unsigned } = parsed
  if (parsed.v !== 1 || !mac || !safeEqualText(mac, cursorMac(unsigned)) || parsed.fingerprint !== expectedFingerprint) throw new ApiError(400, 'CURSOR_INCOMPATIBLE', 'Library cursor does not match this query.')
  return parsed
}
function filterFingerprint(input: unknown) { return createHash('sha256').update(JSON.stringify(input)).digest('hex') }
function pgValue(value: string | number) {
  if (typeof value === 'number') return String(value)
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

router.get('/library/assets', async (req, res, next) => {
  try {
    const parsed = z.object({
      sourceKind: z.enum(SOURCE_KINDS).optional(), projectId: z.string().uuid().optional(), notebookId: z.string().uuid().optional(), tagId: z.string().uuid().optional(), collectionId: z.string().uuid().optional(),
      favorite: z.enum(['true','false']).optional(), processing: z.enum(['UPLOADED','QUEUED','PROCESSING','READY','FAILED','UNSUPPORTED']).optional(), origin: z.string().max(80).optional(),
      archived: z.enum(['true','false']).optional(), linked: z.enum(['true','false']).optional(), importedByResearch: z.enum(['true','false']).optional(), q: z.string().max(300).optional(),
      sort: z.enum(['created','updated','title','size','recent']).default('created'), dir: z.enum(['asc','desc']).default('desc'), limit: z.coerce.number().int().min(1).max(100).default(40), cursor: z.string().optional(),
    }).parse(req.query)
    const fingerprintInput = { ...parsed, cursor: undefined }
    const fingerprint = filterFingerprint(fingerprintInput)
    const sortMap = { created: 'created_at', updated: 'updated_at', title: 'display_title', size: 'original_size_bytes', recent: 'last_used_at' } as const
    const sortColumn = sortMap[parsed.sort]
    const ascending = parsed.dir === 'asc'
    const selectParts = ['id','original_filename','display_title','detected_mime','source_kind','asset_class','original_size_bytes','uploaded_at','origin_surface','processing_status','extraction_status','safe_failure_code','favorite','last_used_at','archived_at','created_at','updated_at']
    if (parsed.projectId) selectParts.push('vh_project_references!inner(project_id)')
    if (parsed.notebookId) selectParts.push('vh_notebook_sources!inner(notebook_id)')
    if (parsed.tagId) selectParts.push('vh_library_asset_tags!inner(tag_id)')
    if (parsed.collectionId) selectParts.push('vh_collection_assets!inner(collection_id)')
    let query = admin.from('vh_library_assets').select(selectParts.join(',')).eq('account_id', accountId(req)).is('trashed_at', null)
    if (parsed.sourceKind) query = query.eq('source_kind', parsed.sourceKind)
    if (parsed.projectId) query = query.eq('vh_project_references.project_id', parsed.projectId)
    if (parsed.notebookId) query = query.eq('vh_notebook_sources.notebook_id', parsed.notebookId)
    if (parsed.tagId) query = query.eq('vh_library_asset_tags.tag_id', parsed.tagId)
    if (parsed.collectionId) query = query.eq('vh_collection_assets.collection_id', parsed.collectionId)
    if (parsed.favorite) query = query.eq('favorite', parsed.favorite === 'true')
    if (parsed.processing) query = query.eq('processing_status', parsed.processing)
    if (parsed.origin) query = query.eq('origin_surface', parsed.origin)
    if (parsed.archived === 'true') query = query.not('archived_at', 'is', null)
    if (parsed.archived === 'false') query = query.is('archived_at', null)
    if (parsed.importedByResearch === 'true') query = query.eq('origin_surface', 'research')
    if (parsed.q?.trim()) query = query.textSearch('display_title', parsed.q.trim(), { type: 'websearch', config: 'simple' })
    if (parsed.linked === 'true') {
      const { data: links, error: linksError } = await admin.from('vh_asset_usages').select('asset_id').eq('account_id', accountId(req)).limit(5000)
      if (linksError) throw linksError
      const ids = [...new Set((links ?? []).map(r => r.asset_id))]
      if (!ids.length) return res.json({ items: [], nextCursor: null })
      query = query.in('id', ids)
    }
    if (parsed.cursor) {
      const cursor = decodeLibraryCursor(parsed.cursor, fingerprint)
      if (cursor.sort !== parsed.sort || cursor.dir !== parsed.dir) throw new ApiError(400, 'CURSOR_INCOMPATIBLE', 'Library cursor sort does not match.')
      if (cursor.value != null) {
        const op = ascending ? 'gt' : 'lt'
        query = query.or(`${sortColumn}.${op}.${pgValue(cursor.value)},and(${sortColumn}.eq.${pgValue(cursor.value)},id.${op}.${cursor.id})`)
      }
    }
    query = query.order(sortColumn, { ascending, nullsFirst: ascending }).order('id', { ascending }).limit(parsed.limit + 1)
    const { data, error } = await query
    if (error) throw error
    const rows = data ?? []
    const hasMore = rows.length > parsed.limit
    const items = rows.slice(0, parsed.limit)
    const last = items.at(-1) as Record<string, unknown> | undefined
    const nextCursor = hasMore && last ? encodeLibraryCursor({ v: 1, fingerprint, sort: parsed.sort, dir: parsed.dir, value: (last[sortColumn] as string | number | null) ?? null, id: String(last.id) }) : null
    res.json({ items, nextCursor })
  } catch (error) { next(error) }
})

router.get('/library/assets/:assetId/access', async (req, res, next) => {
  try {
    const id = accountId(req)
    const assetId = z.string().uuid().parse(req.params.assetId)
    const { data: asset, error } = await admin.from('vh_library_assets').select('id,storage_object_id,detected_mime,original_size_bytes,trashed_at').eq('id', assetId).eq('account_id', id).single()
    if (error) throw error
    if (asset.trashed_at || !asset.storage_object_id) throw new ApiError(409, 'ASSET_NOT_DOWNLOADABLE', 'This Library asset is not available for signed binary access.')
    const { data: object, error: objectError } = await admin.from('vh_storage_objects').select('bucket,object_path,state').eq('id', asset.storage_object_id).eq('account_id', id).single()
    if (objectError) throw objectError
    if (object.state !== 'ready') throw new ApiError(409, 'ASSET_NOT_READY', 'The asset binary is not ready.')
    const { data: signed, error: signedError } = await admin.storage.from(object.bucket).createSignedUrl(object.object_path, 60)
    if (signedError) throw signedError
    res.json({ assetId, signedUrl: signed.signedUrl, expiresIn: 60, mimeType: asset.detected_mime, sizeBytes: Number(asset.original_size_bytes) })
  } catch (error) { next(error) }
})

router.post('/library/tags', async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string() }).parse(req.body)
    const clean = normalizeName(name, 80)
    const normalized = normalizeTagName(clean)
    const { data, error } = await admin.from('vh_library_tags').insert({ account_id: accountId(req), name: clean, normalized_name: normalized }).select('*').single()
    if (error?.code === '23505') throw new ApiError(409, 'TAG_NAME_EXISTS', 'A tag with this normalized name already exists.')
    if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})
router.patch('/library/tags/:tagId', async (req, res, next) => {
  try {
    const tagId = z.string().uuid().parse(req.params.tagId)
    const { name } = z.object({ name: z.string() }).parse(req.body)
    const clean = normalizeName(name, 80)
    const { data, error } = await admin.from('vh_library_tags').update({ name: clean, normalized_name: normalizeTagName(clean), updated_at: new Date().toISOString() }).eq('id', tagId).eq('account_id', accountId(req)).select('*').single()
    if (error) throw error
    res.json(data)
  } catch (error) { next(error) }
})
router.delete('/library/tags/:tagId', async (req, res, next) => {
  try { const tagId = z.string().uuid().parse(req.params.tagId); const { error } = await admin.from('vh_library_tags').delete().eq('id', tagId).eq('account_id', accountId(req)); if (error) throw error; res.status(204).end() } catch (error) { next(error) }
})
router.put('/library/assets/:assetId/tags/:tagId', async (req, res, next) => {
  try {
    const id = accountId(req), assetId = z.string().uuid().parse(req.params.assetId), tagId = z.string().uuid().parse(req.params.tagId)
    const [{ data: asset }, { data: tag }] = await Promise.all([admin.from('vh_library_assets').select('id').eq('id', assetId).eq('account_id', id).is('trashed_at', null).maybeSingle(), admin.from('vh_library_tags').select('id').eq('id', tagId).eq('account_id', id).maybeSingle()])
    if (!asset || !tag) throw new ApiError(404, 'TAG_TARGET_NOT_FOUND', 'Asset or tag was not found.')
    const { error } = await admin.from('vh_library_asset_tags').upsert({ account_id: id, asset_id: assetId, tag_id: tagId }, { onConflict: 'asset_id,tag_id' }); if (error) throw error; res.status(204).end()
  } catch (error) { next(error) }
})
router.delete('/library/assets/:assetId/tags/:tagId', async (req, res, next) => {
  try { const { error } = await admin.from('vh_library_asset_tags').delete().eq('account_id', accountId(req)).eq('asset_id', z.string().uuid().parse(req.params.assetId)).eq('tag_id', z.string().uuid().parse(req.params.tagId)); if (error) throw error; res.status(204).end() } catch (error) { next(error) }
})

router.post('/library/collections', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string(), cover: z.string().max(255).optional(), description: z.string().max(2000).optional() }).parse(req.body)
    const { data, error } = await admin.from('vh_library_collections').insert({ account_id: accountId(req), name: normalizeName(input.name), cover: input.cover ?? null, description: input.description?.trim() || null }).select('*').single()
    if (error) throw error; res.status(201).json(data)
  } catch (error) { next(error) }
})
router.post('/library/collections/:collectionId/assets', async (req, res, next) => {
  try {
    const id = accountId(req), collectionId = z.string().uuid().parse(req.params.collectionId)
    const input = z.object({ assetId: z.string().uuid(), manualOrder: z.number().int().default(0) }).parse(req.body)
    const { error } = await admin.rpc('vh_add_collection_asset', { p_account_id: id, p_collection_id: collectionId, p_asset_id: input.assetId, p_manual_order: input.manualOrder })
    if (error && String(error.message).includes('type_not_allowed')) throw new ApiError(409, 'COLLECTION_ASSET_TYPE_NOT_ALLOWED', 'Collections can contain files and images only.')
    if (error) throw error; res.status(204).end()
  } catch (error) { next(error) }
})
router.delete('/library/collections/:collectionId/assets/:assetId', async (req, res, next) => {
  try { const { error } = await admin.from('vh_collection_assets').delete().eq('account_id', accountId(req)).eq('collection_id', z.string().uuid().parse(req.params.collectionId)).eq('asset_id', z.string().uuid().parse(req.params.assetId)); if (error) throw error; res.status(204).end() } catch (error) { next(error) }
})

// ---------- Source extraction/index ----------
export function chunkText(text: string, target = 1800, overlap = 220) {
  if (target <= overlap || overlap < 0) throw new Error('invalid_chunk_config')
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return [] as { content: string; start: number; end: number }[]
  const chunks: { content: string; start: number; end: number }[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(clean.length, start + target)
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end), clean.lastIndexOf(' ', end))
      if (boundary > start + Math.floor(target * 0.6)) end = boundary + 1
    }
    const content = clean.slice(start, end).trim()
    if (content) chunks.push({ content, start, end })
    if (end >= clean.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return chunks
}

async function replaceChunks(account: string, assetId: string, revision: number, pieces: { content: string; locator: Record<string, unknown>; start?: number; end?: number }[], extractionVersion: string) {
  const rows: Record<string, unknown>[] = []
  let index = 0
  for (const piece of pieces) {
    for (const c of chunkText(piece.content)) {
      const contentHash = createHash('sha256').update(c.content).digest('hex')
      let embedding: number[] | null = null
      try { embedding = await embedOne(c.content, 'document') } catch { embedding = null }
      rows.push({ account_id: account, asset_id: assetId, source_revision: revision, chunk_index: index++, content: c.content, locator: piece.locator, text_range: { start: (piece.start ?? 0) + c.start, end: (piece.start ?? 0) + c.end }, content_hash: contentHash, extraction_version: extractionVersion, embedding_model: embedding ? (process.env.GEMINI_EMBEDDING_MODEL ?? 'configured') : null, embedding })
    }
  }
  await admin.from('vh_source_chunks').delete().eq('account_id', account).eq('asset_id', assetId).eq('source_revision', revision)
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100); if (batch.length) { const { error } = await admin.from('vh_source_chunks').insert(batch); if (error) throw error }
  }
  return rows.length
}

async function processSource(assetId: string) {
  const { data: asset, error } = await admin.from('vh_library_assets').select('*,vh_storage_objects!inner(bucket,object_path,state)').eq('id', assetId).single()
  if (error) throw error
  if (asset.trashed_at) throw new Error('asset_trashed')
  await admin.from('vh_library_assets').update({ processing_status: 'PROCESSING', extraction_status: 'PROCESSING', updated_at: new Date().toISOString() }).eq('id', assetId)
  const storage = Array.isArray(asset.vh_storage_objects) ? asset.vh_storage_objects[0] : asset.vh_storage_objects
  if (!storage || storage.state !== 'ready') throw new Error('storage_not_ready')
  const { data: blob, error: downloadError } = await admin.storage.from(storage.bucket).download(storage.object_path)
  if (downloadError || !blob) throw downloadError ?? new Error('source_download_failed')
  const buffer = Buffer.from(await blob.arrayBuffer())
  const pieces: { content: string; locator: Record<string, unknown>; start?: number; end?: number }[] = []
  const extractionVersion = 'part2-extract-v1'
  if (asset.source_kind === 'pdf') {
    const pdf = await openPdf(buffer)
    try { for (let page = 1; page <= pdf.numPages; page++) { const text = await extractPageText(pdf, page); if (text) pieces.push({ content: text, locator: { page } }) } } finally { await pdf.destroy() }
  } else if (asset.source_kind === 'text' || asset.source_kind === 'spreadsheet') {
    pieces.push({ content: buffer.toString('utf8'), locator: { section: 'document' } })
  } else if (asset.source_kind === 'image') {
    await admin.from('vh_library_assets').update({ processing_status: 'READY', extraction_status: 'NOT_REQUIRED', safe_failure_code: null, updated_at: new Date().toISOString() }).eq('id', assetId)
    return { chunks: 0, extractionVersion, imageMetadataOnly: true }
  } else {
    await admin.from('vh_library_assets').update({ processing_status: 'UNSUPPORTED', extraction_status: 'UNSUPPORTED', safe_failure_code: 'SOURCE_TYPE_UNSUPPORTED', updated_at: new Date().toISOString() }).eq('id', assetId)
    return { chunks: 0, extractionVersion, unsupported: true }
  }
  const chunks = await replaceChunks(asset.account_id, asset.id, Number(asset.source_revision), pieces, extractionVersion)
  await admin.from('vh_library_assets').update({ processing_status: 'READY', extraction_status: 'READY', safe_failure_code: null, updated_at: new Date().toISOString() }).eq('id', assetId)
  return { chunks, extractionVersion }
}

// ---------- Notebooks and grounded retrieval ----------
router.post('/notebooks', async (req, res, next) => {
  const id = accountId(req), key = idempotencyKey(req), route = '/api/v1/notebooks'
  const body = z.object({ name: z.string(), description: z.string().max(4000).optional(), icon: z.string().max(64).optional(), accent: z.string().max(64).optional(), aiConfig: z.record(z.unknown()).optional(), projectId: z.string().uuid().optional() }).parse(req.body)
  body.name = normalizeName(body.name)
  const fingerprint = requestFingerprint('POST', route, body)
  try {
    const replay = await beginIdempotency(id, route, key, fingerprint); if (replay) return res.status(replay.status).json(replay.body)
    const { data, error } = await admin.from('vh_notebooks').insert({ account_id: id, name: body.name, description: body.description?.trim() || null, icon: body.icon ?? null, accent: body.accent ?? null, ai_config: body.aiConfig ?? {} }).select('*').single(); if (error) throw error
    if (body.projectId) await linkProjectNotebook(id, body.projectId, data.id)
    const resource = notebookResource(data); await completeIdempotency(id, route, key, 201, resource); res.status(201).json(resource)
  } catch (error) { await failIdempotency(id, route, key).catch(() => undefined); next(error) }
})

async function linkProjectNotebook(id: string, projectId: string, notebookId: string) {
  const [{ data: project, error: projectError }, { data: notebook, error: notebookError }] = await Promise.all([
    admin.from('vh_projects').select('id').eq('id', projectId).eq('account_id', id).is('trashed_at', null).maybeSingle(),
    admin.from('vh_notebooks').select('id').eq('id', notebookId).eq('account_id', id).is('trashed_at', null).maybeSingle(),
  ])
  if (projectError) throw projectError; if (notebookError) throw notebookError
  if (!project || !notebook) throw new ApiError(404, 'PROJECT_NOTEBOOK_NOT_FOUND', 'Project or Notebook was not found.')
  const { error } = await admin.from('vh_project_notebooks').upsert({ account_id: id, project_id: projectId, notebook_id: notebookId }, { onConflict: 'project_id,notebook_id', ignoreDuplicates: true }); if (error) throw error
}
router.put('/projects/:projectId/notebooks/:notebookId', async (req, res, next) => { try { await linkProjectNotebook(accountId(req), z.string().uuid().parse(req.params.projectId), z.string().uuid().parse(req.params.notebookId)); res.status(204).end() } catch (error) { next(error) } })
router.delete('/projects/:projectId/notebooks/:notebookId', async (req, res, next) => { try { const { error } = await admin.from('vh_project_notebooks').delete().eq('account_id', accountId(req)).eq('project_id', z.string().uuid().parse(req.params.projectId)).eq('notebook_id', z.string().uuid().parse(req.params.notebookId)); if (error) throw error; res.status(204).end() } catch (error) { next(error) } })

async function notebookPlan(id: string) {
  const policy = await getQuotaPolicy(id, 'notebook.plan')
  const maxSourcesRaw = policy.config.maxSourcesPerNotebook
  const maxBytesRaw = policy.config.maxSourceBytesPerNotebook
  const maxSources = typeof maxSourcesRaw === 'number' && Number.isInteger(maxSourcesRaw) ? maxSourcesRaw : null
  const maxBytes = typeof maxBytesRaw === 'number' && Number.isSafeInteger(maxBytesRaw) ? maxBytesRaw : null
  return { maxSources, maxBytes, policy }
}
router.post('/notebooks/:notebookId/sources', async (req, res, next) => {
  try {
    const id = accountId(req), notebookId = z.string().uuid().parse(req.params.notebookId)
    const input = z.object({ assetId: z.string().uuid(), addedVia: z.enum(['library','upload','research']).default('library'), discoveryProvenance: z.record(z.unknown()).optional() }).parse(req.body)
    const plan = await notebookPlan(id)
    const { data, error } = await admin.rpc('vh_add_notebook_source', { p_account_id: id, p_notebook_id: notebookId, p_asset_id: input.assetId, p_max_sources: plan.maxSources, p_max_bytes: plan.maxBytes, p_added_via: input.addedVia, p_provenance: input.discoveryProvenance ?? {} })
    if (error && String(error.message).includes('count_exceeded')) throw new ApiError(409, 'NOTEBOOK_SOURCE_COUNT_EXCEEDED', 'Notebook source count limit reached.')
    if (error && String(error.message).includes('bytes_exceeded')) throw new ApiError(413, 'NOTEBOOK_SOURCE_BYTES_EXCEEDED', 'Notebook source size limit reached.')
    if (error) throw error; res.status(201).json({ notebookSourceId: String(data), notebookId, assetId: input.assetId, quotaPolicy: plan.policy.policyKey })
  } catch (error) { next(error) }
})
router.patch('/notebooks/:notebookId/sources/:sourceId', async (req, res, next) => {
  try { const { enabled, manualOrder, groupKey } = z.object({ enabled: z.boolean().optional(), manualOrder: z.number().int().optional(), groupKey: z.string().max(120).nullable().optional() }).parse(req.body); const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }; if (enabled !== undefined) patch.enabled = enabled; if (manualOrder !== undefined) patch.manual_order = manualOrder; if (groupKey !== undefined) patch.group_key = groupKey; const { data, error } = await admin.from('vh_notebook_sources').update(patch).eq('id', z.string().uuid().parse(req.params.sourceId)).eq('notebook_id', z.string().uuid().parse(req.params.notebookId)).eq('account_id', accountId(req)).select('*').single(); if (error) throw error; res.json(data) } catch (error) { next(error) }
})
router.delete('/notebooks/:notebookId/sources/:sourceId', async (req, res, next) => { try { const { error } = await admin.from('vh_notebook_sources').delete().eq('id', z.string().uuid().parse(req.params.sourceId)).eq('notebook_id', z.string().uuid().parse(req.params.notebookId)).eq('account_id', accountId(req)); if (error) throw error; res.status(204).end() } catch (error) { next(error) } })

function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) { const av = a[i] ?? 0, bv = b[i] ?? 0; dot += av * bv; aa += av * av; bb += bv * bv }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}
export type RetrievalHit = { chunkId: string; assetId: string; content: string; locator: Record<string, unknown>; sourceRevision: number; chunkIndex: number; contentHash: string; extractionVersion: string; lexicalRank: number; semanticRank: number | null; score: number }
async function retrieveNotebook(id: string, notebookId: string, query: string, limit = 12): Promise<RetrievalHit[]> {
  const { data, error } = await admin.rpc('vh_search_notebook_chunks', { p_account_id: id, p_notebook_id: notebookId, p_query: query, p_limit: Math.min(50, Math.max(limit * 3, 20)) })
  if (error) throw error
  let queryEmbedding: number[] | null = null
  try { queryEmbedding = await embedOne(query, 'query') } catch { queryEmbedding = null }
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const assetIds = [...new Set(rows.map(r => String(r.asset_id)))]
  const embeddingByChunk = new Map<string, number[]>()
  if (queryEmbedding && assetIds.length) {
    const { data: raw } = await admin.from('vh_source_chunks').select('id,embedding').eq('account_id', id).in('asset_id', assetIds).in('id', rows.map(r => String(r.chunk_id)))
    for (const row of raw ?? []) if (Array.isArray(row.embedding)) embeddingByChunk.set(row.id, row.embedding.map(Number))
  }
  return rows.map(row => {
    const vector = embeddingByChunk.get(String(row.chunk_id)); const semantic = queryEmbedding && vector ? cosine(queryEmbedding, vector) : null; const lexical = Number(row.rank ?? 0)
    return { chunkId: String(row.chunk_id), assetId: String(row.asset_id), content: String(row.content), locator: (row.locator ?? {}) as Record<string, unknown>, sourceRevision: Number(row.source_revision), chunkIndex: Number(row.chunk_index), contentHash: String(row.content_hash), extractionVersion: String(row.extraction_version), lexicalRank: lexical, semanticRank: semantic, score: semantic == null ? lexical : lexical * 0.55 + semantic * 0.45 }
  }).sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId)).slice(0, limit)
}

router.post('/notebooks/:notebookId/query', async (req, res, next) => {
  try {
    const id = accountId(req), notebookId = z.string().uuid().parse(req.params.notebookId)
    const input = z.object({ query: z.string().trim().min(1).max(10000), sourceIds: z.array(z.string().uuid()).max(200).optional(), topK: z.number().int().min(1).max(30).default(12) }).parse(req.body)
    if (input.sourceIds?.length) {
      const { data: allowed, error } = await admin.from('vh_notebook_sources').select('asset_id').eq('account_id', id).eq('notebook_id', notebookId).eq('enabled', true).in('asset_id', input.sourceIds); if (error) throw error
      if ((allowed ?? []).length !== new Set(input.sourceIds).size) throw new ApiError(403, 'NOTEBOOK_SOURCE_SCOPE_INVALID', 'One or more requested sources are not enabled in this Notebook.')
    }
    let hits = await retrieveNotebook(id, notebookId, input.query, input.topK)
    if (input.sourceIds?.length) hits = hits.filter(h => input.sourceIds!.includes(h.assetId))
    const context = hits.map((hit, i) => `[S${i + 1}] ${hit.content}`).join('\n\n')
    const started = Date.now()
    const ai = await defaultAiRouter.generate({ taskClass: 'research', system: 'Answer only from the supplied Notebook sources. If the sources do not support the answer, say so. Cite source labels like [S1].', prompt: `Question: ${input.query}\n\nNotebook sources:\n${context}` })
    res.json({ answer: ai.text, citations: hits.map((h, i) => ({ label: `S${i + 1}`, assetId: h.assetId, chunkId: h.chunkId, locator: h.locator, sourceRevision: h.sourceRevision, contentHash: h.contentHash, extractionVersion: h.extractionVersion })), retrieval: { hitCount: hits.length, latencyMs: Date.now() - started, providerId: ai.providerId, modelId: ai.modelId } })
  } catch (error) { next(error) }
})

// ---------- Research ----------
export type ResearchCandidateInput = { url: string; title?: string; domain?: string; snippet?: string; rank?: number }
export interface ResearchSearchProvider { search(query: string, limit: number, signal: AbortSignal): Promise<ResearchCandidateInput[]> }
class HttpResearchProvider implements ResearchSearchProvider {
  async search(query: string, limit: number, signal: AbortSignal) {
    const endpoint = process.env.VH_RESEARCH_SEARCH_ENDPOINT
    if (!endpoint) throw new ApiError(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Research search provider is not configured.')
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.VH_RESEARCH_SEARCH_KEY ? { authorization: `Bearer ${process.env.VH_RESEARCH_SEARCH_KEY}` } : {}) }, body: JSON.stringify({ query, limit }), signal })
    if (!response.ok) throw new Error(`research_provider_${response.status}`)
    const json = await response.json() as { candidates?: ResearchCandidateInput[] }
    return z.array(z.object({ url: z.string().url(), title: z.string().optional(), domain: z.string().optional(), snippet: z.string().optional(), rank: z.number().optional() })).max(limit).parse(json.candidates ?? [])
  }
}
export const defaultResearchProvider: ResearchSearchProvider = new HttpResearchProvider()
function canonicalUrl(value: string) { const u = new URL(value); u.hash = ''; return u.toString() }
function candidateHash(url: string) { return createHash('sha256').update(canonicalUrl(url)).digest('hex') }

async function persistCandidates(id: string, sessionId: string, candidates: ResearchCandidateInput[]) {
  const rows = candidates.map((c, index) => { const url = canonicalUrl(c.url); return { account_id: id, research_session_id: sessionId, source_url: url, source_identity_hash: candidateHash(url), title: c.title ?? null, domain: c.domain ?? new URL(url).hostname, snippet: c.snippet ?? null, rank_score: c.rank ?? 1 / (index + 1), fetch_status: 'candidate', provenance: { provider: 'configured-search', rank: index + 1 } } })
  if (!rows.length) return []
  const { data, error } = await admin.from('vh_research_candidates').upsert(rows, { onConflict: 'research_session_id,source_identity_hash' }).select('*'); if (error) throw error; return data ?? []
}

async function runResearch(sessionId: string, deep: boolean, signal: AbortSignal) {
  const { data: session, error } = await admin.from('vh_research_sessions').select('*').eq('id', sessionId).single(); if (error) throw error
  await admin.from('vh_research_sessions').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', sessionId)
  const candidates = await defaultResearchProvider.search(session.query, deep ? 20 : 8, signal)
  const persisted = await persistCandidates(session.account_id, sessionId, candidates)
  let report: string | null = null
  if (deep) {
    const evidence = persisted.map((c, i) => `[C${i + 1}] ${c.title ?? c.source_url}\n${c.snippet ?? ''}\n${c.source_url}`).join('\n\n')
    const result = await defaultAiRouter.generate({ taskClass: 'research', system: 'Create a research report from candidate metadata only. Do not claim a candidate was verified or added to the Notebook. Cite candidate labels [C1], [C2].', prompt: `Research goal: ${session.query}\n\nCandidates:\n${evidence}`, signal })
    report = result.text
  }
  const status = persisted.length ? 'review' : 'succeeded'
  await admin.from('vh_research_sessions').update({ status, report, provenance: { candidateCount: persisted.length }, updated_at: new Date().toISOString(), ...(status === 'succeeded' ? { finished_at: new Date().toISOString() } : {}) }).eq('id', sessionId)
  return { candidateCount: persisted.length, status, report }
}

router.post('/notebooks/:notebookId/research', async (req, res, next) => {
  try {
    const id = accountId(req), notebookId = z.string().uuid().parse(req.params.notebookId)
    const input = z.object({ type: z.enum(['fast','deep']), query: z.string().trim().min(1).max(10000), goal: z.string().max(5000).optional(), title: z.string().max(200).optional() }).parse(req.body)
    const { data: notebook, error: notebookError } = await admin.from('vh_notebooks').select('id').eq('id', notebookId).eq('account_id', id).is('trashed_at', null).maybeSingle(); if (notebookError) throw notebookError; if (!notebook) throw new ApiError(404, 'NOTEBOOK_NOT_FOUND', 'Notebook was not found.')
    const { data: session, error } = await admin.from('vh_research_sessions').insert({ account_id: id, notebook_id: notebookId, kind: input.type, query: input.query, goal: input.goal ?? null, title: input.title ?? null, status: 'queued' }).select('*').single(); if (error) throw error
    const job = await enqueueJob({ accountId: id, kind: input.type === 'deep' ? 'part2.research.deep' : 'part2.research.fast', payload: { sessionId: session.id }, idempotencyKey: `research:${session.id}`, maxAttempts: input.type === 'deep' ? 5 : 3, provenance: { notebookId, researchSessionId: session.id, type: input.type } })
    await admin.from('vh_research_sessions').update({ job_id: job.id, updated_at: new Date().toISOString() }).eq('id', session.id).eq('account_id', id)
    res.status(202).json({ sessionId: session.id, jobId: job.id, status: 'queued', type: input.type })
  } catch (error) { next(error) }
})
router.get('/notebooks/:notebookId/research/:sessionId/candidates', async (req, res, next) => { try { const { data, error } = await admin.from('vh_research_candidates').select('*').eq('account_id', accountId(req)).eq('research_session_id', z.string().uuid().parse(req.params.sessionId)).order('rank_score', { ascending: false, nullsFirst: false }).limit(100); if (error) throw error; res.json({ items: data ?? [] }) } catch (error) { next(error) } })

function privateIpv4(host: string) {
  const p = host.split('.').map(Number); if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && (p[1] ?? 0) >= 16 && (p[1] ?? 0) <= 31) || (p[0] === 192 && p[1] === 168) || p[0] === 0
}
async function assertPublicUrl(value: string) {
  const url = new URL(value); if (!['http:','https:'].includes(url.protocol)) throw new ApiError(400, 'RESEARCH_URL_UNSAFE', 'Only public HTTP(S) research sources are supported.')
  const host = url.hostname.toLowerCase(); if (host === 'localhost' || host.endsWith('.localhost')) throw new ApiError(400, 'RESEARCH_URL_UNSAFE', 'Local research URLs are not allowed.')
  if (isIP(host)) {
    if (privateIpv4(host) || host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) throw new ApiError(400, 'RESEARCH_URL_UNSAFE', 'Private research addresses are not allowed.')
  } else {
    const addresses = await lookup(host, { all: true }); if (!addresses.length) throw new ApiError(400, 'RESEARCH_URL_UNRESOLVED', 'Research source hostname did not resolve.')
    for (const a of addresses) if ((a.family === 4 && privateIpv4(a.address)) || (a.family === 6 && (a.address === '::1' || a.address.startsWith('fe80:') || a.address.startsWith('fc') || a.address.startsWith('fd')))) throw new ApiError(400, 'RESEARCH_URL_UNSAFE', 'Research source resolved to a private address.')
  }
  return url
}
async function fetchPublicBytes(initial: string, maxBytes = 20 * MiB) {
  let url = await assertPublicUrl(initial)
  for (let redirect = 0; redirect <= 3; redirect++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'VeltrixHomResearch/1.0' } })
      if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw new Error('redirect_without_location'); url = await assertPublicUrl(new URL(location, url).toString()); continue }
      if (!response.ok) throw new ApiError(422, 'RESEARCH_FETCH_FAILED', 'Research source could not be fetched.')
      const contentLength = Number(response.headers.get('content-length') ?? 0); if (contentLength > maxBytes) throw new ApiError(413, 'RESEARCH_SOURCE_TOO_LARGE', 'Research source is too large to add.')
      const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.byteLength > maxBytes) throw new ApiError(413, 'RESEARCH_SOURCE_TOO_LARGE', 'Research source is too large to add.')
      return { buffer, mime: response.headers.get('content-type')?.split(';')[0] ?? 'text/html', finalUrl: url.toString() }
    } finally { clearTimeout(timer) }
  }
  throw new ApiError(422, 'RESEARCH_REDIRECT_LIMIT', 'Research source redirected too many times.')
}

async function ingestServerBytes(id: string, bytes: Buffer, fileName: string, mime: string, origin: string, provenance: Record<string, unknown>) {
  const sha = createHash('sha256').update(bytes).digest('hex')
  const { data: existing, error: existingError } = await admin.from('vh_library_assets').select('id,trashed_at').eq('account_id', id).eq('content_sha256', sha).maybeSingle(); if (existingError) throw existingError
  if (existing && !existing.trashed_at) { await recordAssetUsage(id, existing.id, origin, 'research', null, provenance); return { assetId: existing.id, deduplicated: true } }
  const reservationId = await reserveLibraryQuota(id, bytes.byteLength)
  const path = `${id}/${randomUUID()}/original`
  try {
    const detected = detectSource(bytes, mime)
    const { error: uploadError } = await admin.storage.from('vh-library').upload(path, bytes, { contentType: detected.mime, upsert: false }); if (uploadError) throw uploadError
    const { data: object, error: objectError } = await admin.from('vh_storage_objects').insert({ account_id: id, bucket: 'vh-library', object_path: path, kind: 'library', mime_type: detected.mime, size_bytes: bytes.byteLength, state: 'ready' }).select('id').single(); if (objectError) throw objectError
    const { data: asset, error: assetError } = await admin.from('vh_library_assets').insert({ account_id: id, storage_object_id: object.id, original_filename: fileName.slice(0,255), display_title: fileName.slice(0,255), declared_mime: mime, detected_mime: detected.mime, source_kind: detected.kind === 'other' && mime.includes('html') ? 'web' : detected.kind, asset_class: detected.kind === 'other' && mime.includes('html') ? 'web' : detected.assetClass, original_size_bytes: bytes.byteLength, origin_surface: origin, content_sha256: sha, processing_status: detected.supported || mime.includes('html') ? 'QUEUED' : 'UNSUPPORTED', extraction_status: detected.supported || mime.includes('html') ? 'PENDING' : 'UNSUPPORTED', provenance }).select('id').single(); if (assetError) throw assetError
    await finalizeLibraryQuota(reservationId, true)
    await recordAssetUsage(id, asset.id, origin, 'research', null, provenance)
    if (mime.includes('html')) {
      const text = bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
      await replaceChunks(id, asset.id, 1, [{ content: text, locator: { url: provenance.url } }], 'part2-web-v1')
      await admin.from('vh_library_assets').update({ processing_status: 'READY', extraction_status: 'READY', updated_at: new Date().toISOString() }).eq('id', asset.id)
    } else if (detected.supported) await enqueueJob({ accountId: id, kind: 'part2.source.process', payload: { assetId: asset.id }, idempotencyKey: `process:${asset.id}:1`, provenance })
    return { assetId: asset.id, deduplicated: false }
  } catch (error) { await finalizeLibraryQuota(reservationId, false).catch(() => undefined); await admin.storage.from('vh-library').remove([path]).catch(() => undefined); throw error }
}

router.post('/notebooks/:notebookId/research/candidates/:candidateId/add', async (req, res, next) => {
  try {
    const id = accountId(req), notebookId = z.string().uuid().parse(req.params.notebookId), candidateId = z.string().uuid().parse(req.params.candidateId)
    const { data: candidate, error } = await admin.from('vh_research_candidates').select('*,vh_research_sessions!inner(notebook_id)').eq('id', candidateId).eq('account_id', id).eq('vh_research_sessions.notebook_id', notebookId).single(); if (error) throw error
    if (candidate.accepted_asset_id) return res.json({ assetId: candidate.accepted_asset_id, alreadyAdded: true })
    const fetched = await fetchPublicBytes(candidate.source_url)
    const name = (candidate.title || new URL(fetched.finalUrl).hostname || 'Research source').slice(0,255)
    const ingested = await ingestServerBytes(id, fetched.buffer, name, fetched.mime, 'research', { researchCandidateId: candidateId, researchSessionId: candidate.research_session_id, url: fetched.finalUrl })
    const plan = await notebookPlan(id)
    const { data: sourceId, error: sourceError } = await admin.rpc('vh_add_notebook_source', { p_account_id: id, p_notebook_id: notebookId, p_asset_id: ingested.assetId, p_max_sources: plan.maxSources, p_max_bytes: plan.maxBytes, p_added_via: 'research', p_provenance: { researchCandidateId: candidateId, researchSessionId: candidate.research_session_id, url: fetched.finalUrl } }); if (sourceError) throw sourceError
    await admin.from('vh_research_candidates').update({ accepted_asset_id: ingested.assetId, fetch_status: 'verified', provenance: { ...(candidate.provenance ?? {}), acceptedAt: new Date().toISOString(), finalUrl: fetched.finalUrl } }).eq('id', candidateId).eq('account_id', id)
    res.status(201).json({ assetId: ingested.assetId, notebookSourceId: String(sourceId), deduplicated: ingested.deduplicated })
  } catch (error) { next(error) }
})

// ---------- Trash ----------
const trashKinds = { project: 'vh_projects', notebook: 'vh_notebooks', collection: 'vh_library_collections', asset: 'vh_library_assets' } as const
type TrashKind = keyof typeof trashKinds
router.post('/trash/:kind/:objectId', async (req, res, next) => {
  try {
    const kind = z.enum(['project','notebook','collection','asset']).parse(req.params.kind) as TrashKind, objectId = z.string().uuid().parse(req.params.objectId), id = accountId(req)
    const now = new Date(), purge = new Date(now.getTime() + 30 * 86400_000)
    const { data, error } = await admin.from(trashKinds[kind]).update({ trashed_at: now.toISOString(), purge_after: purge.toISOString(), updated_at: now.toISOString() }).eq('id', objectId).eq('account_id', id).is('trashed_at', null).select('id').maybeSingle(); if (error) throw error; if (!data) throw new ApiError(404, 'TRASH_OBJECT_NOT_FOUND', 'Active object was not found.')
    if (kind === 'asset') { const { data: asset } = await admin.from('vh_library_assets').select('storage_object_id').eq('id', objectId).eq('account_id', id).single(); if (asset?.storage_object_id) await admin.from('vh_storage_objects').update({ state: 'trashed', trashed_at: now.toISOString(), purge_after: purge.toISOString(), updated_at: now.toISOString() }).eq('id', asset.storage_object_id).eq('account_id', id) }
    res.json({ kind, objectId, trashedAt: now.toISOString(), purgeAfter: purge.toISOString() })
  } catch (error) { next(error) }
})
router.post('/trash/:kind/:objectId/restore', async (req, res, next) => {
  try {
    const kind = z.enum(['project','notebook','collection','asset']).parse(req.params.kind) as TrashKind, objectId = z.string().uuid().parse(req.params.objectId), id = accountId(req)
    const { data, error } = await admin.from(trashKinds[kind]).update({ trashed_at: null, purge_after: null, updated_at: new Date().toISOString() }).eq('id', objectId).eq('account_id', id).not('trashed_at', 'is', null).gt('purge_after', new Date().toISOString()).select('id').maybeSingle(); if (error) throw error; if (!data) throw new ApiError(409, 'TRASH_RESTORE_UNAVAILABLE', 'Object cannot be restored.')
    if (kind === 'asset') { const { data: asset } = await admin.from('vh_library_assets').select('storage_object_id').eq('id', objectId).eq('account_id', id).single(); if (asset?.storage_object_id) await admin.from('vh_storage_objects').update({ state: 'ready', trashed_at: null, purge_after: null, updated_at: new Date().toISOString() }).eq('id', asset.storage_object_id).eq('account_id', id).eq('state', 'trashed') }
    res.json({ kind, objectId, restored: true })
  } catch (error) { next(error) }
})

// Register durable Part 2 worker kinds exactly once on module load.
registerJobHandler('part2.asset.verify', async ({ job, checkpoint }) => { const ingestId = z.object({ ingestId: z.string().uuid() }).parse(job.payload).ingestId; await checkpoint({ ingestId, stage: 'verify' }, 0.1); const result = await verifyIngest(ingestId); await checkpoint({ ingestId, stage: 'done', ...result }, 0.95); return { result } })
registerJobHandler('part2.source.process', async ({ job, checkpoint }) => { const assetId = z.object({ assetId: z.string().uuid() }).parse(job.payload).assetId; await checkpoint({ assetId, stage: 'extract' }, 0.1); const result = await processSource(assetId); await checkpoint({ assetId, stage: 'indexed', ...result }, 0.95); return { result, resultRef: assetId } })
registerJobHandler('part2.research.fast', async ({ job, signal, checkpoint }) => { const sessionId = z.object({ sessionId: z.string().uuid() }).parse(job.payload).sessionId; await checkpoint({ sessionId, stage: 'search' }, 0.1); const result = await runResearch(sessionId, false, signal); await checkpoint({ sessionId, stage: 'review', ...result }, 0.95); return { result, resultRef: sessionId } })
registerJobHandler('part2.research.deep', async ({ job, signal, checkpoint }) => { const sessionId = z.object({ sessionId: z.string().uuid() }).parse(job.payload).sessionId; await checkpoint({ sessionId, stage: 'search' }, 0.1); const result = await runResearch(sessionId, true, signal); await checkpoint({ sessionId, stage: 'report', ...result }, 0.95); return { result, resultRef: sessionId } })

export { router as v1Part2Router }
