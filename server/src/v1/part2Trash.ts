import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { reconcileLibraryUsage } from './quota.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

const kinds = ['project', 'notebook', 'collection', 'asset'] as const
type Part2TrashKind = typeof kinds[number]
const tables: Record<Part2TrashKind, string> = {
  project: 'vh_projects',
  notebook: 'vh_notebooks',
  collection: 'vh_library_collections',
  asset: 'vh_library_assets',
}

async function listKind(account: string, kind: Part2TrashKind, limit: number) {
  const table = tables[kind]
  const select = kind === 'project'
    ? 'id,name,icon,accent,purpose,trashed_at,purge_after,updated_at'
    : kind === 'notebook'
      ? 'id,name,icon,accent,description,trashed_at,purge_after,updated_at'
      : kind === 'collection'
        ? 'id,name,description,trashed_at,purge_after,updated_at'
        : 'id,display_title,source_kind,detected_mime,original_size_bytes,processing_status,trashed_at,purge_after,updated_at'
  const { data, error } = await admin.from(table).select(select)
    .eq('account_id', account).not('trashed_at', 'is', null)
    .order('trashed_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map(row => ({ kind, ...(row as Record<string, unknown>) }))
}

async function assetStorageRef(account: string, assetId: string) {
  const { data: asset, error } = await admin.from('vh_library_assets').select('id,storage_object_id,trashed_at,purge_after')
    .eq('id', assetId).eq('account_id', account).not('trashed_at', 'is', null).maybeSingle()
  if (error) throw error
  if (!asset) throw new ApiError(404, 'TRASH_OBJECT_NOT_FOUND', 'Trashed asset was not found.')
  if (!asset.storage_object_id) return null
  const { data: object, error: objectError } = await admin.from('vh_storage_objects').select('id,bucket,object_path,state')
    .eq('id', asset.storage_object_id).eq('account_id', account).maybeSingle()
  if (objectError) throw objectError
  return object
}

export async function permanentlyDeletePart2Object(account: string, kind: Part2TrashKind, objectId: string) {
  let storageRef: { id: string; bucket: string; object_path: string; state: string } | null = null
  if (kind === 'asset') {
    storageRef = await assetStorageRef(account, objectId)
    if (storageRef) {
      if (storageRef.state !== 'trashed') throw new ApiError(409, 'STORAGE_NOT_TRASHED', 'Asset storage is not in Trash state.')
      const { error: storageError } = await admin.storage.from(storageRef.bucket).remove([storageRef.object_path])
      if (storageError) throw storageError
    }
  } else {
    const { data, error } = await admin.from(tables[kind]).select('id').eq('id', objectId).eq('account_id', account).not('trashed_at', 'is', null).maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'TRASH_OBJECT_NOT_FOUND', 'Trashed object was not found.')
  }

  const { data, error } = await admin.rpc('vh_delete_part2_metadata', {
    p_account_id: account,
    p_kind: kind,
    p_object_id: objectId,
  })
  if (error) throw error
  if (!data) throw new ApiError(409, 'PERMANENT_DELETE_CONFLICT', 'Object was no longer available for permanent deletion.')
  if (kind === 'asset') await reconcileLibraryUsage(account)
  return { kind, objectId, deleted: true, storageObjectId: storageRef?.id ?? null }
}

export async function purgeExpiredPart2Trash(limitPerKind = 50) {
  const limit = Math.min(Math.max(limitPerKind, 1), 200)
  const now = new Date().toISOString()
  const expired: Array<{ accountId: string; kind: Part2TrashKind; objectId: string }> = []
  for (const kind of kinds) {
    const { data, error } = await admin.from(tables[kind]).select('id,account_id')
      .not('trashed_at', 'is', null).lt('purge_after', now).order('purge_after', { ascending: true }).limit(limit)
    if (error) throw error
    for (const row of data ?? []) expired.push({ accountId: String(row.account_id), kind, objectId: String(row.id) })
  }
  let purged = 0
  let failed = 0
  for (const row of expired) {
    try {
      await permanentlyDeletePart2Object(row.accountId, row.kind, row.objectId)
      purged++
    } catch (error) {
      failed++
      console.error('[vh-part2-trash-purge]', { kind: row.kind, objectId: row.objectId, errorClass: error instanceof Error ? error.name : 'UnknownError' })
    }
  }
  return { scanned: expired.length, purged, failed }
}

router.get('/trash', async (req, res, next) => {
  try {
    const id = accountId(req)
    const parsed = z.object({ kind: z.enum(kinds).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query)
    if (parsed.kind) return res.json({ items: await listKind(id, parsed.kind, parsed.limit) })
    const groups = await Promise.all(kinds.map(kind => listKind(id, kind, parsed.limit)))
    const items = groups.flat().sort((a, b) => String(b.trashed_at).localeCompare(String(a.trashed_at))).slice(0, parsed.limit)
    res.json({ items })
  } catch (error) { next(error) }
})

router.delete('/trash/:kind/:objectId/permanent', async (req, res, next) => {
  try {
    const kind = z.enum(kinds).parse(req.params.kind)
    const objectId = z.string().uuid().parse(req.params.objectId)
    res.json(await permanentlyDeletePart2Object(accountId(req), kind, objectId))
  } catch (error) { next(error) }
})

export { router as v1Part2TrashRouter }
