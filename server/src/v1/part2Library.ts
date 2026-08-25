import type { Request } from 'express'
import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { digestSecret, safeEqualText } from './crypto.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

const sourceKinds = ['pdf','document','pptx','text','spreadsheet','epub','image','audio','video','web','pasted','scanned','other'] as const
const processingStates = ['UPLOADED','QUEUED','PROCESSING','READY','FAILED','UNSUPPORTED'] as const
const sortModes = ['created','updated','title','size','recent'] as const
const directions = ['asc','desc'] as const

function csv(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))]
}
function bool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ApiError(400, 'BOOLEAN_QUERY_INVALID', 'Boolean query parameters must be true or false.')
}
function iso(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const parsed = z.string().datetime({ offset: true }).safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'DATE_QUERY_INVALID', 'Date query parameters must be ISO-8601 timestamps.')
  return parsed.data
}
function uuidList(value: unknown) {
  const values = csv(value)
  if (!values) return undefined
  return z.array(z.string().uuid()).max(50).parse(values)
}

export type LibraryCursor = {
  v: 1
  fingerprint: string
  sort: typeof sortModes[number]
  dir: typeof directions[number]
  ts: string | null
  text: string | null
  num: number | null
  id: string
  mac?: string
}
function unsignedCursor(value: LibraryCursor) {
  const { mac: _mac, ...unsigned } = value
  return unsigned
}
function cursorMac(value: Omit<LibraryCursor, 'mac'>) { return digestSecret(JSON.stringify(value), 'part2-library-query-cursor') }
export function encodeLibraryQueryCursor(value: Omit<LibraryCursor, 'mac'>) {
  return Buffer.from(JSON.stringify({ ...value, mac: cursorMac(value) })).toString('base64url')
}
export function decodeLibraryQueryCursor(encoded: string, expectedFingerprint: string): LibraryCursor {
  let parsed: LibraryCursor
  try { parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as LibraryCursor }
  catch { throw new ApiError(400, 'CURSOR_INVALID', 'Library cursor is invalid.') }
  const unsigned = unsignedCursor(parsed)
  if (parsed.v !== 1 || !parsed.mac || !safeEqualText(parsed.mac, cursorMac(unsigned)) || parsed.fingerprint !== expectedFingerprint) {
    throw new ApiError(400, 'CURSOR_INCOMPATIBLE', 'Library cursor does not match this filter/sort query.')
  }
  return parsed
}

