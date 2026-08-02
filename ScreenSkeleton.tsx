import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'

export const sourcesRouter = Router()

/** Real sources only. Nothing here is invented on the client. */
sourcesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin
      .from('sources')
      .select('*, subjects(name, slug, emoji)')
      .eq('user_id', req.userId!)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ sources: data ?? [] })
  } catch (e) { next(e) }
})

sourcesRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(160).optional(),
      subject_id: z.string().uuid().nullable().optional(),
      grade: z.number().int().min(1).max(11).nullable().optional(),
      is_active: z.boolean().optional(),
    }).parse(req.body)

    const { data, error } = await admin
      .from('sources').update(body)
      .eq('id', req.params.id).eq('user_id', req.userId!)
      .select('*').single()
    if (error) throw error
    res.json({ source: data })
  } catch (e) { next(e) }
})

sourcesRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: src } = await admin
      .from('sources').select('storage_path')
      .eq('id', req.params.id).eq('user_id', userId).single()

    if (src?.storage_path) {
      await admin.storage.from('sources').remove([src.storage_path])
    }
    // pages + chunks cascade via the schema.
    const { error } = await admin.from('sources').delete()
      .eq('id', req.params.id).eq('user_id', userId)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/** Subjects list — used by settings, projects and the source editor. */
sourcesRouter.get('/subjects', requireAuth, async (req, res, next) => {
  try {
    const { data } = await admin
      .from('subjects').select('*').eq('user_id', req.userId!).order('name')
    res.json({ subjects: data ?? [] })
  } catch (e) { next(e) }
})
