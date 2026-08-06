import { createHash } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { enqueueJob, startWorkerLoop } from '../services/jobWorker.js'
import { checkLimit } from '../services/limits.js'

export const uploadRouter = Router()
export const MAX_PDF_BYTES = 20 * 1024 * 1024
// Files at or under this size may use the convenience multipart path, which
// briefly holds the bytes in RAM. Anything larger MUST use the signed-URL
// path so the API server never buffers a whole book in memory.  (V9 2.13)
const INLINE_MAX_BYTES = 6 * 1024 * 1024
const INLINE_MAX_MB = Math.round(INLINE_MAX_BYTES / (1024 * 1024))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: INLINE_MAX_BYTES, files: 1 } })

const MetaSchema = z.object({
  title: z.string().trim().min(1).max(15),
  emoji: z.string().max(8).optional(),
  color: z.string().max(16).optional(),
  grade: z.coerce.number().int().min(1).max(11).nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
})

function isPdfBytes(buf: Buffer): boolean {
  return buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-'
}
function isEncrypted(buf: Buffer): boolean {
  return buf.subarray(0, Math.min(buf.length, 32_768)).includes(Buffer.from('/Encrypt'))
}
async function findDuplicate(userId: string, hash: string): Promise<{ id: string; title: string } | null> {
  const { data } = await admin.from('sources').select('id,title').eq('user_id', userId).eq('file_hash', hash).maybeSingle()
  return data
}

/* ------------------------------------------------------------------ *
 * Signed-URL path (memory-safe, primary for anything non-trivial).    *
 * The bytes travel from the phone straight to Supabase Storage; the   *
 * API server never holds the file in RAM.                             *
 * ------------------------------------------------------------------ */

// Step 1 — reserve the source row and hand back a direct-to-storage URL.
uploadRouter.post('/create', requireAuth, async (req, res, next) => {
  const userId = req.userId!
  let sourceId = ''
  try {
    const body = MetaSchema.extend({
      file_hash: z.string().regex(/^[0-9a-f]{64}$/i),
      file_size: z.coerce.number().int().positive().max(MAX_PDF_BYTES),
      protocol: z.enum(['tus', 'signed']).default('signed'),
    }).parse(req.body)

    // Bound how many uploads one account can start per hour.
    const rate = await checkLimit(userId, 'uploads')
    if (!rate.allowed) return res.status(429).json({ error: 'rate_limited', message: rate.message })

    const dupe = await findDuplicate(userId, body.file_hash)
    if (dupe) return res.status(409).json({ error: 'duplicate', message: `Bu fayl allaqachon yuklangan: "${dupe.title}".`, sourceId: dupe.id })

    const { data: created, error: insErr } = await admin.from('sources').insert({
      user_id: userId, title: body.title, emoji: body.emoji ?? '📘', color: body.color ?? '#0878F5',
      grade: body.grade ?? null, subject_id: body.subject_id ?? null, file_hash: body.file_hash,
      file_size: body.file_size, mime_type: 'application/pdf', status: 'uploading', progress: 2,
      embedding_ready: false, processing_warning: null,
      upload_protocol: body.protocol, upload_started_at: new Date().toISOString(),
      upload_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }).select('id').single()
    if (insErr) throw insErr
    sourceId = created.id
    // Private, owner-scoped path. Storage RLS keys off the first segment, so a
    // forged path cannot write into another account's folder.
    const storagePath = body.protocol === 'tus'
      ? `${userId}/${sourceId}/original.pdf`
      : `${userId}/${sourceId}.pdf`

    const { data: signed, error: signErr } = await admin.storage.from('sources').createSignedUploadUrl(storagePath)
    if (signErr || !signed) throw signErr ?? new Error('signed_url_failed')

    await admin.from('sources').update({ storage_path: storagePath }).eq('id', sourceId).eq('user_id', userId)
    res.json({ sourceId, storagePath, uploadUrl: signed.signedUrl, token: signed.token })
  } catch (e) {
    if (sourceId) await admin.from('sources').delete().eq('id', sourceId).eq('user_id', userId).then(() => undefined, () => undefined)
    next(e)
  }
})

