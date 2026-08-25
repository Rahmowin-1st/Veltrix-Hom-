import type { Request } from 'express'
import { randomInt, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)

const AVATARS = ['crocodile','wolf','fox','elephant','shark','tiger','lion'] as const
const CLASSES = ['1','2','3','4','5','6','7','8','9','10','11','University','Other'] as const

type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

async function currentRevision(id: string) {
  const { data, error } = await admin.from('vh_profiles').select('identity_revision').eq('account_id', id).single()
  if (error) throw error
  return Number(data.identity_revision ?? 1)
}

router.get('/avatars', (_req, res) => {
  res.json({ avatars: AVATARS.map(id => ({ id, headwear: 'default', background: 'default' })) })
})

router.get('/me', async (req, res, next) => {
  try {
    const id = accountId(req)
    const [{ data: account, error: accountError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from('vh_accounts').select('id,email,status,created_at').eq('id', id).single(),
      admin.from('vh_profiles').select('*').eq('account_id', id).single(),
    ])
    if (accountError) throw accountError
    if (profileError) throw profileError
    res.json({ account, profile, onboardingRequired: profile.onboarding_state !== 'COMPLETED' })
  } catch (error) { next(error) }
})

router.put('/onboarding', async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120),
      classLevel: z.enum(CLASSES).nullable().optional(),
      avatarId: z.enum(AVATARS).optional(),
      skipAvatar: z.boolean().optional().default(false),
      useCurrentPhoto: z.boolean().optional().default(false),
    }).refine(v => Number(Boolean(v.avatarId)) + Number(v.skipAvatar) + Number(v.useCurrentPhoto) === 1, {
      message: 'Choose one identity option: avatar, skip, or current photo.',
    }).parse(req.body)
    const id = accountId(req)
    const { data: existing, error: existingError } = await admin.from('vh_profiles')
      .select('identity_type,photo_object_id,identity_revision').eq('account_id', id).single()
    if (existingError) throw existingError
    if (parsed.useCurrentPhoto && (existing.identity_type !== 'CUSTOM_PHOTO' || !existing.photo_object_id)) {
      throw new ApiError(409, 'PHOTO_NOT_READY', 'Upload and commit a custom photo before selecting it for onboarding.')
    }
    const chosen = parsed.avatarId ?? (parsed.skipAvatar ? AVATARS[randomInt(AVATARS.length)] : null)
    const timestamp = new Date().toISOString()
    const patch: Record<string, unknown> = {
      display_name: parsed.name,
      class_level: parsed.classLevel ?? null,
      class_step_skipped: parsed.classLevel == null,
      avatar_step_skipped: parsed.skipAvatar,
      onboarding_state: 'COMPLETED',
      onboarding_completed_at: timestamp,
      language: 'en',
      identity_revision: Number(existing.identity_revision ?? 1) + 1,
      updated_at: timestamp,
    }
    if (chosen) {
      Object.assign(patch, {
        identity_type: 'VELTRIX_AVATAR', avatar_id: chosen, photo_object_id: null,
        crop_center_x: null, crop_center_y: null, crop_scale: null, crop_rotation_degrees: null,
      })
    }
    const { data, error } = await admin.from('vh_profiles').update(patch).eq('account_id', id).select('*').single()
    if (error) throw error
    res.json({ profile: data })
  } catch (error) { next(error) }
})

