import { z } from 'zod'
import { MODELS } from '../config.js'
import { generate } from './gemini.js'

/* ------------------------------------------------------------------ */
/* Stage 0 — slash commands. Pure regex, zero AI calls, zero quota.    */
/* ------------------------------------------------------------------ */

export interface SlashResult {
  cleanText: string
  subject?: string
  sourceQuery?: string
  page?: number
  answerLength?: 'short' | 'normal' | 'detailed'
  format?: 'notebook' | 'voice' | 'quiz'
  quizCount?: number
  translate?: { from: string; to: string }
  lockMode?: 'lock' | 'auto'
  clearContext?: boolean
}

export function parseSlashCommands(input: string): SlashResult {
  const out: SlashResult = { cleanText: input }
  let text = input

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re)
    if (m) {
      fn(m)
      text = text.replace(re, ' ').trim()
    }
  }

  take(/\/fan\s+([\p{L}\-']+)/iu, (m) => { out.subject = m[1]?.toLowerCase() })
  take(/\/kitob\s+([^/]+?)(?=\s*\/|$)/iu, (m) => { out.sourceQuery = m[1]?.trim() })
  take(/\/bet\s+(\d{1,4})/iu, (m) => { out.page = Number(m[1]) })
  take(/\/qisqa\b/iu, () => { out.answerLength = 'short' })
  take(/\/toliq\b|\/to'liq\b/iu, () => { out.answerLength = 'detailed' })
  take(/\/daftar\b/iu, () => { out.format = 'notebook' })
  take(/\/ovoz\b/iu, () => { out.format = 'voice' })
  take(/\/test\s*(\d{1,2})?/iu, (m) => {
    out.format = 'quiz'
    out.quizCount = m[1] ? Number(m[1]) : 5
  })
  take(/\/tarjima\s+([a-z]{2})\s+([a-z]{2})/iu, (m) => {
    out.translate = { from: m[1]!.toLowerCase(), to: m[2]!.toLowerCase() }
  })
  take(/\/lock\b/iu, () => { out.lockMode = 'lock' })
  take(/\/auto\b/iu, () => { out.lockMode = 'auto' })
  take(/\/tozala\b/iu, () => { out.clearContext = true })

  out.cleanText = text.replace(/\s{2,}/g, ' ').trim()
  return out
}

/* ------------------------------------------------------------------ */
/* Stage 2 — the router. One cheap call that shapes everything after.  */
/* ------------------------------------------------------------------ */

const RouteSchema = z.object({
  subject: z.string(),
  subject_slug: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  intent: z.enum(['homework', 'translate', 'explain', 'off_topic', 'greeting']),
  needs_source: z.boolean(),
  page_hint: z.number().nullable(),
  translate_request: z.boolean(),
  complexity: z.enum(['low', 'medium', 'high']),
})

export type Route = z.infer<typeof RouteSchema>

const ROUTER_PROMPT = `Sen router'san. Foydalanuvchi xabarini tahlil qil va FAQAT JSON qaytar.

subject_slug uchun ruxsat etilgan qiymatlar:
matematika, algebra, geometriya, fizika, kimyo, biologiya, tarix, geografiya,
ona-tili, adabiyot, ingliz-tili, rus-tili, informatika, tarjima, boshqa

intent:
- homework  → masala yechish, mashq bajarish
- explain   → mavzuni tushuntirish
- translate → tarjima so'ralgan
- greeting  → salomlashish
- off_topic → ta'limga aloqasi yo'q (siyosat, o'yin, dating, dasturlash buyurtmasi, shaxsiy maslahat)

page_hint: xabarda bet raqami bo'lsa (masalan "54-bet") o'sha son, aks holda null.

Format:
{"subject":"Algebra","subject_slug":"algebra","confidence":0.95,"language":"uz","intent":"homework","needs_source":true,"page_hint":54,"translate_request":false,"complexity":"medium"}`

export async function routeMessage(userId: string, text: string): Promise<Route> {
  const raw = await generate({
    userId,
    model: MODELS.router,
    system: ROUTER_PROMPT,
    prompt: text,
    json: true,
  })

  try {
    return RouteSchema.parse(JSON.parse(stripFences(raw)))
  } catch {
    // A failed router must never block the answer — fall back to permissive defaults.
    return {
      subject: 'Boshqa',
      subject_slug: 'boshqa',
      confidence: 0,
      language: 'uz',
      intent: 'homework',
      needs_source: true,
      page_hint: null,
      translate_request: false,
      complexity: 'medium',
    }
  }
}

/** Models occasionally wrap JSON in markdown fences despite JSON mode. */
export function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
}