// Step 2 — the client has PUT the bytes. Validate the STORED file (existence,
// size, magic bytes, not-encrypted, hash) and enqueue durable extraction.
uploadRouter.post('/:sourceId/finalize', requireAuth, async (req, res, next) => {
  const userId = req.userId!
  const sourceId = req.params.sourceId ?? ''
  const discard = async (path: string | null) => {
    if (path) await admin.storage.from('sources').remove([path]).then(() => undefined, () => undefined)
    await admin.from('sources').delete().eq('id', sourceId).eq('user_id', userId).then(() => undefined, () => undefined)
  }
  try {
    const { data: source } = await admin.from('sources').select('id,storage_path,file_hash').eq('id', sourceId).eq('user_id', userId).maybeSingle()
    if (!source?.storage_path) return res.status(404).json({ error: 'not_found', message: 'Manba topilmadi.' })

    const { data: file, error: dlErr } = await admin.storage.from('sources').download(source.storage_path)
    if (dlErr || !file) { await discard(source.storage_path); return res.status(400).json({ error: 'not_uploaded', message: 'Fayl saqlashda topilmadi. Qayta yuklang.' }) }
    const bytes = Buffer.from(await file.arrayBuffer())

    if (bytes.length > MAX_PDF_BYTES) { await discard(source.storage_path); return res.status(413).json({ error: 'too_large', message: 'PDF hajmi 20 MB dan katta.' }) }
    if (!isPdfBytes(bytes)) { await discard(source.storage_path); return res.status(400).json({ error: 'not_pdf', message: 'Xato: faqat PDF fayl yuklang.' }) }
    if (isEncrypted(bytes)) { await discard(source.storage_path); return res.status(400).json({ error: 'pdf_encrypted', message: 'Bu PDF parol bilan himoyalangan. Parolsiz nusxasini yuklang.' }) }

    // Integrity: a truncated or swapped upload must not masquerade as the
    // reserved source. Compare against the hash the client declared.
    const actualHash = createHash('sha256').update(bytes).digest('hex')
    if (source.file_hash && actualHash !== source.file_hash) {
      await discard(source.storage_path)
      return res.status(400).json({ error: 'hash_mismatch', message: 'Yuklangan fayl butunligi tasdiqlanmadi. Qayta yuklang.' })
    }

    await admin.from('sources').update({ status: 'extracting', progress: 20, file_size: bytes.length }).eq('id', sourceId).eq('user_id', userId)
    await enqueueJob(userId, sourceId, 'extract', 50)
    startWorkerLoop()
    res.json({ sourceId, status: 'extracting' })
  } catch (e) { next(e) }
})

// Cancel a reservation whose upload never completed (user backed out).
uploadRouter.post('/:sourceId/abort', requireAuth, async (req, res, next) => {
  const userId = req.userId!
  const sourceId = req.params.sourceId ?? ''
  try {
    const { data: source } = await admin.from('sources').select('id,storage_path,status').eq('id', sourceId).eq('user_id', userId).maybeSingle()
    if (!source) return res.status(404).json({ error: 'not_found', message: 'Manba topilmadi.' })
    // Only abort a reservation that has not started processing.
    if (source.status !== 'uploading') return res.status(409).json({ error: 'already_processing', message: 'Bu manba allaqachon qayta ishlanmoqda.' })
    if (source.storage_path) await admin.storage.from('sources').remove([source.storage_path]).then(() => undefined, () => undefined)
    await admin.from('sources').delete().eq('id', sourceId).eq('user_id', userId)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* ------------------------------------------------------------------ *
 * Multipart path — small files only, a convenience fallback.          *
 * ------------------------------------------------------------------ */
uploadRouter.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  const userId = req.userId!
  let sourceId = ''
  let storagePath = ''
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'no_file', message: 'Fayl yuborilmadi.' })
    const meta = MetaSchema.parse(req.body)

    if (!isPdfBytes(file.buffer)) return res.status(400).json({ error: 'not_pdf', message: 'Xato: faqat PDF fayl yuklang.' })
    if (isEncrypted(file.buffer)) return res.status(400).json({ error: 'pdf_encrypted', message: 'Bu PDF parol bilan himoyalangan. Parolsiz nusxasini yuklang.' })

    const hash = createHash('sha256').update(file.buffer).digest('hex')
    const dupe = await findDuplicate(userId, hash)
    if (dupe) return res.status(409).json({ error: 'duplicate', message: `Bu fayl allaqachon yuklangan: "${dupe.title}".`, sourceId: dupe.id })

    const { data: created, error: insErr } = await admin.from('sources').insert({
      user_id: userId, title: meta.title, emoji: meta.emoji ?? '📘', color: meta.color ?? '#0878F5',
      grade: meta.grade ?? null, subject_id: meta.subject_id ?? null, file_hash: hash,
      file_size: file.size, mime_type: 'application/pdf', status: 'extracting', progress: 5,
      embedding_ready: false, processing_warning: null,
    }).select('id').single()
    if (insErr) throw insErr
    sourceId = created.id
    storagePath = `${userId}/${sourceId}.pdf`

    const { error: upErr } = await admin.storage.from('sources').upload(storagePath, file.buffer, { contentType: 'application/pdf', upsert: false })
    if (upErr) throw upErr
    await admin.from('sources').update({ storage_path: storagePath, progress: 20 }).eq('id', sourceId).eq('user_id', userId)

    // Durable queue instead of fire-and-forget. The web service may sleep or
    // restart at any moment on the free tier; the job row survives and the
    // next worker resumes from its checkpoint.
    await enqueueJob(userId, sourceId, 'extract', 50)
    startWorkerLoop()

    res.json({ sourceId, status: 'extracting' })
  } catch (e) {
    try {
      if (storagePath) await admin.storage.from('sources').remove([storagePath])
      if (sourceId) await admin.from('sources').delete().eq('id', sourceId).eq('user_id', userId)
    } catch { /* best effort */ }
    if (e instanceof Error && /File too large/i.test(e.message)) {
      return res.status(413).json({ error: 'too_large', message: `Bu yo'l faqat ${INLINE_MAX_MB} MB gacha. Kattaroq fayl uchun imzolangan yuklashdan foydalaning.` })
    }
    next(e)
  }
})
