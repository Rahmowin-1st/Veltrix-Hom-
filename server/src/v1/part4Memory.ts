import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { defaultAiRouter } from './aiRouter.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { registerJobHandler } from './jobs.js'

type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

export const memoryClasses = ['explicit','profile','preference','learning','interest','behavior_workflow','project_signal','notebook_signal','conversation_derived','goal_todo_note_signal','recent_context','ai_inference'] as const
const inferredClasses = memoryClasses.filter((x): x is Exclude<typeof memoryClasses[number], 'explicit'> => x !== 'explicit')
export const memoryClassSchema = z.enum(memoryClasses)
const inferredClassSchema = z.enum(inferredClasses as [typeof inferredClasses[number], ...typeof inferredClasses[number][]])

export const memoryCandidateSchema = z.object({
  memoryClass: inferredClassSchema,
  content: z.string().trim().min(1).max(12_000),
  confidence: z.number().min(0).max(1),
  canonicalKey: z.string().min(1).max(256).regex(/^[0-9a-zA-Z._:-]+$/).optional(),
  structuredValue: z.record(z.unknown()).default({}),
})
export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>

const inferredSensitivePatterns: ReadonlyArray<{ category: string; pattern: RegExp }> = [
  { category: 'credential', pattern: /\b(password|passcode|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|private[_ -]?key)\b/i },
  { category: 'financial_secret', pattern: /\b(card number|cvv|cvc|bank account|routing number|pin code)\b/i },
  { category: 'health', pattern: /\b(diagnos(?:is|ed)|medical condition|mental health condition|prescription|therapy record)\b/i },
  { category: 'religion', pattern: /\b(religion|religious belief|faith affiliation)\b/i },
  { category: 'politics', pattern: /\b(political party|political ideology|voting preference)\b/i },
  { category: 'race_ethnicity', pattern: /\b(race|ethnicity|ethnic origin)\b/i },
  { category: 'sexual_orientation', pattern: /\b(sexual orientation|sex life)\b/i },
  { category: 'criminal_history', pattern: /\b(criminal record|criminal history)\b/i },
]

export function memoryPrivacyDecision(candidate: MemoryCandidate) {
  for (const rule of inferredSensitivePatterns) if (rule.pattern.test(candidate.content)) return { allowed: false as const, reason: rule.category }
  return { allowed: true as const, reason: null }
}

export function normalizeMemoryCandidate(input: unknown) {
  const candidate = memoryCandidateSchema.parse(input)
  const privacy = memoryPrivacyDecision(candidate)
  if (!privacy.allowed) return { persist: false as const, reason: `privacy:${privacy.reason}`, candidate }
  if (candidate.confidence < 0.72) return { persist: false as const, reason: 'confidence_below_threshold', candidate }
  return { persist: true as const, reason: null, candidate }
}

async function persistInferredMemory(account: string, input: unknown, provenance: Record<string, unknown>) {
  const normalized = normalizeMemoryCandidate(input)
  if (!normalized.persist) return { persisted: false, reason: normalized.reason, id: null }
  const c = normalized.candidate
  const { data, error } = await admin.rpc('vh_persist_inferred_memory', {
    p_account_id: account,
    p_memory_class: c.memoryClass,
    p_content: c.content,
    p_confidence: c.confidence,
    p_structured_value: c.structuredValue,
    p_provenance: provenance,
    p_canonical_key: c.canonicalKey ?? null,
    p_threshold: 0.72,
  })
  if (error) throw error
  return { persisted: Boolean(data), reason: data ? null : 'explicit_conflict_or_threshold', id: data ? String(data) : null }
}

function parseCandidateEnvelope(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try { parsed = JSON.parse(clean) } catch { throw new ApiError(502, 'MEMORY_EXTRACTION_INVALID', 'Memory extraction returned invalid structured output.') }
  return z.object({ candidates: z.array(memoryCandidateSchema).max(12) }).parse(parsed)
}

registerJobHandler('memory.extract', async ({ job, checkpoint, signal }) => {
  const owner = job.account_id
  if (!owner) throw new Error('memory_job_owner_required')
  const payload = z.object({
    sourceKind: z.enum(['conversation','note','goal','todo','project','notebook','explicit_event']),
    sourceId: z.string().uuid().nullable().optional(),
    text: z.string().min(1).max(80_000),
  }).parse(job.payload)
  await checkpoint({ phase: 'extract' }, 0.2)
  const result = await defaultAiRouter.generate({
    taskClass: 'structured', signal,
    system: [
      'Extract only durable, useful user-memory candidates as JSON {"candidates":[]}.',
      'Never include hidden chain-of-thought. Do not store every message.',
      'Do not infer sensitive health, religion, politics, race/ethnicity, sexual orientation, sex-life, criminal-history, credentials, or financial-secret attributes.',
      'Each candidate: memoryClass, content, confidence 0..1, optional canonicalKey, structuredValue object.',
      'Prefer no candidate over low-confidence trivia.'
    ].join(' '),
    prompt: `SOURCE_KIND=${payload.sourceKind}\nTEXT:\n${payload.text}`,
  })
  const envelope = parseCandidateEnvelope(result.text)
  await checkpoint({ phase: 'persist', candidates: envelope.candidates.length }, 0.65)
  const outcomes = []
  for (const candidate of envelope.candidates) {
    outcomes.push(await persistInferredMemory(owner, candidate, {
      sourceKind: payload.sourceKind,
      sourceId: payload.sourceId ?? null,
      jobId: job.id,
      providerId: result.providerId,
      modelId: result.modelId,
      extractedAt: new Date().toISOString(),
    }))
  }
  return { result: { candidates: envelope.candidates.length, persisted: outcomes.filter(x => x.persisted).length, outcomes } }
})