router.get('/library/assets', async (req, res, next) => {
  try {
    const sourceTypesRaw = csv(req.query.sourceType)
    const sourceTypes = sourceTypesRaw ? z.array(z.enum(sourceKinds)).max(sourceKinds.length).parse(sourceTypesRaw) : undefined
    const processingRaw = csv(req.query.processing)
    const processing = processingRaw ? z.array(z.enum(processingStates)).max(processingStates.length).parse(processingRaw) : undefined
    const origins = csv(req.query.origin)
    if (origins && origins.some(v => v.length > 80)) throw new ApiError(400, 'ORIGIN_FILTER_INVALID', 'Origin filter is invalid.')
    const parsed = {
      sourceTypes,
      projectId: req.query.projectId ? z.string().uuid().parse(req.query.projectId) : undefined,
      notebookId: req.query.notebookId ? z.string().uuid().parse(req.query.notebookId) : undefined,
      tagIds: uuidList(req.query.tagIds ?? req.query.tagId),
      collectionId: req.query.collectionId ? z.string().uuid().parse(req.query.collectionId) : undefined,
      favorite: bool(req.query.favorite),
      processing,
      origins,
      archived: bool(req.query.archived),
      linked: bool(req.query.linked),
      importedByResearch: bool(req.query.importedByResearch),
      unsorted: bool(req.query.unsorted),
      dateAddedFrom: iso(req.query.dateAddedFrom),
      dateAddedTo: iso(req.query.dateAddedTo),
      dateModifiedFrom: iso(req.query.dateModifiedFrom),
      dateModifiedTo: iso(req.query.dateModifiedTo),
      q: typeof req.query.q === 'string' && req.query.q.trim() ? z.string().max(500).parse(req.query.q.trim()) : undefined,
      sort: z.enum(sortModes).default('created').parse(req.query.sort),
      dir: z.enum(directions).default('desc').parse(req.query.dir),
      limit: z.coerce.number().int().min(1).max(100).default(40).parse(req.query.limit),
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(parsed)).digest('hex')
    const cursor = req.query.cursor ? decodeLibraryQueryCursor(z.string().max(4096).parse(req.query.cursor), fingerprint) : undefined
    if (cursor && (cursor.sort !== parsed.sort || cursor.dir !== parsed.dir)) throw new ApiError(400, 'CURSOR_INCOMPATIBLE', 'Library cursor sort does not match this query.')

    const { data, error } = await admin.rpc('vh_query_library_assets', {
      p_account_id: accountId(req),
      p_source_kinds: parsed.sourceTypes ?? null,
      p_project_id: parsed.projectId ?? null,
      p_notebook_id: parsed.notebookId ?? null,
      p_tag_ids: parsed.tagIds ?? null,
      p_collection_id: parsed.collectionId ?? null,
      p_favorite: parsed.favorite ?? null,
      p_processing_statuses: parsed.processing ?? null,
      p_origins: parsed.origins ?? null,
      p_archived: parsed.archived ?? null,
      p_linked: parsed.linked ?? null,
      p_imported_by_research: parsed.importedByResearch ?? null,
      p_unsorted: parsed.unsorted ?? null,
      p_date_added_from: parsed.dateAddedFrom ?? null,
      p_date_added_to: parsed.dateAddedTo ?? null,
      p_date_modified_from: parsed.dateModifiedFrom ?? null,
      p_date_modified_to: parsed.dateModifiedTo ?? null,
      p_q: parsed.q ?? null,
      p_sort: parsed.sort,
      p_dir: parsed.dir,
      p_cursor_ts: cursor?.ts ?? null,
      p_cursor_text: cursor?.text ?? null,
      p_cursor_num: cursor?.num ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: parsed.limit + 1,
    })
    if (error) throw error
    const rows = (data ?? []) as Array<Record<string, unknown>>
    const hasMore = rows.length > parsed.limit
    const page = rows.slice(0, parsed.limit)
    const last = page.at(-1)
    const nextCursor = hasMore && last ? encodeLibraryQueryCursor({
      v: 1,
      fingerprint,
      sort: parsed.sort,
      dir: parsed.dir,
      ts: typeof last.sort_ts === 'string' ? last.sort_ts : null,
      text: typeof last.sort_text === 'string' ? last.sort_text : null,
      num: last.sort_num == null ? null : Number(last.sort_num),
      id: String(last.id),
    }) : null
    const items = page.map(row => {
      const { sort_ts: _ts, sort_text: _text, sort_num: _num, ...item } = row
      return item
    })
    res.json({ items, nextCursor, filterFingerprint: fingerprint })
  } catch (error) { next(error) }
})

router.get('/library/tags', async (req, res, next) => {
  try {
    const id = accountId(req)
    const { data: tags, error } = await admin.from('vh_library_tags').select('id,name,normalized_name,created_at,updated_at').eq('account_id', id).order('normalized_name').limit(1000)
    if (error) throw error
    const tagIds = (tags ?? []).map(t => t.id)
    let counts = new Map<string, number>()
    if (tagIds.length) {
      const { data: links, error: linkError } = await admin.from('vh_library_asset_tags').select('tag_id').eq('account_id', id).in('tag_id', tagIds).limit(50_000)
      if (linkError) throw linkError
      counts = (links ?? []).reduce((map, row) => map.set(row.tag_id, (map.get(row.tag_id) ?? 0) + 1), new Map<string, number>())
    }
    res.json({ items: (tags ?? []).map(tag => ({ id: tag.id, name: tag.name, normalizedName: tag.normalized_name, usageCount: counts.get(tag.id) ?? 0, createdAt: tag.created_at, updatedAt: tag.updated_at })) })
  } catch (error) { next(error) }
})

function collectionCursorPayload(row: Record<string, unknown>) {
  return { updatedAt: String(row.updated_at), id: String(row.id) }
}
function encodeCollectionCursor(value: { updatedAt: string; id: string }) {
  const mac = digestSecret(JSON.stringify(value), 'part2-collection-cursor')
  return Buffer.from(JSON.stringify({ ...value, mac })).toString('base64url')
}
function decodeCollectionCursor(value: string) {
  let parsed: { updatedAt: string; id: string; mac: string }
  try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) }
  catch { throw new ApiError(400, 'CURSOR_INVALID', 'Collection cursor is invalid.') }
  const unsigned = { updatedAt: parsed.updatedAt, id: parsed.id }
  if (!parsed.mac || !safeEqualText(parsed.mac, digestSecret(JSON.stringify(unsigned), 'part2-collection-cursor'))) throw new ApiError(400, 'CURSOR_INVALID', 'Collection cursor is invalid.')
  z.string().datetime({ offset: true }).parse(parsed.updatedAt)
  z.string().uuid().parse(parsed.id)
  return unsigned
}

