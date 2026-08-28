import type { Request } from 'express'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { permanentlyDeleteStorageObject, restoreStorageObject } from './lifecycle.js'
import { finalizeLibraryQuota, libraryQuotaStatus, reserveLibraryQuota } from './quota.js'
import { consumeRateLimit, RATE_LIMIT_DEFAULTS } from './rateLimit.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

router.get('/library/quota', async (req, res, next) => {
  try { res.json(await libraryQuotaStatus(accountId(req))) } catch (error) { next(error) }
})

router.post('/library/upload-ticket', async (req, res, next) => {
  try {
    const parsed = z.object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1).max(255),
      sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
    }).parse(req.body)
    const id = accountId(req)
    await consumeRateLimit(`upload:${id}`, RATE_LIMIT_DEFAULTS.upload.limit, RATE_LIMIT_DEFAULTS.upload.windowSeconds)
    const reservationId = await reserveLibraryQuota(id, parsed.sizeBytes)
    const path = `${id}/${randomUUID()}/original`
    try {
      const { data: ticket, error: ticketError } = await admin.storage.from('vh-library').createSignedUploadUrl(path)
      if (ticketError) throw ticketError
      const { data: object, error: objectError } = await admin.from('vh_storage_objects').insert({
        account_id: id, bucket: 'vh-library', object_path: path, kind: 'library',
        mime_type: parsed.mimeType, size_bytes: parsed.sizeBytes, state: 'pending',
      }).select('id').single()
      if (objectError) throw objectError
      res.status(201).json({ objectId: object.id, reservationId, path, signedUrl: ticket.signedUrl, token: ticket.token })
    } catch (error) {
      await finalizeLibraryQuota(reservationId, false).catch(() => undefined)
      throw error
    }
  } catch (error) { next(error) }
})

router.post('/library/upload-commit', async (req, res, next) => {
  try {
    const parsed = z.object({ objectId: z.string().uuid(), reservationId: z.string().uuid() }).parse(req.body)
    const id = accountId(req)
    const { data: object, error: objectError } = await admin.from('vh_storage_objects')
      .select('id,bucket,object_path,size_bytes,state').eq('id', parsed.objectId).eq('account_id', id).eq('kind', 'library').single()
    if (objectError) throw objectError
    if (object.state !== 'pending') throw new ApiError(409, 'UPLOAD_NOT_PENDING', 'The upload is not pending.')
    const { data: reservation, error: reservationError } = await admin.from('vh_quota_reservations')
      .select('id,account_id,scope,bytes,status,expires_at').eq('id', parsed.reservationId).eq('account_id', id).eq('scope', 'library').single()
    if (reservationError) throw reservationError
    if (reservation.status !== 'pending' || Date.parse(reservation.expires_at) <= Date.now()) {
      throw new ApiError(409, 'RESERVATION_EXPIRED', 'The storage reservation expired.')
    }
    if (Number(reservation.bytes) !== Number(object.size_bytes)) {
      throw new ApiError(409, 'RESERVATION_MISMATCH', 'The storage reservation does not match the upload.')
    }
    const prefix = object.object_path.substring(0, object.object_path.lastIndexOf('/'))
    const { data: listed, error: listError } = await admin.storage.from(object.bucket).list(prefix, { search: 'original', limit: 10 })
    if (listError) throw listError
    const uploaded = listed?.find(item => item.name === 'original')
    if (!uploaded) throw new ApiError(409, 'UPLOAD_NOT_FOUND', 'The uploaded object was not found.')
    const actualSize = Number((uploaded.metadata as Record<string, unknown> | null)?.size ?? object.size_bytes)
    if (actualSize !== Number(object.size_bytes)) {
      await finalizeLibraryQuota(parsed.reservationId, false)
      await admin.from('vh_storage_objects').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', object.id).eq('account_id', id)
      throw new ApiError(409, 'UPLOAD_SIZE_MISMATCH', 'Uploaded size differs from the reserved size.')
    }
    await finalizeLibraryQuota(parsed.reservationId, true)
    const { error: readyError } = await admin.from('vh_storage_objects')
      .update({ state: 'ready', updated_at: new Date().toISOString() }).eq('id', object.id).eq('account_id', id)
    if (readyError) throw readyError
    res.json({ objectId: object.id, state: 'ready', quota: await libraryQuotaStatus(id) })
  } catch (error) { next(error) }
})

router.get('/library/:objectId/access', async (req, res, next) => {
  try {
    const id = accountId(req)
    const objectId = z.string().uuid().parse(req.params.objectId)
    const { data: object, error } = await admin.from('vh_storage_objects')
      .select('id,bucket,object_path,state,mime_type,size_bytes').eq('id', objectId).eq('account_id', id).eq('kind', 'library').single()
    if (error) throw error
    if (object.state !== 'ready') throw new ApiError(409, 'OBJECT_NOT_ACTIVE', 'The object is not currently active.')
    const { data: signed, error: signedError } = await admin.storage.from(object.bucket).createSignedUrl(object.object_path, 60)
    if (signedError) throw signedError
    res.json({ objectId, signedUrl: signed.signedUrl, expiresIn: 60, mimeType: object.mime_type, sizeBytes: Number(object.size_bytes) })
  } catch (error) { next(error) }
})

router.delete('/library/:objectId', async (req, res, next) => {
  try {
    const objectId = z.string().uuid().parse(req.params.objectId)
    const id = accountId(req)
    const now = new Date()
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const { data, error } = await admin.from('vh_storage_objects').update({
      state: 'trashed', trashed_at: now.toISOString(), purge_after: purgeAfter.toISOString(), updated_at: now.toISOString(),
    }).eq('id', objectId).eq('account_id', id).eq('kind', 'library').eq('state', 'ready').select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'OBJECT_NOT_FOUND', 'The active object was not found.')
    res.json({ objectId, trashedAt: now.toISOString(), purgeAfter: purgeAfter.toISOString() })
  } catch (error) { next(error) }
})

router.post('/library/:objectId/restore', async (req, res, next) => {
  try {
    const objectId = z.string().uuid().parse(req.params.objectId)
    res.json(await restoreStorageObject(accountId(req), objectId))
  } catch (error) { next(error) }
})

router.delete('/library/:objectId/permanent', async (req, res, next) => {
  try {
    const objectId = z.string().uuid().parse(req.params.objectId)
    res.json(await permanentlyDeleteStorageObject(accountId(req), objectId, true))
  } catch (error) { next(error) }
})

export { router as v1StorageRouter }