const router = Router()
router.use(canonicalAuth)

router.get('/memory', async (req, res, next) => {
  try {
    const owner = accountId(req)
    const parsed = z.object({
      q: z.string().trim().max(500).optional(),
      authority: z.enum(['EXPLICIT','INFERRED']).optional(),
      memoryClass: memoryClassSchema.optional(),
      pinned: z.enum(['true','false']).optional(),
      important: z.enum(['true','false']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query)
    let q = admin.from('vh_memories').select('id,memory_class,content,structured_value,authority,confidence,provenance,canonical_key,pinned,important,last_used_at,created_at,updated_at,revision')
      .eq('account_id', owner).is('deleted_at', null)
    if (parsed.authority) q = q.eq('authority', parsed.authority)
    if (parsed.memoryClass) q = q.eq('memory_class', parsed.memoryClass)
    if (parsed.pinned) q = q.eq('pinned', parsed.pinned === 'true')
    if (parsed.important) q = q.eq('important', parsed.important === 'true')
    if (parsed.q) q = q.ilike('content', `%${parsed.q.replaceAll('%','\\%').replaceAll('_','\\_')}%`)
    const { data, error } = await q.order('authority', { ascending: true }).order('pinned', { ascending: false }).order('important', { ascending: false }).order('updated_at', { ascending: false }).limit(parsed.limit)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/memory/remember', async (req, res, next) => {
  try {
    const input = z.object({
      memoryClass: memoryClassSchema.default('explicit'), content: z.string().trim().min(1).max(12_000),
      structuredValue: z.record(z.unknown()).default({}), canonicalKey: z.string().min(1).max(256).regex(/^[0-9a-zA-Z._:-]+$/).optional(),
      pinned: z.boolean().default(false), important: z.boolean().default(true),
      source: z.object({ kind: z.string().max(80), id: z.string().uuid().nullable().optional() }).optional(),
    }).parse(req.body)
    const { data, error } = await admin.rpc('vh_remember_explicit', {
      p_account_id: accountId(req), p_memory_class: input.memoryClass, p_content: input.content,
      p_structured_value: input.structuredValue, p_provenance: { source: input.source ?? { kind: 'remember_this', id: null }, rememberedAt: new Date().toISOString() },
      p_canonical_key: input.canonicalKey ?? null, p_pinned: input.pinned, p_important: input.important,
    })
    if (error) throw error
    res.status(201).json({ id: data, authority: 'EXPLICIT' })
  } catch (error) { next(error) }
})

router.post('/memory/retrieve', async (req, res, next) => {
  try {
    const input = z.object({ query: z.string().max(2000).default(''), currentContext: z.string().max(4000).optional(), classes: z.array(memoryClassSchema).max(memoryClasses.length).optional(), limit: z.number().int().min(1).max(30).default(12) }).parse(req.body ?? {})
    const search = [input.query, input.currentContext ?? ''].filter(Boolean).join(' ').slice(0, 4000)
    const { data, error } = await admin.rpc('vh_retrieve_memories', { p_account_id: accountId(req), p_query: search, p_limit: input.limit, p_classes: input.classes ?? null })
    if (error) throw error
    const ids = (data ?? []).map((m: any) => m.id)
    if (ids.length) await admin.from('vh_memories').update({ last_used_at: new Date().toISOString() }).eq('account_id', accountId(req)).in('id', ids)
    res.json({ items: data ?? [], bounded: true, limit: input.limit })
  } catch (error) { next(error) }
})

router.patch('/memory/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const input = z.object({ expectedRevision: z.number().int().positive(), patch: z.object({ content: z.string().trim().min(1).max(12_000).optional(), structuredValue: z.record(z.unknown()).optional(), pinned: z.boolean().optional(), important: z.boolean().optional() }) }).parse(req.body)
    const { data, error } = await admin.rpc('vh_patch_memory', { p_account_id: accountId(req), p_memory_id: id, p_expected_revision: input.expectedRevision, p_patch: input.patch })
    if (error) throw error
    res.json({ revision: data })
  } catch (error) { next(error) }
})

router.delete('/memory/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const { data, error } = await admin.rpc('vh_delete_memory', { p_account_id: accountId(req), p_memory_id: id })
    if (error) throw error
    if (!data) throw new ApiError(404, 'MEMORY_NOT_FOUND', 'Memory was not found.')
    res.json({ deleted: true })
  } catch (error) { next(error) }
})

router.get('/memory/:id/provenance', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const { data, error } = await admin.from('vh_memories').select('id,authority,confidence,provenance,created_at,updated_at,revision').eq('account_id', accountId(req)).eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'MEMORY_NOT_FOUND', 'Memory was not found.')
    res.json(data)
  } catch (error) { next(error) }
})

export { parseCandidateEnvelope, persistInferredMemory, router as v1Part4MemoryRouter }