router.patch('/me', async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      classLevel: z.enum(CLASSES).nullable().optional(),
      avatarId: z.enum(AVATARS).optional(),
      headwear: z.string().trim().min(1).max(64).optional(),
      background: z.string().trim().min(1).max(64).optional(),
    }).strict().parse(req.body)
    const id = accountId(req)
    const identityRevision = (await currentRevision(id)) + 1
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      language: 'en',
      identity_revision: identityRevision,
    }
    if (parsed.name !== undefined) patch.display_name = parsed.name
    if (parsed.classLevel !== undefined) {
      patch.class_level = parsed.classLevel
      patch.class_step_skipped = parsed.classLevel == null
    }
    if (parsed.avatarId !== undefined) {
      Object.assign(patch, {
        identity_type: 'VELTRIX_AVATAR', avatar_id: parsed.avatarId, photo_object_id: null,
        crop_center_x: null, crop_center_y: null, crop_scale: null, crop_rotation_degrees: null,
      })
    }
    if (parsed.headwear !== undefined) patch.avatar_headwear = parsed.headwear
    if (parsed.background !== undefined) patch.avatar_background = parsed.background
    const { data, error } = await admin.from('vh_profiles').update(patch).eq('account_id', id).select('*').single()
    if (error) throw error
    res.json({ profile: data })
  } catch (error) { next(error) }
})

router.post('/photo/upload-ticket', async (req, res, next) => {
  try {
    const { mimeType, sizeBytes } = z.object({
      mimeType: z.enum(['image/jpeg','image/png','image/webp']),
      sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
    }).parse(req.body)
    const id = accountId(req)
    const objectPath = `${id}/${randomUUID()}/original`
    const { data: ticket, error: ticketError } = await admin.storage.from('vh-profile').createSignedUploadUrl(objectPath)
    if (ticketError) throw ticketError
    const { data: record, error: recordError } = await admin.from('vh_storage_objects').insert({
      account_id: id, bucket: 'vh-profile', object_path: objectPath, kind: 'profile_photo',
      mime_type: mimeType, size_bytes: sizeBytes, state: 'pending',
    }).select('id').single()
    if (recordError) throw recordError
    res.status(201).json({ objectId: record.id, path: objectPath, signedUrl: ticket.signedUrl, token: ticket.token })
  } catch (error) { next(error) }
})

router.post('/photo/commit', async (req, res, next) => {
  try {
    const parsed = z.object({
      objectId: z.string().uuid(),
      crop: z.object({
        centerX: z.number().min(0).max(1),
        centerY: z.number().min(0).max(1),
        scale: z.number().positive().max(20),
        rotationDegrees: z.number().min(-360).max(360).optional().default(0),
      }),
    }).parse(req.body)
    const id = accountId(req)
    const { data: object, error: objectError } = await admin.from('vh_storage_objects')
      .select('id,bucket,object_path,state').eq('id', parsed.objectId).eq('account_id', id)
      .eq('kind', 'profile_photo').single()
    if (objectError) throw objectError
    if (object.state !== 'pending' && object.state !== 'ready') throw new ApiError(409, 'PHOTO_STATE_INVALID', 'The photo is not available.')
    const prefix = object.object_path.substring(0, object.object_path.lastIndexOf('/'))
    const { data: listed, error: listError } = await admin.storage.from(object.bucket).list(prefix, { search: 'original', limit: 10 })
    if (listError) throw listError
    if (!listed?.some(item => item.name === 'original')) throw new ApiError(409, 'UPLOAD_NOT_FOUND', 'The original uploaded photo was not found.')
    const timestamp = new Date().toISOString()
    const { error: readyError } = await admin.from('vh_storage_objects')
      .update({ state: 'ready', updated_at: timestamp }).eq('id', object.id).eq('account_id', id)
    if (readyError) throw readyError
    const identityRevision = (await currentRevision(id)) + 1
    const { data: profile, error: profileError } = await admin.from('vh_profiles').update({
      identity_type: 'CUSTOM_PHOTO', photo_object_id: object.id, avatar_id: null,
      crop_center_x: parsed.crop.centerX, crop_center_y: parsed.crop.centerY,
      crop_scale: parsed.crop.scale, crop_rotation_degrees: parsed.crop.rotationDegrees,
      onboarding_state: 'PROFILE_STARTED',
      identity_revision: identityRevision,
      updated_at: timestamp,
    }).eq('account_id', id).select('*').single()
    if (profileError) throw profileError
    res.json({ profile })
  } catch (error) { next(error) }
})

export { router as v1ProfileRouter, AVATARS }
