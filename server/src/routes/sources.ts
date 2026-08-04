import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { processPdf } from './upload.js'

export const sourcesRouter = Router()

sourcesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin.from('sources').select('*, subjects(name, slug, emoji)').eq('user_id', req.userId!).order('last_used_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    if (error) throw error
    res.json({ sources: data ?? [] })
  } catch (e) { next(e) }
})

sourcesRouter.get('/subjects', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin.from('subjects').select('*').or(`user_id.eq.${req.userId!},is_system.eq.true`).order('name')
    if (error) throw error
    res.json({ subjects: data ?? [] })
  } catch (e) { next(e) }
})

sourcesRouter.get('/:id/pages/:page', requireAuth, async (req, res, next) => {
  try {
    const page = z.coerce.number().int().min(1).parse(req.params.page)
    const { data: source } = await admin.from('sources').select('id,title,page_count').eq('id', req.params.id).eq('user_id', req.userId!).maybeSingle()
    if (!source) return res.status(404).json({ message: 'Manba topilmadi.' })
    const { data, error } = await admin.from('source_pages').select('page_number,text_content').eq('source_id', source.id).gte('page_number', Math.max(1, page - 2)).lte('page_number', page + 1).order('page_number')
    if (error) throw error
    res.json({ source, requestedPage: page, pages: data ?? [] })
  } catch (e) { next(e) }
})

sourcesRouter.post('/:id/reprocess', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: source, error } = await admin.from('sources').select('id,storage_path').eq('id', req.params.id).eq('user_id', userId).single()
    if (error || !source?.storage_path) return res.status(404).json({ message: 'Saqlangan PDF topilmadi.' })
    const { data: file, error: downloadError } = await admin.storage.from('sources').download(source.storage_path)
    if (downloadError || !file) throw downloadError ?? new Error('PDF yuklanmadi')
    const buffer = Buffer.from(await file.arrayBuffer())
    await admin.from('sources').update({ status: 'extracting', progress: 5, error_message: null, processing_warning: null }).eq('id', source.id).eq('user_id', userId)
    res.json({ ok: true, status: 'extracting' })
    void processPdf(source.id, userId, buffer).catch(async (e) => {
      await admin.from('sources').update({ status: 'failed', progress: 0, error_message: e instanceof Error ? e.message : 'Qayta ishlashda xato.' }).eq('id', source.id).eq('user_id', userId)
    })
  } catch (e) { next(e) }
})

sourcesRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().trim().min(1).max(15).optional(),
      subject_id: z.string().uuid().nullable().optional(),
      grade: z.number().int().min(1).max(11).nullable().optional(),
      is_active: z.boolean().optional(),
      emoji: z.string().max(8).optional(),
      color: z.string().max(16).optional(),
    }).parse(req.body)
    const { data, error } = await admin.from('sources').update(body).eq('id', req.params.id).eq('user_id', req.userId!).select('*').single()
    if (error) throw error
    res.json({ source: data })
  } catch (e) { next(e) }
})

sourcesRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: src } = await admin.from('sources').select('storage_path').eq('id', req.params.id).eq('user_id', userId).single()
    if (src?.storage_path) await admin.storage.from('sources').remove([src.storage_path])
    const { error } = await admin.from('sources').delete().eq('id', req.params.id).eq('user_id', userId)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})
