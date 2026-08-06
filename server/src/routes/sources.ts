import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { enqueueJob, startWorkerLoop, buildPageSegments } from '../services/jobWorker.js'

export const sourcesRouter = Router()

/** Honest, user-facing capability summary derived from what the worker has
 *  actually recorded — never an optimistic guess. */
function deriveCapabilities(row: Record<string, unknown>, job: { status: string; checkpoint_page: number | null } | undefined) {
  const pageCount = (row.page_count as number | null) ?? null
  const indexed = (row.indexed_pages as number | null) ?? 0
  const ocrDone = (row.ocr_pages_done as number | null) ?? 0
  const ocrTotal = (row.ocr_pages_total as number | null) ?? 0
  return {
    exactPage: Boolean(row.capability_exact_page),
    fullSearch: Boolean(row.capability_full_search),
    printedMap: Boolean(row.capability_printed_map),
    semantic: Boolean(row.capability_semantic),
    indexedPages: indexed,
    totalPages: pageCount,
    // A scanned book is only "fully searchable" once OCR has actually run on
    // its pages. We report the real coverage instead of implying completeness.
    ocrDone, ocrTotal,
    ocrCoverage: ocrTotal > 0 ? Math.round((ocrDone / ocrTotal) * 100) : null,
    printedMapConfidence: (row.printed_map_confidence as number | null) ?? null,
    processingStage: (row.processing_stage as string | null) ?? null,
    job: job ? { status: job.status, checkpointPage: job.checkpoint_page } : null,
    pausedForQuota: job?.status === 'paused_quota',
  }
}

sourcesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data, error } = await admin.from('sources').select('*, subjects(name, slug, emoji)').eq('user_id', userId).order('last_used_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    if (error) throw error
    const rows = data ?? []

    // One batched lookup of the newest active job per source, so the client
    // can show "paused (quota)", "processing page N", etc. without N+1 calls.
    const ids = rows.map((r) => r.id)
    const jobBySource = new Map<string, { status: string; checkpoint_page: number | null }>()
    if (ids.length) {
      const { data: jobs } = await admin.from('processing_jobs')
        .select('source_id,status,checkpoint_page,updated_at')
        .eq('user_id', userId).in('source_id', ids)
        .order('updated_at', { ascending: false })
      for (const j of jobs ?? []) {
        if (!jobBySource.has(j.source_id)) jobBySource.set(j.source_id, { status: j.status, checkpoint_page: j.checkpoint_page })
      }
    }

    const sources = rows.map((row) => ({ ...row, capabilities: deriveCapabilities(row, jobBySource.get(row.id)) }))
    res.json({ sources })
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

// Reprocess through the DURABLE queue — never fire-and-forget. V8 called
// `void processPdf(...)`, which the free-tier service could kill mid-run,
// leaving a source stuck in "extracting" forever.  (V9 §23)
sourcesRouter.post('/:id/reprocess', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: source, error } = await admin.from('sources').select('id,storage_path').eq('id', req.params.id).eq('user_id', userId).single()
    if (error || !source?.storage_path) return res.status(404).json({ message: 'Saqlangan PDF topilmadi.' })
    await admin.from('sources').update({ status: 'extracting', progress: 5, error_message: null, processing_warning: null, indexed_pages: 0 }).eq('id', source.id).eq('user_id', userId)
    await enqueueJob(userId, source.id, 'extract', 60)
    startWorkerLoop()
    res.json({ ok: true, status: 'extracting' })
  } catch (e) { next(e) }
})

// Manually resume a job that paused itself when the Gemini quota ran out.
sourcesRouter.post('/:id/resume', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data, error } = await admin.rpc('resume_processing_job', { p_user_id: userId, p_source_id: req.params.id })
    if (error) throw error
    if (!data) return res.status(404).json({ message: 'Qayta boshlash uchun to‘xtatilgan ish topilmadi.' })
    startWorkerLoop()
    res.json({ ok: true, status: 'queued' })
  } catch (e) { next(e) }
})

// Cancel an in-flight or queued job. The worker checks the cancel flag at its
// next checkpoint and stops cleanly, leaving already-indexed pages intact.
sourcesRouter.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data, error } = await admin.rpc('cancel_processing_job', { p_user_id: userId, p_source_id: req.params.id })
    if (error) throw error
    if (!data) return res.status(404).json({ message: 'Bekor qilish uchun faol ish topilmadi.' })
    res.json({ ok: true, status: 'cancelled' })
  } catch (e) { next(e) }
})

/**
 * User correction of a printed-page anchor (spec §9).
 *
 * Automatic label detection is good but not perfect: a book with an unusual
 * footer, a scanned page with a smudged number, or a section reset can all
 * mislead it. When the user tells us "this PDF page is really printed page N",
 * that is the highest-trust signal we will ever get, so it is stored as a
 * `verified_by = 'user'` anchor that outranks every inferred mapping, and the
 * derived segments are rebuilt around it.
 */
sourcesRouter.post('/:id/page-anchor', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const sourceId = req.params.id ?? ''
    const body = z.object({
      pdfPage: z.coerce.number().int().min(1).max(20000),
      printedPage: z.coerce.number().int().min(1).max(20000),
    }).parse(req.body)

    const { data, error } = await admin.rpc('set_printed_page_anchor', {
      p_user_id: userId,
      p_source_id: sourceId,
      p_pdf_page: body.pdfPage,
      p_printed: body.printedPage,
    })
    if (error) throw error
    if (data !== true) return res.status(404).json({ message: 'Manba topilmadi.' })

    // A confirmed anchor changes the offset for its whole region, so the
    // segments derived from anchors are recomputed rather than left stale.
    await buildPageSegments(sourceId)
    res.json({ ok: true, pdfPage: body.pdfPage, printedPage: body.printedPage })
  } catch (e) { next(e) }
})

/**
 * Clears source reservations whose bytes never arrived (the user closed the
 * app mid-upload). Without this they linger as "uploading" forever and their
 * checksum blocks a legitimate re-upload of the same file.
 */
sourcesRouter.post('/cleanup-uploads', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin.rpc('cleanup_abandoned_uploads', {
      p_user_id: req.userId!,
      p_older_than_minutes: 120,
    })
    if (error) throw error
    res.json({ ok: true, removed: typeof data === 'number' ? data : 0 })
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
