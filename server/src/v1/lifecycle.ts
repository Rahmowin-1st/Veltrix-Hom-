import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'
import { reconcileLibraryUsage, releaseExpiredReservations } from './quota.js'

export async function restoreStorageObject(accountId: string, objectId: string) {
  const { data: object, error } = await admin.from('vh_storage_objects')
    .select('id,kind,state,purge_after').eq('id', objectId).eq('account_id', accountId).single()
  if (error) throw error
  if (object.state !== 'trashed') throw new ApiError(409, 'OBJECT_NOT_TRASHED', 'The object is not in Trash.')
  if (object.purge_after && Date.parse(object.purge_after) <= Date.now()) {
    throw new ApiError(409, 'TRASH_RETENTION_EXPIRED', 'The Trash retention period has expired.')
  }
  const { data, error: updateError } = await admin.from('vh_storage_objects').update({
    state: 'ready', trashed_at: null, purge_after: null, updated_at: new Date().toISOString(),
  }).eq('id', objectId).eq('account_id', accountId).eq('state', 'trashed').select('id,state').single()
  if (updateError) throw updateError
  return data
}

export async function permanentlyDeleteStorageObject(accountId: string, objectId: string, allowBeforeRetention = false) {
  const { data: object, error } = await admin.from('vh_storage_objects')
    .select('id,account_id,bucket,object_path,kind,state,purge_after').eq('id', objectId).eq('account_id', accountId).single()
  if (error) throw error
  if (object.state !== 'trashed') throw new ApiError(409, 'PERMANENT_DELETE_REQUIRES_TRASH', 'Move the object to Trash before permanent deletion.')
  if (!allowBeforeRetention && object.purge_after && Date.parse(object.purge_after) > Date.now()) {
    throw new ApiError(409, 'TRASH_RETENTION_ACTIVE', 'The object is still inside its recovery period.')
  }
  const { error: storageError } = await admin.storage.from(object.bucket).remove([object.object_path])
  if (storageError) throw storageError
  const { error: deleteError } = await admin.from('vh_storage_objects').delete().eq('id', object.id).eq('account_id', accountId)
  if (deleteError) throw deleteError
  if (object.kind === 'library') await reconcileLibraryUsage(accountId)
  return { deleted: true, objectId }
}

export async function purgeExpiredTrash(limit = 200) {
  const { data: rows, error } = await admin.from('vh_storage_objects')
    .select('id,account_id').eq('state', 'trashed').lt('purge_after', new Date().toISOString()).limit(limit)
  if (error) throw error
  let purged = 0
  for (const row of rows ?? []) {
    try {
      await permanentlyDeleteStorageObject(row.account_id, row.id, true)
      purged++
    } catch (error) {
      console.error('[vh-v1-purge]', { objectId: row.id, errorClass: error instanceof Error ? error.name : 'UnknownError' })
    }
  }
  return purged
}

export async function cleanupOrphanUploads(olderThanMinutes = 60, limit = 200) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
  const { data: rows, error } = await admin.from('vh_storage_objects')
    .select('id,account_id,bucket,object_path,kind,state').in('state', ['pending','failed']).lt('created_at', cutoff).limit(limit)
  if (error) throw error
  let removed = 0
  const affectedLibraryAccounts = new Set<string>()
  for (const row of rows ?? []) {
    const { error: storageError } = await admin.storage.from(row.bucket).remove([row.object_path])
    if (storageError) continue
    const { error: deleteError } = await admin.from('vh_storage_objects').delete().eq('id', row.id)
    if (!deleteError) {
      removed++
      if (row.kind === 'library') affectedLibraryAccounts.add(row.account_id)
    }
  }
  await releaseExpiredReservations()
  for (const id of affectedLibraryAccounts) await reconcileLibraryUsage(id)
  return removed
}
