import { createHash, randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { admin } from './supabase.js'
import { runOcrPass } from './ocr.js'
import { saveTocEntries, parseTocPage, looksLikeToc, type TocCandidate } from './tocRouter.js'
import { embedOne } from './gemini.js'
import { MODELS } from '../config.js'
import { openPdf, extractPageText, type PdfHandle } from './pdfText.js'

/**
 * Durable, resumable PDF processing.  (V9)
 *
 * V8 claimed a job, processed a fixed 12-page slice, then RELEASED the
 * lease — so a long book was downloaded and fully re-parsed once per 12
 * pages. This version runs a bounded *session*: it claims a job, opens the
 * PDF ONCE, and processes as many pages as fit inside a measured time
 * budget, renewing the lease and checkpointing as it goes. A crash resumes
 * from the last durable checkpoint via page-addressable `getPage(n)` — not
 * from page one, and not by re-parsing the whole document every batch.
 *
 * Guarantees:
 *   · one PDF open per session (not per 12 pages);
 *   · lease renewed before/after expensive work; writes stop the instant
 *     ownership is lost or cancellation is requested;
 *   · page rows and chunks are idempotent, so a resumed page is a no-op,
 *     never a duplicate;
 *   · quota exhaustion pauses and preserves every processed page, then
 *     resumes automatically once the backoff elapses.
 */

const LEASE_SECONDS = 120
/** Renew the lease well before it expires. */
const HEARTBEAT_MS = 30_000
/** Default page rows persisted between checkpoints (also a heartbeat). */
const CHECKPOINT_EVERY = 8
/** A table of contents lives in the front matter; never scan a whole book for it. */
const TOC_SCAN_PAGES = 25
/** Below this many characters a page has no usable text layer. */
const TEXT_PAGE_MIN_CHARS = 40
/** Indexing batch: pages embedded before yielding. */
const INDEX_PAGE_BATCH = 6
const CHUNK_SIZE = 900
const CHUNK_OVERLAP = 150
const CHUNKER_VERSION = 'v9-900-150'

const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`

export type JobType = 'extract' | 'index' | 'ocr'

interface Job {
  id: string
  user_id: string
  source_id: string
  job_type: string
  status: string
  checkpoint_page: number
  total_pages: number | null
  attempt_count: number
  lease_token: string
  time_budget_ms: number | null
  cancel_requested_at: string | null
}

/** Queues work for a source. The unique partial index makes this safe to
 *  call twice — a duplicate simply loses the race and is ignored. */
export async function enqueueJob(
  userId: string, sourceId: string, jobType: JobType, priority = 100
): Promise<void> {
  const { error } = await admin.from('processing_jobs').insert({
    user_id: userId, source_id: sourceId, job_type: jobType,
    priority, status: 'queued', stage: jobType, extractor_version: 'pdfjs-1',
  })
  if (error && error.code !== '23505') throw error // 23505 = active job exists
}

/* ------------------------------------------------------------------ */
/* Lease heartbeat controller                                          */
/* ------------------------------------------------------------------ */

/**
 * Keeps a job's lease alive on a timer and exposes `.lost` so the work
 * loop can bail the moment ownership is gone (a newer worker took over) or
 * the user requested cancellation. This is what lets a page loop run for
 * seconds without the lease silently expiring underneath it.
 */
class Lease {
  lost = false
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly job: Job) {}

  start(): void {
    this.timer = setInterval(() => { void this.beat() }, HEARTBEAT_MS)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  private async beat(): Promise<void> {
    try {
      const { data } = await admin.rpc('extend_processing_job_lease', {
        p_job_id: this.job.id, p_lease_token: this.job.lease_token, p_seconds: LEASE_SECONDS,
      })
      if (!data) this.lost = true // null ⇒ lease lost or cancellation requested
    } catch { /* transient; the next beat retries, checkpoints also renew */ }
  }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }
}

/** Renews the lease AND persists progress in one write. */
async function checkpoint(job: Job, page: number, total: number, pagesProcessed: number, msInPdf: number): Promise<boolean> {
  const { data } = await admin.rpc('checkpoint_processing_job', {
    p_job_id: job.id, p_lease_token: job.lease_token,
    p_checkpoint_page: page, p_total_pages: total,
    p_pages_processed: pagesProcessed, p_ms_in_pdf: msInPdf, p_seconds: LEASE_SECONDS,
  })
  return Boolean(data) // false ⇒ lease lost
}

async function completeJob(job: Job): Promise<void> {
  await admin.rpc('complete_processing_job', { p_job_id: job.id, p_lease_token: job.lease_token })
}

async function failJob(job: Job, code: string, message: string, retryable = true): Promise<void> {
  await admin.rpc('fail_processing_job', {
    p_job_id: job.id, p_lease_token: job.lease_token,
    p_code: code, p_message: message.slice(0, 400), p_retryable: retryable,
  })
}

async function pauseQuota(job: Job): Promise<void> {
  await admin.rpc('pause_processing_job_quota', {
    p_job_id: job.id, p_lease_token: job.lease_token, p_retry_seconds: 900,
  })
}

/** Storage is the durable copy; the local filesystem is not, so the PDF is
 *  never cached on disk. */
async function downloadSource(sourceId: string, userId: string): Promise<Buffer | null> {
  const { data: source } = await admin.from('sources')
    .select('storage_path').eq('id', sourceId).eq('user_id', userId).maybeSingle()
  if (!source?.storage_path) return null
  const { data, error } = await admin.storage.from('sources').download(source.storage_path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

/* ------------------------------------------------------------------ */
/* Classification + printed-page detection                             */
/* ------------------------------------------------------------------ */

function classifyPage(text: string): 'text' | 'scanned' | 'blank' {
  const trimmed = text.trim()
  if (!trimmed.length) return 'scanned'
  if (trimmed.length < TEXT_PAGE_MIN_CHARS) return 'blank'
  return 'text'
}

const ROMAN = /^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i
function romanToInt(s: string): number | null {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
  const t = s.toLowerCase()
  if (!ROMAN.test(t)) return null
  let total = 0
  for (let i = 0; i < t.length; i++) {
    const cur = map[t[i]!]!, next = map[t[i + 1]!] ?? 0
    total += cur < next ? -cur : cur
  }
  return total || null
}

/** Reads a printed page number out of the first/last lines, where books
 *  actually print it. Supports Arabic and Roman front matter. Conservative:
 *  a heading or an in-equation number is rejected. */
function detectPrintedPage(text: string): { label: string; number: number; kind: 'arabic' | 'roman' } | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const candidates = [lines[0]!, lines[lines.length - 1]!]
  for (const line of candidates) {
    if (line.length > 12) continue
    const arabic = line.match(/^(\d{1,4})$/)
    if (arabic?.[1]) return { label: arabic[1], number: Number(arabic[1]), kind: 'arabic' }
    const roman = romanToInt(line)
    if (roman) return { label: line, number: roman, kind: 'roman' }
  }
  return null
}

function chunkText(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    out.push(text.slice(i, i + CHUNK_SIZE))
    i += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return out.filter((c) => c.trim().length > 20)
}

/* ------------------------------------------------------------------ */
/* EXTRACT SESSION — open the PDF once, iterate from the checkpoint      */
/* ------------------------------------------------------------------ */

async function runExtractSession(job: Job): Promise<void> {
  const startedAt = Date.now()
  const budgetMs = job.time_budget_ms ?? 45_000
  const buf = await downloadSource(job.source_id, job.user_id)
  if (!buf) { await failJob(job, 'source_missing', 'Original fayl topilmadi.', false); return }

  let pdf: PdfHandle | null = null
  const lease = new Lease(job)
  try {
    try {
      pdf = await openPdf(buf) // opens once; getPage(n) is random-access
    } catch (openError) {
      // Corrupt XRef tables and unusual encodings are common in school PDFs.
      // The original is still usable: Gemini reads it visually. Record that
      // honestly and finish rather than failing the whole source.
      console.error('[worker] pdf open failed → visual only', job.source_id,
        openError instanceof Error ? openError.message : openError)
      await markVisualOnly(job)
      await completeJob(job)
      return
    }
    const total = pdf.numPages

    // A document pdf.js cannot page-index at all is still usable for exact
    // page visual questions — record that honestly instead of failing.
    if (!total) {
      await markVisualOnly(job)
      await completeJob(job)
      return
    }

    lease.start()
    let processed = job.checkpoint_page
    // extract_toc accumulators (see the TOC block inside the page loop).
    const tocEntries: TocCandidate[] = []
    let tocEvidencePage: number | null = null
    let tocFound = false
    let sinceCheckpoint = 0

    for (let page = job.checkpoint_page + 1; page <= total; page++) {
      if (lease.lost) return                     // ownership lost / cancelled
      if (Date.now() - startedAt > budgetMs) {   // yield; resume next session
        await checkpoint(job, processed, total, processed, Date.now() - startedAt)
        return
      }

      const text = await extractPageText(pdf, page)
      const pageType = classifyPage(text)
      const printed = pageType === 'text' ? detectPrintedPage(text) : null

      await admin.from('source_pages').upsert({
        source_id: job.source_id,
        page_number: page,
        pdf_page_index: page,
        text_content: text || null,
        has_text_layer: pageType === 'text',
        page_type: pageType,
        text_quality: Math.min(1, text.trim().length / 800),
        printed_page_label: printed?.label ?? null,
        printed_page_number: printed?.number ?? null,
        printed_page_kind: printed?.kind ?? null,
        printed_page_confidence: printed ? 0.8 : 0,
        ocr_status: pageType === 'scanned' ? 'pending' : 'skipped',
        indexing_status: pageType === 'text' ? 'pending' : 'skipped',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source_id,page_number' })

      if (printed) {
        await admin.from('source_page_map').upsert({
          source_id: job.source_id, pdf_page_index: page,
          printed_label: printed.label, printed_number: printed.number,
          confidence: 0.8, verified_by: 'ocr',
        }, { onConflict: 'source_id,pdf_page_index' })
      }

      // extract_toc stage, folded into the page loop rather than a second
      // full pass: a table of contents lives in the first pages, so we only
      // look there, and only until we actually find one.
      if (!tocFound && page <= TOC_SCAN_PAGES && text.trim().length > 40 && looksLikeToc(text)) {
        const entries = parseTocPage(text)
        if (entries.length >= 3) {
          tocEntries.push(...entries)
          tocEvidencePage = tocEvidencePage ?? page
          // Books split a TOC over consecutive pages; stop once a page stops
          // contributing so we do not absorb the first chapter as topics.
          if (tocEntries.length >= 400) tocFound = true
        } else if (tocEntries.length) {
          tocFound = true
        }
      }

      processed = page
      if (++sinceCheckpoint >= CHECKPOINT_EVERY) {
        const ok = await checkpoint(job, processed, total, processed, Date.now() - startedAt)
        sinceCheckpoint = 0
        if (!ok) return // lease lost mid-loop
      }
    }

    // Persist the table of contents before finalizing, so routing has real
    // data the moment the source becomes usable.
    if (tocEntries.length >= 3) {
      const saved = await saveTocEntries(job.user_id, job.source_id, tocEntries, tocEvidencePage)
      console.log(`[worker] toc source=${job.source_id} entries=${saved}`)
    } else {
      await admin.from('sources').update({ toc_status: 'none', toc_entry_count: 0 })
        .eq('id', job.source_id).eq('user_id', job.user_id)
    }

    // Whole document extracted. Build printed-page segments from the
    // confirmed anchors, publish honest capabilities, queue indexing.
    await buildPageSegments(job.source_id)

    const { count: textPages } = await admin.from('source_pages')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', job.source_id).eq('page_type', 'text')
    const { count: mappedPages } = await admin.from('source_page_map')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', job.source_id)

    await admin.from('sources').update({
      page_count: total, status: 'ready', progress: 100,
      capability_exact_page: true,
      capability_full_search: (textPages ?? 0) > 0,
      capability_printed_map: (mappedPages ?? 0) > 0,
      printed_map_confidence: total ? Math.min(1, (mappedPages ?? 0) / total) : 0,
      indexed_pages: 0, processing_stage: 'extracted', error_message: null,
    }).eq('id', job.source_id).eq('user_id', job.user_id)

    await completeJob(job)
    if ((textPages ?? 0) > 0) await enqueueJob(job.user_id, job.source_id, 'index', 200)

    // Scanned and mixed pages have no text layer, so they can only become
    // searchable through OCR. Queue that as its own durable stage rather than
    // leaving the book permanently unreadable.
    const { count: scannedPages } = await admin.from('source_pages')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', job.source_id).in('page_type', ['scanned', 'mixed'])
    if ((scannedPages ?? 0) > 0) {
      await admin.from('sources').update({ ocr_pages_total: scannedPages ?? 0 })
        .eq('id', job.source_id).eq('user_id', job.user_id)
      await enqueueJob(job.user_id, job.source_id, 'ocr', 150)
    }
  } finally {
    lease.stop()
    await pdf?.destroy().catch(() => {}) // release pdf.js worker + buffers
  }
}

async function markVisualOnly(job: Job): Promise<void> {
  await admin.from('sources').update({
    status: 'ready', progress: 100,
    capability_exact_page: true, capability_full_search: false, embedding_ready: false,
    processing_stage: 'visual_only',
    processing_warning: 'Matn indeksi yaratilmadi. AI aniq betlarni rasm sifatida o‘qiydi.',
  }).eq('id', job.source_id).eq('user_id', job.user_id)
}

/**
 * Groups confirmed printed anchors into validated segments, each with its
 * own printed↔pdf offset. A single global offset is wrong for real books
 * (Roman front matter, inserts); segments capture the shifts. A segment is
 * only emitted when at least two consecutive anchors agree on the offset.
 */
export async function buildPageSegments(sourceId: string): Promise<void> {
  const { data: anchors } = await admin.from('source_page_map')
    .select('pdf_page_index,printed_number,printed_label')
    .eq('source_id', sourceId).not('printed_number', 'is', null)
    .order('pdf_page_index', { ascending: true })
  if (!anchors?.length) return

  await admin.from('source_page_segments').delete().eq('source_id', sourceId)

  const kindOf = (label: string | null) => (label && /[ivxlcdm]/i.test(label) && !/\d/.test(label) ? 'roman' : 'arabic')
  type Seg = { pdf_start: number; pdf_end: number; printed_start: number; offset_value: number; kind: string; anchor_count: number }
  const segments: Seg[] = []
  let cur: Seg | null = null

  for (const a of anchors) {
    const offset = (a.printed_number as number) - (a.pdf_page_index as number)
    const kind = kindOf(a.printed_label as string | null)
    if (cur && cur.offset_value === offset && cur.kind === kind && (a.pdf_page_index as number) - cur.pdf_end <= 3) {
      cur.pdf_end = a.pdf_page_index as number
      cur.anchor_count++
    } else {
      if (cur && cur.anchor_count >= 2) segments.push(cur)
      cur = {
        pdf_start: a.pdf_page_index as number, pdf_end: a.pdf_page_index as number,
        printed_start: a.printed_number as number, offset_value: offset, kind, anchor_count: 1,
      }
    }
  }
  if (cur && cur.anchor_count >= 2) segments.push(cur)
  if (!segments.length) return

  await admin.from('source_page_segments').insert(segments.map((s) => ({
    source_id: sourceId, pdf_start: s.pdf_start, pdf_end: s.pdf_end,
    printed_start: s.printed_start, printed_kind: s.kind,
    offset_value: s.offset_value, anchor_count: s.anchor_count,
    confidence: Math.min(1, 0.5 + s.anchor_count * 0.1),
  })))
}

/* ------------------------------------------------------------------ */
/* OCR SESSION — read scanned/mixed pages, priority-first, resumable    */
/* ------------------------------------------------------------------ */

async function runOcrSession(job: Job): Promise<void> {
  const startedAt = Date.now()
  const budgetMs = job.time_budget_ms ?? 45_000
  const lease = new Lease(job)
  lease.start()
  try {
    const bytes = await downloadSource(job.source_id, job.user_id)
    if (!bytes) { await failJob(job, 'download_failed', 'Saqlangan PDF topilmadi.', false); return }

    // OCR one page at a time. Each page commits on its own through
    // complete_ocr_page, so losing the lease or the process costs at most the
    // page in flight — never the pages already read.
    const summary = await runOcrPass({
      userId: job.user_id,
      sourceId: job.source_id,
      pdfBytes: bytes,
      workerId: WORKER_ID,
      maxPages: 6,
      shouldStop: () => lease.lost || Date.now() - startedAt > budgetMs,
    })

    const { count: remaining } = await admin.from('source_pages')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', job.source_id)
      .in('page_type', ['scanned', 'mixed'])
      .neq('ocr_status', 'done')

    // OCR'd pages carry real text now, so they must be embedded to become
    // semantically searchable.
    if (summary.processed > 0) await enqueueJob(job.user_id, job.source_id, 'index', 200)

    if (summary.stopped === 'quota' || summary.stopped === 'limit') {
      // Not a failure: pause and let the scheduled retry pick it up.
      await admin.from('sources').update({
        processing_warning: summary.stopped === 'quota'
          ? 'Gemini kvotasi tugadi — OCR keyinroq avtomatik davom etadi.'
          : 'Soatlik OCR chegarasiga yetildi — keyinroq avtomatik davom etadi.',
      }).eq('id', job.source_id).eq('user_id', job.user_id)
      await pauseQuota(job)
      return
    }

    if ((remaining ?? 0) > 0 && !lease.lost) {
      // More pages to read than fit in this lease: complete this session and
      // queue the next one so progress continues across restarts.
      await completeJob(job)
      await enqueueJob(job.user_id, job.source_id, 'ocr', 150)
      return
    }

    if (!lease.lost) {
      await admin.from('sources').update({
        capability_full_search: true,
        processing_stage: 'ocr_complete',
        updated_at: new Date().toISOString(),
      }).eq('id', job.source_id).eq('user_id', job.user_id)
      await completeJob(job)
    }
  } finally {
    lease.stop()
  }
}

/* ------------------------------------------------------------------ */
/* INDEX SESSION — embed text pages, idempotent + quota-aware           */
/* ------------------------------------------------------------------ */

async function runIndexSession(job: Job): Promise<void> {
  const startedAt = Date.now()
  const budgetMs = job.time_budget_ms ?? 45_000
  const lease = new Lease(job)
  lease.start()
  try {
    for (;;) {
      if (lease.lost) return
      if (Date.now() - startedAt > budgetMs) {
        // Yield but leave the job runnable so the next session resumes.
        await admin.from('processing_jobs').update({ status: 'queued', lease_token: null, lease_expires_at: null })
          .eq('id', job.id).eq('lease_token', job.lease_token)
        return
      }

      const { data: pending } = await admin.from('source_pages')
        .select('id,page_number,text_content')
        .eq('source_id', job.source_id).eq('indexing_status', 'pending')
        .order('page_number').limit(INDEX_PAGE_BATCH)

      if (!pending?.length) {
        // Nothing left: publish semantic capability and finish.
        const { count: embedded } = await admin.from('source_pages')
          .select('id', { count: 'exact', head: true })
          .eq('source_id', job.source_id).eq('indexing_status', 'embedded')
        await admin.from('sources').update({
          capability_full_search: true, capability_semantic: (embedded ?? 0) > 0,
          embedding_ready: true, processing_stage: 'indexed', indexed_pages: embedded ?? 0,
        }).eq('id', job.source_id).eq('user_id', job.user_id)
        await completeJob(job)
        return
      }

      for (const page of pending) {
        if (lease.lost) return
        const text = (page.text_content ?? '').trim()
        if (!text) { await admin.from('source_pages').update({ indexing_status: 'skipped' }).eq('id', page.id); continue }

        try {
          // Version-aware reindex: drop only the chunks produced by a
          // DIFFERENT chunker/embedding version, keeping everything current.
          await admin.rpc('reindex_page_versioned', {
            p_user_id: job.user_id,
            p_source_page_id: page.id,
            p_chunker_version: CHUNKER_VERSION,
            p_embedding_model: MODELS.embedding,
          })

          const chunks = chunkText(text)
          // What already exists for this page at the current version. An
          // embedding is the expensive part of indexing, so unchanged content
          // must never be embedded twice — a re-run of an unchanged page
          // should cost nothing.
          const { data: existing } = await admin.from('source_chunks')
            .select('content_hash')
            .eq('source_page_id', page.id)
            .eq('chunker_version', CHUNKER_VERSION)
            .eq('embedding_model', MODELS.embedding)
          const known = new Set((existing ?? []).map((row) => row.content_hash as string))

          let index = 0
          for (const content of chunks) {
            const chunkIndex = index++
            const contentHash = createHash('sha256')
              .update(`${page.page_number}:${chunkIndex}:${content}`).digest('hex')
            if (known.has(contentHash)) continue // unchanged — reuse its embedding

            const embedding = await embedOne(content, 'document')
            await admin.from('source_chunks').upsert({
              source_id: job.source_id, user_id: job.user_id,
              source_page_id: page.id, page_number: page.page_number,
              chunk_index: chunkIndex, content, content_hash: contentHash,
              chunker_version: CHUNKER_VERSION,
              embedding_model: MODELS.embedding, embedding_version: 'v11',
              embedding,
            }, { onConflict: 'source_page_id,chunk_index,chunker_version,content_hash', ignoreDuplicates: true })
          }
          await admin.from('source_pages').update({ indexing_status: 'embedded' }).eq('id', page.id)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'embedding failed'
          if (/quota|429|rate|resource_exhausted/i.test(message)) {
            // Preserve every embedded page; pause and auto-resume later.
            await admin.from('source_pages').update({ indexing_status: 'paused_quota' }).eq('id', page.id)
            await pauseQuota(job)
            return
          }
          await admin.from('source_pages').update({
            indexing_status: 'failed', last_error: message.slice(0, 200),
          }).eq('id', page.id)
        }
      }

      const { count: embedded } = await admin.from('source_pages')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', job.source_id).eq('indexing_status', 'embedded')
      await admin.from('sources').update({ indexed_pages: embedded ?? 0 })
        .eq('id', job.source_id).eq('user_id', job.user_id)
    }
  } finally {
    lease.stop()
  }
}

/* ------------------------------------------------------------------ */
/* Claim + run                                                          */
/* ------------------------------------------------------------------ */

export async function runOneJob(): Promise<boolean> {
  const { data, error } = await admin.rpc('claim_processing_job', {
    p_lease_seconds: LEASE_SECONDS, p_worker_id: WORKER_ID,
  })
  if (error) { console.error('[worker] claim failed', error.message); return false }

  const job = (Array.isArray(data) ? data[0] : data) as Job | null
  if (!job?.id) return false

  try {
    if (job.job_type === 'extract') await runExtractSession(job)
    else if (job.job_type === 'index') await runIndexSession(job)
    else if (job.job_type === 'ocr') await runOcrSession(job)
    else await failJob(job, 'unknown_job_type', `Noma'lum job turi: ${job.job_type}`, false)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    console.error('[worker] job failed', job.id, message)
    await failJob(job, 'processing_failed', message)
  }
  return true
}