router.get('/library/collections', async (req, res, next) => {
  try {
    const id = accountId(req)
    const limit = z.coerce.number().int().min(1).max(100).default(40).parse(req.query.limit)
    const archived = bool(req.query.archived)
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? z.string().max(300).parse(req.query.q.trim()) : undefined
    const cursor = req.query.cursor ? decodeCollectionCursor(z.string().max(2048).parse(req.query.cursor)) : undefined
    let query = admin.from('vh_library_collections').select('*').eq('account_id', id).is('trashed_at', null)
    if (archived === true) query = query.not('archived_at', 'is', null)
    if (archived === false) query = query.is('archived_at', null)
    if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '\\$&')}%`)
    if (cursor) query = query.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`)
    const { data, error } = await query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1)
    if (error) throw error
    const rows = data ?? []
    const page = rows.slice(0, limit)
    const ids = page.map(r => r.id)
    const countMap = new Map<string, number>()
    if (ids.length) {
      const { data: links, error: linkError } = await admin.from('vh_collection_assets').select('collection_id').eq('account_id', id).in('collection_id', ids).limit(50_000)
      if (linkError) throw linkError
      for (const row of links ?? []) countMap.set(row.collection_id, (countMap.get(row.collection_id) ?? 0) + 1)
    }
    res.json({ items: page.map(row => ({ ...row, assetCount: countMap.get(row.id) ?? 0 })), nextCursor: rows.length > limit && page.length ? encodeCollectionCursor(collectionCursorPayload(page.at(-1)!)) : null })
  } catch (error) { next(error) }
})

router.get('/library/collections/:collectionId', async (req, res, next) => {
  try {
    const id = accountId(req), collectionId = z.string().uuid().parse(req.params.collectionId)
    const { data, error } = await admin.from('vh_library_collections').select('*').eq('id', collectionId).eq('account_id', id).single()
    if (error) throw error
    const { count, error: countError } = await admin.from('vh_collection_assets').select('*', { count: 'exact', head: true }).eq('account_id', id).eq('collection_id', collectionId)
    if (countError) throw countError
    res.json({ ...data, assetCount: count ?? 0 })
  } catch (error) { next(error) }
})

router.patch('/library/collections/:collectionId', async (req, res, next) => {
  try {
    const id = accountId(req), collectionId = z.string().uuid().parse(req.params.collectionId)
    const input = z.object({ name: z.string().optional(), cover: z.string().max(255).nullable().optional(), description: z.string().max(2000).nullable().optional(), archived: z.boolean().optional(), expectedRevision: z.number().int().positive() }).parse(req.body)
    const patch: Record<string, unknown> = { revision: input.expectedRevision + 1, updated_at: new Date().toISOString() }
    if (input.name !== undefined) {
      const name = input.name.trim().replace(/\s+/g, ' ')
      if (!name || name.length > 160) throw new ApiError(400, 'COLLECTION_NAME_INVALID', 'Collection name is invalid.')
      patch.name = name
    }
    if (input.cover !== undefined) patch.cover = input.cover
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.archived !== undefined) patch.archived_at = input.archived ? new Date().toISOString() : null
    const { data, error } = await admin.from('vh_library_collections').update(patch).eq('id', collectionId).eq('account_id', id).eq('revision', input.expectedRevision).is('trashed_at', null).select('*').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(409, 'REVISION_CONFLICT', 'Collection revision changed. Reload before updating.')
    res.json(data)
  } catch (error) { next(error) }
})

router.delete('/library/collections/:collectionId', async (req, res, next) => {
  try {
    const id = accountId(req), collectionId = z.string().uuid().parse(req.params.collectionId), now = new Date(), purge = new Date(Date.now() + 30 * 86400_000)
    const { data, error } = await admin.from('vh_library_collections').update({ trashed_at: now.toISOString(), purge_after: purge.toISOString(), updated_at: now.toISOString() }).eq('id', collectionId).eq('account_id', id).is('trashed_at', null).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'COLLECTION_NOT_FOUND', 'Active Collection was not found.')
    res.json({ collectionId, trashedAt: now.toISOString(), purgeAfter: purge.toISOString() })
  } catch (error) { next(error) }
})

