import { createHash } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { embed } from '../services/gemini.js'

export const uploadRouter = Router()

/**
 * Real limits, not decorative ones.
 * 20 MB is what the Supabase free tier accepts per object; anything larger
 * is rejected before a byte is stored, with the actual number shown to the user.
 */
export const MAX_PDF_BYTES = 20 * 1024 * 1024
const CHUNK_CHARS = 1400
const CHUNK_OVERLAP = 200
const EMBED_BATCH = 24

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
})

/** A real PDF starts with %PDF-. A renamed .jpg does not. */
function isPdfBytes(buf: Buffer): boolean {
  return buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-'
}

/** Encrypted PDFs cannot be read for text; detect before wasting AI calls. */
function isEncrypted(buf: Buffer): boolean {
  return buf.subarray(0, Math.min(buf.length, 4096)).includes(Buffer.from('/Encrypt'))
}

uploadRouter.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  const userId = req.userId!
  let sourceId: string | null = null
  let storagePath: string | null = null

  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'no_file', message: 'Fayl yuborilmadi.' })
    }

    const meta = z.object({
      title: z.string().trim().min(1).max(60),
      emoji: z.string().max(8).optional(),
      color: z.string().max(16).optional(),
      grade: z.coerce.number().int().min(1).max(11).nullable().optional(),
      subject_id: z.string().uuid().nullable().optional(),
    }).parse(req.body)

    // ---- validation, cheapest checks first -------------------------
    if (!isPdfBytes(file.buffer)) {
      return res.status(400).json({
        error: 'not_pdf', message: 'Xato: faqat PDF fayl yuklang.',
      })
    }
    if (isEncrypted(file.buffer)) {
      return res.status(400).json({
        error: 'pdf_encrypted',
        message: 'Bu PDF parol bilan himoyalangan. Parolsiz nusxasini yuklang.',
      })
    }

    const hash = createHash('sha256').update(file.buffer).digest('hex')
    const { data: dupe } = await admin
      .from('sources').select('id, title')
      .eq('user_id', userId).eq('file_hash', hash).maybeSingle()

    if (dupe) {
      return res.status(409).json({
        error: 'duplicate',
        message: `Bu fayl allaqachon yuklangan: "${dupe.title}".`,
        sourceId: dupe.id,
      })
    }

    // ---- create the row first so the UI can poll its status ---------
    const { data: created, error: insErr } = await admin
      .from('sources')
      .insert({
        user_id: userId,
        title: meta.title,
        emoji: meta.emoji ?? '📘',
        color: meta.color ?? '#0878F5',
        grade: meta.grade ?? null,
        subject_id: meta.subject_id ?? null,
        file_hash: hash,
        file_size: file.size,
        mime_type: 'application/pdf',
        status: 'extracting',
        progress: 5,
      })
      .select('id').single()
    if (insErr) throw insErr
    const id: string = created.id
    sourceId = id

    // ---- store the original; it is the permanent copy ---------------
    storagePath = `${userId}/${id}.pdf`
    const { error: upErr } = await admin.storage
      .from('sources')
      .upload(storagePath, file.buffer, { contentType: 'application/pdf', upsert: false })
    if (upErr) throw upErr

    await admin.from('sources')
      .update({ storage_path: storagePath, progress: 20 }).eq('id', id)

    // Respond now — extraction continues in the background so a large
    // textbook never holds the request open past the proxy timeout.
    await admin.from('activity_events').insert({
      user_id: userId, kind: 'source_added', points: 5,
      metadata: { sourceId: id, title: meta.title, size: file.size },
    }).then(() => undefined, () => undefined)

    res.json({ sourceId: id, status: 'extracting' })

    void processPdf(id, userId, file.buffer).catch(async (e) => {
      console.error('[source] processing failed', id, e)
      await admin.from('sources').update({
        status: 'failed',
        error_message: e instanceof Error ? e.message : 'Qayta ishlashda xato.',
      }).eq('id', id)
    })
  } catch (e) {
    // Roll back partial work so a failed upload leaves nothing behind.
    try {
      if (storagePath) await admin.storage.from('sources').remove([storagePath])
      if (sourceId) await admin.from('sources').delete().eq('id', sourceId)
    } catch { /* rollback is best-effort */ }

    if (e instanceof Error && e.message.includes('File too large')) {
      return res.status(413).json({
        error: 'too_large',
        message: `PDF hajmi limitdan katta. Ruxsat etilgan: ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
      })
    }
    next(e)
  }
})

/**
 * Extract → chunk → embed. Progress is written to the row as it advances,
 * so the client shows a real percentage rather than a decorative animation.
 */
async function processPdf(sourceId: string, userId: string, buf: Buffer) {
  // pdf-parse is CommonJS and reads a test fixture at import time when
  // loaded at module scope, so it is imported lazily here.
  const mod = await import('pdf-parse')
  const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number }>
  const parsed = await pdfParse(buf)

  const pageTexts = splitPages(parsed.text, parsed.numpages)
  const totalChars = pageTexts.reduce((n, t) => n + t.length, 0)

  if (totalChars < 200) {
    await admin.from('sources').update({
      status: 'failed',
      error_message: "PDF'dan matn topilmadi. Skanerlangan bo'lsa, matnli nusxa kerak.",
    }).eq('id', sourceId)
    return
  }

  await admin.from('sources').update({
    page_count: parsed.numpages, status: 'embedding', progress: 40,
  }).eq('id', sourceId)

  // Persist page text so citations can quote a real page later.
  const pageRows = pageTexts
    .map((content, i) => ({ source_id: sourceId, user_id: userId, page: i + 1, content }))
    .filter((p) => p.content.trim().length > 0)

  for (let i = 0; i < pageRows.length; i += 100) {
    await admin.from('source_pages').insert(pageRows.slice(i, i + 100))
  }

  // Build overlapping chunks, each one remembering the page it came from.
  const chunks: { page: number; content: string }[] = []
  for (const { page, content } of pageRows) {
    for (let i = 0; i < content.length; i += CHUNK_CHARS - CHUNK_OVERLAP) {
      const slice = content.slice(i, i + CHUNK_CHARS).trim()
      if (slice.length > 80) chunks.push({ page, content: slice })
    }
  }

  let done = 0
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH)
    const vectors = await embed(batch.map((c) => c.content), 'document')

    await admin.from('source_chunks').insert(
      batch.map((c, j) => ({
        source_id: sourceId,
        user_id: userId,
        page: c.page,
        content: c.content,
        embedding: vectors[j],
      }))
    )

    done += batch.length
    await admin.from('sources')
      .update({ progress: 40 + Math.round((done / chunks.length) * 55) })
      .eq('id', sourceId)
  }

  await admin.from('sources')
    .update({ status: 'ready', progress: 100, error_message: null })
    .eq('id', sourceId)
}

/**
 * pdf-parse returns one string. Form feeds mark page breaks when present;
 * otherwise the text is divided evenly, which keeps citations approximate
 * but never invented.
 */
function splitPages(text: string, numPages: number): string[] {
  const byFormFeed = text.split('\f')
  if (byFormFeed.length === numPages) return byFormFeed

  const per = Math.ceil(text.length / Math.max(numPages, 1))
  const out: string[] = []
  for (let i = 0; i < numPages; i++) out.push(text.slice(i * per, (i + 1) * per))
  return out
}