/* ------------------------------------------------------------------ */
/* Opportunistic in-process loop (free-tier friendly)                   */
/* ------------------------------------------------------------------ */

let loopTimer: NodeJS.Timeout | null = null
let running = false

export function startWorkerLoop(intervalMs = 5000): void {
  if (loopTimer) return
  const tick = async () => {
    if (running) return
    running = true
    try {
      // Drain a couple of jobs while awake, yielding so HTTP is never starved.
      for (let i = 0; i < 2; i++) {
        const didWork = await runOneJob()
        if (!didWork) break
      }
    } catch (e) {
      console.error('[worker] loop error', e instanceof Error ? e.message : e)
    } finally { running = false }
  }
  loopTimer = setInterval(() => { void tick() }, intervalMs)
  if (typeof loopTimer.unref === 'function') loopTimer.unref()
}

export function stopWorkerLoop(): void {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null }
}

/** Queue depth + stale-lease count for /health/worker. */
export async function workerHealth(): Promise<{
  queued: number; running: number; paused_quota: number; failed: number; stale_leases: number
}> {
  const counts: Record<string, number> = { queued: 0, running: 0, paused_quota: 0, failed: 0 }
  for (const status of Object.keys(counts)) {
    const { count } = await admin.from('processing_jobs')
      .select('id', { count: 'exact', head: true }).eq('status', status)
    counts[status] = count ?? 0
  }
  const { count: stale } = await admin.from('processing_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running').lt('lease_expires_at', new Date().toISOString())
  return {
    queued: counts.queued!, running: counts.running!, paused_quota: counts.paused_quota!,
    failed: counts.failed!, stale_leases: stale ?? 0,
  }
}
