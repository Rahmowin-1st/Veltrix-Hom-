import { createHash } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { embed } from '../services/gemini.js'

export const uploadRouter = Router()
export const MAX_PDF_BYTES = 20 * 1024 * 1024
const CHUNK_CHARS = 1400
const CHUNK_OVERLAP = 200
const EMBED_BATCH = 24

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1 } })

function isPdfBytes(buf: Buffer): boolean {
  return buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-'
}
function isEncrypted(buf: Buffer): boolean {
  return buf.subarray(0, Math.min(buf.length, 32_768)).includes(Buffer.from('/Encrypt'))
}

uploadRouter.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  const userId = req.userId!
  let sourceId = '' as string
  let storagePath = '' as string
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'no_file', message: 'Fayl yuborilmadi.' })
    const meta = z.object({
      title: z.string().trim().min(1).max(15),
      emoji: z.string().max(8).optional(),
      color: z.string().max(16).optional(),
      grade: z.coerce.number().int().min(1).max(11).nullable().optional(),
      subject_id: z.string().uuid().nullable().optional(),
    }).parse(req.body)

    if (!isPdfBytes(file.buffer)) return res.status(400).json({ error: 'not_pdf', message: 'Xato: faqat PDF fayl yuklang.' })
    if (isEncrypted(file.buffer)) return res.status(400).json({ error: 'pdf_encrypted', message: 'Bu PDF parol bilan himoyalangan. Parolsiz nusxasini yuklang.' })

    const hash = createHash('sha256').update(file.buffer).digest('hex')
    const { data: dupe } = await admin.from('sources').select('id,title').eq('user_id', userId).eq('file_hash', hash).maybeSingle()
    if (dupe) return res.status(409).json({ error: 'duplicate', message: `Bu fayl allaqachon yuklangan: "${dupe.title}".`, sourceId: dupe.id })

    const { data: created, error: insErr } = await admin.from('sources').insert({
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
      embedding_ready: false,
      processing_warning: null,
    }).select('id').single()
    if (insErr) throw insErr
    sourceId = created.id
    storagePath = `${userId}/${sourceId}.pdf`

    const { error: upErr } = await admin.storage.from('sources').upload(storagePath, file.buffer, { contentType: 'application/pdf', upsert: false })
    if (upErr) throw upErr
    await admin.from('sources').update({ storage_path: storagePath, progress: 20 }).eq('id', sourceId).eq('user_id', userId)

    res.json({ sourceId, status: 'extracting' })

    void processPdf(sourceId, userId, file.buffer).catch(async (e) => {
      console.error('[source] processing failed', sourceId, e)
      await admin.from('sources').update({
        status: 'failed', progress: 0,
        error_message: e instanceof Error ? e.message : 'Qayta ishlashda xato.',
      }).eq('id', sourceId).eq('user_id', userId)
    })
  } catch (e) {
    try {
      if (storagePath) await admin.storage.from('sources').remove([storagePath])
      if (sourceId) await admin.from('sources').delete().eq('id', sourceId).eq('user_id', userId)
    } catch { /* best effort */ }
    if (e instanceof Error && /File too large/i.test(e.message)) {
      return res.status(413).json({ error: 'too_large', message: 'PDF hajmi limitdan katta. Maksimal hajm: 20 MB.' })
    }
    next(e)
  }
})

