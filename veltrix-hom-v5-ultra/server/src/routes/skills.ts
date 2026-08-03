import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'

export const skillsRouter = Router()

const SkillBody = z.object({
  name: z.string().trim().min(1).max(60),
  emoji: z.string().max(8).optional(),
  color: z.string().max(16).optional(),
  description: z.string().max(300).nullable().optional(),
  instructions: z.string().max(2000).nullable().optional(),
  scope: z.enum(['global', 'project', 'subject']).optional(),
  project_id: z.string().uuid().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
})

skillsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin
      .from('skills')
      .select('*, projects(name), subjects(name)')
      .eq('user_id', req.userId!)
      .order('updated_at', { ascending: false })
    if (error) throw error
    res.json({ skills: data ?? [] })
  } catch (e) { next(e) }
})

skillsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = SkillBody.parse(req.body)
    const { data, error } = await admin
      .from('skills').insert({ ...body, user_id: req.userId! })
      .select('*').single()
    if (error) throw error
    res.json({ skill: data })
  } catch (e) { next(e) }
})

skillsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = SkillBody.partial().parse(req.body)
    const { data, error } = await admin
      .from('skills').update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.userId!)
      .select('*').single()
    if (error) throw error
    res.json({ skill: data })
  } catch (e) { next(e) }
})

/** Duplicate keeps the instructions but makes the copy obvious. */
skillsRouter.post('/:id/duplicate', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: src, error: readErr } = await admin
      .from('skills').select('*').eq('id', req.params.id).eq('user_id', userId).single()
    if (readErr) throw readErr

    const { id, created_at, updated_at, use_count, ...rest } = src
    const { data, error } = await admin
      .from('skills')
      .insert({ ...rest, name: `${src.name} (nusxa)`, is_default: false })
      .select('*').single()
    if (error) throw error
    res.json({ skill: data })
  } catch (e) { next(e) }
})

skillsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { error } = await admin
      .from('skills').delete().eq('id', req.params.id).eq('user_id', req.userId!)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})
