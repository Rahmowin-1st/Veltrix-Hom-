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

const part2Kinds = ['project', 'notebook', 'collection', 'asset'] as const
const part4Kinds = ['conversation', 'note', 'todo', 'goal', 'studio_artifact'] as const
const allKinds = [...part2Kinds, ...part4Kinds] as const
export type TrashKind = typeof allKinds[number]
type TrashListRow = Record<string, unknown> & { trashed_at?: string | null }
type TrashListItem = TrashListRow & { kind: TrashKind }

const tables: Record<TrashKind, string> = {
  project: 'vh_projects',
  notebook: 'vh_notebooks',
  collection: 'vh_library_collections',
  asset: 'vh_library_assets',
  conversation: 'vh_conversations',
  note: 'vh_notes',
  todo: 'vh_todos',
  goal: 'vh_goals',
  studio_artifact: 'vh_studio_artifacts',
}

const selects: Record<TrashKind, string> = {
  project: 'id,name,icon,accent,purpose,trashed_at,purge_after,updated_at',
  notebook: 'id,name,icon,accent,description,trashed_at,purge_after,updated_at',
  collection: 'id,name,description,trashed_at,purge_after,updated_at',
  asset: 'id,display_title,source_kind,detected_mime,original_size_bytes,processing_status,trashed_at,purge_after,updated_at',
  conversation: 'id,title,trashed_at,purge_after,updated_at',
  note: 'id,title,trashed_at,purge_after,updated_at',
  todo: 'id,title,status,trashed_at,purge_after,updated_at',
  goal: 'id,title,state,progress_basis_points,trashed_at,purge_after,updated_at',
  studio_artifact: 'id,title,artifact_type,current_version,trashed_at,purge_after,updated_at',
}

async function listKind(account: string, kind: TrashKind, limit: number): Promise<TrashListItem[]> {
  const { data, error } = await admin.from(tables[kind]).select(selects[kind])
    .eq('account_id', account).not('trashed_at', 'is', null)
    .order('trashed_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (error) throw error
  const rows = (data ?? []) as unknown as TrashListRow[]
  return rows.map(row => ({ ...row, kind }))
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

function isPart2Kind(kind: TrashKind): kind is typeof part2Kinds[number] {
  return (part2Kinds as readonly string[]).includes(kind)
}

export async function permanentlyDeleteTrashObject(account: string, kind: TrashKind, objectId: string) {
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

  const rpc = isPart2Kind(kind) ? 'vh_delete_part2_metadata' : 'vh_delete_part4_trash_metadata'
  const rpcKind = kind === 'asset' ? 'asset' : kind
  const { data, error } = await admin.rpc(rpc, {
    p_account_id: account,
    p_kind: rpcKind,
    p_object_id: objectId,
  })
  if (error) throw error
  if (!data) throw new ApiError(409, 'PERMANENT_DELETE_CONFLICT', 'Object was no longer available for permanent deletion.')
  if (kind === 'asset') await reconcileLibraryUsage(account)
  return { kind, objectId, deleted: true, storageObjectId: storageRef?.id ?? null }
}

// Backward-compatible export used by existing callers/tests.
export async function permanentlyDeletePart2Object(account: string, kind: typeof part2Kinds[number], objectId: string) {
  return permanentlyDeleteTrashObject(account, kind, objectId)
}

async function setPart4TrashState(account: string, kind: typeof part4Kinds[number], objectId: string, trashed: boolean) {
  const { data, error } = await admin.rpc('vh_set_trash_state', {
    p_account_id: account,
    p_kind: kind,
    p_object_id: objectId,
    p_trashed: trashed,
  })
  if (error) throw error
  if (!data) {
    throw new ApiError(trashed ? 404 : 409, trashed ? 'TRASH_OBJECT_NOT_FOUND' : 'TRASH_RESTORE_UNAVAILABLE', trashed ? 'Active object was not found.' : 'Object cannot be restored.')
  }
  const { data: row, error: rowError } = await admin.from(tables[kind]).select('trashed_at,purge_after')
    .eq('account_id', account).eq('id', objectId).maybeSingle()
  if (rowError) throw rowError
  return { kind, objectId, trashed, trashedAt: row?.trashed_at ?? null, purgeAfter: row?.purge_after ?? null }
}

router.get('/trash', async (req, res, next) => {
  try {
    const id = accountId(req)
    const parsed = z.object({ kind: z.enum(allKinds).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query)
    if (parsed.kind) return res.json({ items: await listKind(id, parsed.kind, parsed.limit) })
    const groups = await Promise.all(allKinds.map(kind => listKind(id, kind, parsed.limit)))
    const items = groups.flat().sort((a, b) => String(b.trashed_at).localeCompare(String(a.trashed_at))).slice(0, parsed.limit)
    res.json({ items })
  } catch (error) { next(error) }
})

// Exact Part4-native routes mount before the older generic Part2 routes. This preserves old
// Project/Notebook/Collection/Asset storage semantics while extending the unified Trash surface.
for (const kind of part4Kinds) {
  router.post(`/trash/${kind}/:objectId`, async (req, res, next) => {
    try {
      const objectId = z.string().uuid().parse(req.params.objectId)
      res.json(await setPart4TrashState(accountId(req), kind, objectId, true))
    } catch (error) { next(error) }
  })
  router.post(`/trash/${kind}/:objectId/restore`, async (req, res, next) => {
    try {
      const objectId = z.string().uuid().parse(req.params.objectId)
      res.json(await setPart4TrashState(accountId(req), kind, objectId, false))
    } catch (error) { next(error) }
  })
}

router.delete('/trash/:kind/:objectId/permanent', async (req, res, next) => {
  try {
    const kind = z.enum(allKinds).parse(req.params.kind)
    const objectId = z.string().uuid().parse(req.params.objectId)
    res.json(await permanentlyDeleteTrashObject(accountId(req), kind, objectId))
  } catch (error) { next(error) }
})

export async function purgeExpiredPart2Trash(limitPerKind = 50) {
  const limit = Math.min(Math.max(limitPerKind, 1), 200)
  const now = new Date().toISOString()
  const expired: Array<{ accountId: string; kind: TrashKind; objectId: string }> = []
  for (const kind of allKinds) {
    const { data, error } = await admin.from(tables[kind]).select('id,account_id')
      .not('trashed_at', 'is', null).lt('purge_after', now).order('purge_after', { ascending: true }).limit(limit)
    if (error) throw error
    for (const row of data ?? []) expired.push({ accountId: String(row.account_id), kind, objectId: String(row.id) })
  }
  let purged = 0
  let failed = 0
  for (const row of expired) {
    try {
      await permanentlyDeleteTrashObject(row.accountId, row.kind, row.objectId)
      purged++
    } catch (error) {
      failed++
      console.error('[vh-trash-purge]', { kind: row.kind, objectId: row.objectId, errorClass: error instanceof Error ? error.name : 'UnknownError' })
    }
  }
  return { scanned: expired.length, purged, failed }
}

export { router as v1Part2TrashRouter }
