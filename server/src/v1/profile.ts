import type { Request } from 'express'
import { Router } from 'express'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)

const AVATARS = ['crocodile','wolf','fox','elephant','shark','tiger','lion'] as const
const CLASSES = ['1','2','3','4','5','6','7','8','9','10','11','University','Other'] as const

function accountId(req: Request) { return (req as Request & { accountId?: string }).accountId! }

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
    res.json({ account, profile, onboardingRequired: !profile.onboarding_completed_at })
  } catch (error) { next(error) }
})

router.put('/onboarding', async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120),
      classLevel: z.enum(CLASSES).nullable().optional(),
      avatarId: z.enum(AVATARS).optional(),
      skipAvatar: z.boolean().optional().default(false),
    }).refine(v => !(v.avatarId && v.skipAvatar), { message: 'Choose an avatar or skip, not both.' }).parse(req.body)
    const chosen = parsed.avatarId ?? (parsed.skipAvatar ? AVATARS[randomInt(AVATARS.length)] : null)
    if (!chosen) throw new ApiError(400, 'AVATAR_REQUIRED', 'Choose a Veltrix avatar or skip to receive a random avatar.')
    const { data, error } = await admin.from('vh_profiles').update({
      display_name: parsed.name,
      class_level: parsed.classLevel ?? null,
      identity_type: 'VELTRIX_AVATAR',
      avatar_id: chosen,
      photo_object_id: null,
      crop_center_x: null,
      crop_center_y: null,
      crop_scale: null,
      onboarding_completed_at: new Date().toISOString(),
      language: 'en',
      updated_at: new Date().toISOString(),
    }).eq('account_id', accountId(req)).select('*').single()
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
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), language: 'en' }
    if (parsed.name !== undefined) patch.display_name = parsed.name
    if (parsed.classLevel !== undefined) patch.class_level = parsed.classLevel
    if (parsed.avatarId !== undefined) {
      patch.identity_type = 'VELTRIX_AVATAR'; patch.avatar_id = parsed.avatarId; patch.photo_object_id = null; patch.crop_center_x = null; patch.crop_center_y = null; patch.crop_scale = null
    }
    if (parsed.headwear !== undefined) patch.avatar_headwear = parsed.headwear
    if (parsed.background !== undefined) patch.avatar_background = parsed.background
    const { data, error } = await admin.from('vh_profiles').update(patch).eq('account_id', accountId(req)).select('*').single()
    if (error) throw error
    res.json({ profile: data })
  } catch (error) { next(error) }
})

router.post('/photo/upload-ticket', async (req, res, next) => {
  try {
    const { mimeType, sizeBytes } = z.object({ mimeType: z.enum(['image/jpeg','image/png','image/webp']), sizeBytes: z.number().int().positive().max(20 * 1024 * 1024) }).parse(req.body)
    const id = accountId(req)
    const objectPath = `${id}/${crypto.randomUUID()}/original`
    const { data: ticket, error: ticketError } = await admin.storage.from('vh-profile').createSignedUploadUrl(objectPath)
    if (ticketError) throw ticketError
    const { data: record, error: recordError } = await admin.from('vh_storage_objects').insert({ account_id: id, bucket: 'vh-profile', object_path: objectPath, kind: 'profile_photo', mime_type: mimeType, size_bytes: sizeBytes, state: 'pending' }).select('id').single()
    if (recordError) throw recordError
    res.status(201).json({ objectId: record.id, path: objectPath, signedUrl: ticket.signedUrl, token: ticket.token })
  } catch (error) { next(error) }
})

router.post('/photo/commit', async (req, res, next) => {
  try {
    const parsed = z.object({ objectId: z.string().uuid(), crop: z.object({ centerX: z.number().min(0).max(1), centerY: z.number().min(0).max(1), scale: z.number().positive().max(20) }) }).parse(req.body)
    const id = accountId(req)
    const { data: object, error: objectError } = await admin.from('vh_storage_objects').select('id,bucket,object_path,state').eq('id', parsed.objectId).eq('account_id', id).eq('kind', 'profile_photo').single()
    if (objectError) throw objectError
    const { data: listed, error: listError } = await admin.storage.from(object.bucket).list(object.object_path.substring(0, object.object_path.lastIndexOf('/')), { search: 'original', limit: 10 })
    if (listError) throw listError
    if (!listed?.some(item => item.name === 'original')) throw new ApiError(409, 'UPLOAD_NOT_FOUND', 'The original uploaded photo was not found.')
    const timestamp = new Date().toISOString()
    const { error: readyError } = await admin.from('vh_storage_objects').update({ state: 'ready', updated_at: timestamp }).eq('id', object.id).eq('account_id', id)
    if (readyError) throw readyError
    const { data: profile, error: profileError } = await admin.from('vh_profiles').update({ identity_type: 'CUSTOM_PHOTO', photo_object_id: object.id, avatar_id: null, crop_center_x: parsed.crop.centerX, crop_center_y: parsed.crop.centerY, crop_scale: parsed.crop.scale, updated_at: timestamp }).eq('account_id', id).select('*').single()
    if (profileError) throw profileError
    res.json({ profile })
  } catch (error) { next(error) }
})

export { router as v1ProfileRouter, AVATARS }