/** Reusable by the reprocess endpoint. It writes the exact schema columns. */
export async function processPdf(sourceId: string, userId: string, buf: Buffer): Promise<void> {
  if (!isPdfBytes(buf)) throw new Error('Saqlangan fayl PDF emas.')
  if (isEncrypted(buf)) throw new Error('PDF parol bilan himoyalangan.')

  const mod = await import('pdf-parse')
  const pdfParse = (mod.default ?? mod) as (b: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>
  const renderedPages: string[] = []
  let parsed: { text: string; numpages: number }
  try {
    parsed = await pdfParse(buf, {
      pagerender: async (pageData: { getTextContent: (opts?: Record<string, unknown>) => Promise<{ items: Array<{ str?: string; transform?: number[] }> }> }) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        const lines: string[] = []
        let lastY: number | null = null
        let line = ''
        for (const item of content.items) {
          const text = item.str ?? ''
          const y = item.transform?.[5] ?? null
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2.5) {
            if (line.trim()) lines.push(line.trim())
            line = text
          } else line += `${line ? ' ' : ''}${text}`
          lastY = y
        }
        if (line.trim()) lines.push(line.trim())
        const page = lines.join('\n').trim()
        renderedPages.push(page)
        return page
      },
    })
  } catch (e) {
    // Corrupt XRef tables are common in school PDFs. Gemini can often read
    // the original document even when pdf.js cannot build a text index.
    await admin.from('source_chunks').delete().eq('source_id', sourceId).eq('user_id', userId)
    await admin.from('source_pages').delete().eq('source_id', sourceId)
    await admin.from('sources').update({
      status: 'ready', progress: 100, error_message: null,
      embedding_ready: false,
      processing_warning: `PDF indeksi yaratilmadi (${e instanceof Error ? e.message.slice(0, 120) : 'parser xatosi'}). AI original PDFni to‘g‘ridan-to‘g‘ri ko‘rib ishlaydi.`,
    }).eq('id', sourceId).eq('user_id', userId)
    return
  }

  const pageTexts = renderedPages.length === parsed.numpages
    ? renderedPages
    : splitPages(parsed.text, parsed.numpages)
  const totalChars = pageTexts.reduce((n, t) => n + t.trim().length, 0)

  await admin.from('source_chunks').delete().eq('source_id', sourceId).eq('user_id', userId)
  await admin.from('source_pages').delete().eq('source_id', sourceId)

  // Scanned PDFs may have no text layer. Keep the original PDF usable:
  // strict chat requests will send it directly to Gemini for visual reading.
  if (totalChars < 80) {
    await admin.from('sources').update({
      page_count: parsed.numpages,
      status: 'ready',
      progress: 100,
      error_message: null,
      embedding_ready: false,
      processing_warning: 'Bu skanerlangan PDF. Matn indeksi yo‘q, ammo AI original PDFni to‘g‘ridan-to‘g‘ri ko‘rib ishlaydi.',
    }).eq('id', sourceId).eq('user_id', userId)
    return
  }

  const pageRows = pageTexts.map((text, index) => ({
    source_id: sourceId,
    page_number: index + 1,
    text_content: text.trim(),
    has_text_layer: text.trim().length > 0,
    ocr_used: false,
  })).filter((row) => row.text_content.length > 0)

  for (let i = 0; i < pageRows.length; i += 100) {
    const { error } = await admin.from('source_pages').insert(pageRows.slice(i, i + 100))
    if (error) throw error
  }

  await admin.from('sources').update({
    page_count: parsed.numpages,
    status: 'embedding',
    progress: 45,
    error_message: null,
    processing_warning: null,
  }).eq('id', sourceId).eq('user_id', userId)

  const chunks: Array<{ page_number: number; chunk_index: number; content: string; content_hash: string }> = []
  for (const page of pageRows) {
    let chunkIndex = 0
    for (let offset = 0; offset < page.text_content.length; offset += CHUNK_CHARS - CHUNK_OVERLAP) {
      const content = page.text_content.slice(offset, offset + CHUNK_CHARS).trim()
      if (content.length < 60) continue
      chunks.push({
        page_number: page.page_number,
        chunk_index: chunkIndex++,
        content,
        content_hash: createHash('sha256').update(`${page.page_number}:${content}`).digest('hex'),
      })
    }
  }

  let embeddingReady = true
  let warning: string | null = null
  let done = 0
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH)
      const vectors = await embed(batch.map((c) => c.content), 'document')
      const rows = batch.map((c, j) => ({
        source_id: sourceId,
        user_id: userId,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        content: c.content,
        content_hash: c.content_hash,
        embedding: vectors[j],
      }))
      const { error } = await admin.from('source_chunks').insert(rows)
      if (error) throw error
      done += batch.length
      await admin.from('sources').update({ progress: 45 + Math.round((done / Math.max(chunks.length, 1)) * 50) }).eq('id', sourceId).eq('user_id', userId)
    }
  } catch (e) {
    embeddingReady = false
    warning = 'Semantik indeks vaqtincha tayyorlanmadi. Bet raqami va matn qidiruvi ishlaydi; keyin qayta indekslash mumkin.'
    console.error('[source] embedding warning', sourceId, e)
  }

  await admin.from('sources').update({
    status: 'ready', progress: 100, error_message: null,
    embedding_ready: embeddingReady, processing_warning: warning,
  }).eq('id', sourceId).eq('user_id', userId)
}

function splitPages(text: string, numPages: number): string[] {
  const byFormFeed = text.split('\f')
  if (byFormFeed.length === numPages) return byFormFeed
  const per = Math.ceil(text.length / Math.max(numPages, 1))
  return Array.from({ length: Math.max(numPages, 1) }, (_, i) => text.slice(i * per, (i + 1) * per))
}