async function assetUsage(id: string, assetId: string) {
  const [{ data: projects, error: projectError }, { data: notebooks, error: notebookError }, { data: collections, error: collectionError }, { data: usages, error: usageError }] = await Promise.all([
    admin.from('vh_project_references').select('project_id').eq('account_id', id).eq('asset_id', assetId).limit(1000),
    admin.from('vh_notebook_sources').select('notebook_id').eq('account_id', id).eq('asset_id', assetId).limit(1000),
    admin.from('vh_collection_assets').select('collection_id').eq('account_id', id).eq('asset_id', assetId).limit(1000),
    admin.from('vh_asset_usages').select('origin_surface,context_kind,context_id,created_at').eq('account_id', id).eq('asset_id', assetId).limit(1000),
  ])
  if (projectError) throw projectError; if (notebookError) throw notebookError; if (collectionError) throw collectionError; if (usageError) throw usageError
  const projectIds = [...new Set((projects ?? []).map(r => r.project_id))]
  const notebookIds = [...new Set((notebooks ?? []).map(r => r.notebook_id))]
  const collectionIds = [...new Set((collections ?? []).map(r => r.collection_id))]
  const [{ data: projectRows }, { data: notebookRows }, { data: collectionRows }] = await Promise.all([
    projectIds.length ? admin.from('vh_projects').select('id,name').eq('account_id', id).in('id', projectIds) : Promise.resolve({ data: [] }),
    notebookIds.length ? admin.from('vh_notebooks').select('id,name').eq('account_id', id).in('id', notebookIds) : Promise.resolve({ data: [] }),
    collectionIds.length ? admin.from('vh_library_collections').select('id,name').eq('account_id', id).in('id', collectionIds) : Promise.resolve({ data: [] }),
  ])
  return { projects: projectRows ?? [], notebooks: notebookRows ?? [], collections: collectionRows ?? [], usages: usages ?? [], totalLinks: projectIds.length + notebookIds.length + collectionIds.length + (usages ?? []).filter(u => u.context_id).length }
}

router.get('/library/assets/:assetId/usage', async (req, res, next) => {
  try {
    const id = accountId(req), assetId = z.string().uuid().parse(req.params.assetId)
    const { data: asset, error } = await admin.from('vh_library_assets').select('id,display_title,trashed_at').eq('id', assetId).eq('account_id', id).maybeSingle()
    if (error) throw error
    if (!asset) throw new ApiError(404, 'LIBRARY_ASSET_NOT_FOUND', 'Library asset was not found.')
    res.json({ asset, usage: await assetUsage(id, assetId) })
  } catch (error) { next(error) }
})

router.delete('/library/assets/:assetId', async (req, res, next) => {
  try {
    const id = accountId(req), assetId = z.string().uuid().parse(req.params.assetId)
    const confirm = bool(req.query.confirm) ?? false
    const { data: asset, error } = await admin.from('vh_library_assets').select('id,storage_object_id,trashed_at').eq('id', assetId).eq('account_id', id).maybeSingle()
    if (error) throw error
    if (!asset || asset.trashed_at) throw new ApiError(404, 'LIBRARY_ASSET_NOT_FOUND', 'Active Library asset was not found.')
    const usage = await assetUsage(id, assetId)
    if (usage.totalLinks > 0 && !confirm) throw new ApiError(409, 'ASSET_IN_USE_CONFIRMATION_REQUIRED', 'This asset is used elsewhere. Confirm before moving it to Trash.', usage)
    const now = new Date(), purge = new Date(Date.now() + 30 * 86400_000)
    const { error: updateError } = await admin.from('vh_library_assets').update({ trashed_at: now.toISOString(), purge_after: purge.toISOString(), updated_at: now.toISOString() }).eq('id', assetId).eq('account_id', id).is('trashed_at', null)
    if (updateError) throw updateError
    if (asset.storage_object_id) {
      const { error: storageError } = await admin.from('vh_storage_objects').update({ state: 'trashed', trashed_at: now.toISOString(), purge_after: purge.toISOString(), updated_at: now.toISOString() }).eq('id', asset.storage_object_id).eq('account_id', id)
      if (storageError) throw storageError
    }
    res.json({ assetId, trashedAt: now.toISOString(), purgeAfter: purge.toISOString(), preservedLinks: usage.totalLinks })
  } catch (error) { next(error) }
})

export { router as v1Part2LibraryRouter }
