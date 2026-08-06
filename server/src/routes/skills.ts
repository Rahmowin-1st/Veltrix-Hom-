import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { MODELS } from '../config.js'
import { generate } from '../services/gemini.js'
import { admin } from '../services/supabase.js'

export const skillsRouter = Router()

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Rang #RRGGBB formatida bo‘lishi kerak.')
const IconUrl = z.string().max(1_500_000).refine(
  (value) => /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value) || /^https:\/\//i.test(value),
  'Talent rasmi xavfsiz image data URL yoki HTTPS manzil bo‘lishi kerak.'
)

const TalentBody = z.object({
  name: z.string().trim().min(1).max(60),
  emoji: z.string().max(8).optional(),
  color: HexColor.optional(),
  background_color: HexColor.nullable().optional(),
  icon_url: IconUrl.nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  instructions: z.string().max(5000).nullable().optional(),
  subject_slug: z.string().max(80).nullable().optional(),
  scope: z.enum(['global', 'project', 'subject']).optional(),
  project_id: z.string().uuid().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
})

skillsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin.from('skills').select('*, projects(name), subjects(name)').eq('user_id', req.userId!).order('is_default', { ascending: false }).order('updated_at', { ascending: false })
    if (error) throw error
    res.json({ skills: data ?? [] })
  } catch (e) { next(e) }
})

/** Converts a human description into a precise domain-locked Talent instruction. */
skillsRouter.post('/refine', requireAuth, async (req, res, next) => {
  try {
    const body = z.object({ description: z.string().trim().min(8).max(800), subject_slug: z.string().max(80).nullable().optional() }).parse(req.body)
    const raw = await generate({
      userId: req.userId!, model: MODELS.router,
      system: `Sen Veltrix Hom Talent kompilyatorisan. Foydalanuvchi tavsifini qisqa, qat'iy va amaliy system instructionga aylantir. Talent faqat ko'rsatilgan fan/mavzu doirasida fikrlasin; barcha matn, rasm, audio, fayl va manbani shu doirada talqin qilsin; faktni uydirmasin; mavzu tashqarisida aniq ogohlantirsin. Faqat tayyor instruction matnini qaytar.`,
      prompt: `Fan: ${body.subject_slug ?? 'umumiy'}\nTavsif: ${body.description}`,
    })
    res.json({ instructions: raw.trim().slice(0, 5000) })
  } catch (e) { next(e) }
})

skillsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = TalentBody.parse(req.body)
    const { data, error } = await admin.from('skills').insert({
      ...body,
      user_id: req.userId!,
      refined_at: body.instructions?.trim() ? new Date().toISOString() : null,
    }).select('*').single()
    if (error) throw error
    res.json({ skill: data })
  } catch (e) { next(e) }
})

skillsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = TalentBody.partial().parse(req.body)
    const { data, error } = await admin.from('skills').update({
      ...body,
      updated_at: new Date().toISOString(),
      ...(body.instructions !== undefined ? { refined_at: body.instructions?.trim() ? new Date().toISOString() : null } : {}),
    }).eq('id', req.params.id).eq('user_id', req.userId!).select('*').single()
    if (error) throw error
    res.json({ skill: data })
  } catch (e) { next(e) }
})

skillsRouter.post('/:id/duplicate', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: src, error: readErr } = await admin.from('skills').select('*').eq('id', req.params.id).eq('user_id', userId).single()
    if (readErr) throw readErr
    const { id, created_at, updated_at, use_count, ...rest } = src
    const duplicateName = `${String(src.name).slice(0, 49).trimEnd()} (nusxa)`
    const { data, error } = await admin.from('skills').insert({ ...rest, name: duplicateName, is_default: false }).select('*').single()
    if (error) throw error
    res.json({ skill: data })
  } catch (e) { next(e) }
})

skillsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: talent } = await admin.from('skills').select('is_default').eq('id', req.params.id).eq('user_id', req.userId!).maybeSingle()
    if (talent?.is_default) return res.status(409).json({ message: 'Default Talentni o‘chirib bo‘lmaydi; nusxasini tahrirlang.' })
    const { error } = await admin.from('skills').delete().eq('id', req.params.id).eq('user_id', req.userId!)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})
