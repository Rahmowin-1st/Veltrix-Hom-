import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'

export const projectsRouter = Router()

const ProjectBody = z.object({
  name: z.string().min(1).max(80),
  emoji: z.string().max(8).optional(),
  color: z.string().max(16).optional(),
  subject_id: z.string().uuid().nullable().optional(),
  grade: z.number().int().min(1).max(11).nullable().optional(),
  instructions: z.string().max(2000).nullable().optional(),
  answer_length: z.enum(['short', 'normal', 'detailed']).optional(),
})

/** List projects with live chat and source counts. */
projectsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const [{ data: projects }, { data: chats }, { data: links }] = await Promise.all([
      admin.from('projects').select('*').eq('user_id', userId)
        .eq('archived', false).order('updated_at', { ascending: false }),
      admin.from('chats').select('project_id').eq('user_id', userId).not('project_id', 'is', null),
      admin.from('project_sources').select('project_id').eq('user_id', userId),
    ])

    const countBy = (rows: { project_id: string | null }[] | null) => {
      const m = new Map<string, number>()
      for (const r of rows ?? []) {
        if (r.project_id) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1)
      }
      return m
    }
    const chatCounts = countBy(chats)
    const srcCounts = countBy(links)

    res.json({
      projects: (projects ?? []).map((p) => ({
        ...p,
        chat_count: chatCounts.get(p.id) ?? 0,
        source_count: srcCounts.get(p.id) ?? 0,
      })),
    })
  } catch (e) { next(e) }
})

projectsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = ProjectBody.parse(req.body)
    const { data, error } = await admin
      .from('projects')
      .insert({ ...body, user_id: req.userId! })
      .select('*')
      .single()
    if (error) throw error
    res.json({ project: { ...data, chat_count: 0, source_count: 0 } })
  } catch (e) { next(e) }
})

projectsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = ProjectBody.partial().parse(req.body)
    const { data, error } = await admin
      .from('projects').update(body)
      .eq('id', req.params.id).eq('user_id', req.userId!)
      .select('*').single()
    if (error) throw error
    res.json({ project: data })
  } catch (e) { next(e) }
})

projectsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    // Chats survive: project_id is set to null by the FK's ON DELETE SET NULL.
    const { error } = await admin
      .from('projects').delete()
      .eq('id', req.params.id).eq('user_id', req.userId!)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/** Attach / detach a source to a project. */
projectsRouter.put('/:id/sources', requireAuth, async (req, res, next) => {
  try {
    const { sourceIds } = z.object({ sourceIds: z.array(z.string().uuid()) }).parse(req.body)
    const userId = req.userId!

    await admin.from('project_sources').delete()
      .eq('project_id', req.params.id).eq('user_id', userId)

    if (sourceIds.length) {
      const { error } = await admin.from('project_sources').insert(
        sourceIds.map((source_id) => ({ project_id: req.params.id, source_id, user_id: userId }))
      )
      if (error) throw error
    }
    res.json({ ok: true })
  } catch (e) { next(e) }
})

projectsRouter.get('/:id/sources', requireAuth, async (req, res, next) => {
  try {
    const { data } = await admin
      .from('project_sources')
      .select('source_id, sources(*)')
      .eq('project_id', req.params.id).eq('user_id', req.userId!)
    res.json({ sources: (data ?? []).map((r) => r.sources).filter(Boolean) })
  } catch (e) { next(e) }
})
