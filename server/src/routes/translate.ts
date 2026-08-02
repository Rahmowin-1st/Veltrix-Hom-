import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { generate } from '../services/gemini.js'

export const translateRouter = Router()

/**
 * Formats the configured Gemini model actually accepts as inline data.
 * Nothing else is offered in the UI, so a user never picks a dead option.
 */
export const TRANSLATE_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'],
  document: ['application/pdf', 'text/plain'],
} as const

const ALL_MIME: string[] = [
  ...TRANSLATE_MIME.image, ...TRANSLATE_MIME.audio, ...TRANSLATE_MIME.document,
]

const MAX_BYTES = 15 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } })

/** Real language list — every entry has a BCP-47 tag usable by TTS. */
export const LANGUAGES = [
  { code: 'uz', name: "O'zbek",    native: "O'zbekcha",  bcp47: 'uz-UZ' },
  { code: 'en', name: 'Ingliz',    native: 'English',    bcp47: 'en-US' },
  { code: 'ru', name: 'Rus',       native: 'Русский',    bcp47: 'ru-RU' },
  { code: 'kaa', name: 'Qoraqalpoq', native: 'Qaraqalpaqsha', bcp47: 'kaa' },
  { code: 'tr', name: 'Turk',      native: 'Türkçe',     bcp47: 'tr-TR' },
  { code: 'ar', name: 'Arab',      native: 'العربية',     bcp47: 'ar-SA' },
  { code: 'de', name: 'Nemis',     native: 'Deutsch',    bcp47: 'de-DE' },
  { code: 'fr', name: 'Fransuz',   native: 'Français',   bcp47: 'fr-FR' },
  { code: 'es', name: 'Ispan',     native: 'Español',    bcp47: 'es-ES' },
  { code: 'zh', name: 'Xitoy',     native: '中文',        bcp47: 'zh-CN' },
  { code: 'ko', name: 'Koreys',    native: '한국어',       bcp47: 'ko-KR' },
  { code: 'ja', name: 'Yapon',     native: '日本語',       bcp47: 'ja-JP' },
  { code: 'kk', name: 'Qozoq',     native: 'Қазақша',    bcp47: 'kk-KZ' },
  { code: 'ky', name: 'Qirg\u02bciz', native: 'Кыргызча', bcp47: 'ky-KG' },
  { code: 'tg', name: 'Tojik',     native: 'Тоҷикӣ',     bcp47: 'tg-TJ' },
  { code: 'hi', name: 'Hind',      native: 'हिन्दी',       bcp47: 'hi-IN' },
]

translateRouter.get('/languages', requireAuth, (_req, res) => {
  res.json({ languages: LANGUAGES, accepts: TRANSLATE_MIME, maxBytes: MAX_BYTES })
})

/**
 * One endpoint for every input kind. When a file is attached the model both
 * extracts and translates, and the extracted text is returned separately so
 * the user can verify what was actually read.
 */
translateRouter.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const body = z.object({
      text: z.string().max(5000).optional(),
      from: z.string().max(8).default('auto'),
      to: z.string().max(8),
    }).parse(req.body)

    const target = LANGUAGES.find((l) => l.code === body.to)
    if (!target) {
      return res.status(400).json({ error: 'bad_target', message: 'Maqsad tili qo\u02bcllab-quvvatlanmaydi.' })
    }
    const source = body.from === 'auto' ? null : LANGUAGES.find((l) => l.code === body.from)

    const file = req.file
    if (!body.text?.trim() && !file) {
      return res.status(400).json({ error: 'empty', message: 'Matn yoki fayl yuboring.' })
    }
    if (file && !ALL_MIME.includes(file.mimetype)) {
      return res.status(415).json({
        error: 'unsupported_type',
        message: 'Bu fayl turi qo\u02bcllab-quvvatlanmaydi.',
      })
    }

    const instruction = [
      'You are a precise translator.',
      file
        ? 'First extract all readable text from the attached file verbatim.'
        : 'Translate the user text.',
      source ? `Source language: ${source.name}.` : 'Detect the source language.',
      `Target language: ${target.native} (${target.name}).`,
      'Preserve meaning, tone, formatting and line breaks. Do not add commentary.',
      'Reply with strict JSON only, no markdown fences:',
      '{"detected":"<ISO code>","original":"<extracted or original text>","translated":"<translation>"}',
    ].join(' ')

    const raw = await generate({
      userId: req.userId!,
      system: instruction,
      prompt: body.text?.trim() || 'Attached file.',
      media: file
        ? [{ mimeType: file.mimetype, data: file.buffer.toString('base64') }]
        : undefined,
      json: true,
    })

    const parsed = safeJson(raw)
    if (!parsed?.translated) {
      return res.status(502).json({
        error: 'no_translation',
        message: 'Tarjima olinmadi. Qayta urinib ko\u02bcring.',
      })
    }

    // Remember the target so the workspace reopens where the user left it.
    await admin.from('user_settings')
      .update({ tr_last_target: body.to })
      .eq('user_id', req.userId!)

    res.json({
      detected: parsed.detected ?? body.from,
      original: parsed.original ?? body.text ?? '',
      translated: parsed.translated,
      targetBcp47: target.bcp47,
      extracted: Boolean(file),
    })
  } catch (e) {
    if (e instanceof Error && e.message.includes('File too large')) {
      return res.status(413).json({
        error: 'too_large',
        message: `Fayl hajmi limitdan katta. Ruxsat etilgan: ${MAX_BYTES / 1024 / 1024} MB.`,
      })
    }
    next(e)
  }
})

interface TranslationJson { detected?: string; original?: string; translated?: string }

function safeJson(raw: string): TranslationJson | null {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try { return JSON.parse(cleaned) as TranslationJson } catch { /* fall through */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(cleaned.slice(start, end + 1)) as TranslationJson } catch { return null }
}
