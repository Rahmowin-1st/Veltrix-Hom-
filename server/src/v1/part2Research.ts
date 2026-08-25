import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { beginIdempotency, completeIdempotency, failIdempotency, requestFingerprint } from './idempotency.js'
import { cancelJob, enqueueJob } from './jobs.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

function idempotencyKey(req: Request) {
  const value = req.header('Idempotency-Key')
  if (!value) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required.')
  return value
}

function researchPlan(kind: 'fast' | 'deep') {
  return kind === 'fast'
    ? { version: 1, steps: ['search_candidates', 'review_candidates'] }
    : { version: 1, steps: ['search_candidates', 'synthesize_candidate_report', 'review_candidates'] }
}

async function assertNotebook(account: string, notebookId: string) {
  const { data, error } = await admin.from('vh_notebooks').select('id')
    .eq('id', notebookId).eq('account_id', account).is('trashed_at', null).maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(404, 'NOTEBOOK_NOT_FOUND', 'Notebook was not found.')
}

router.post('/notebooks/:notebookId/research', async (req, res, next) => {
  const id = accountId(req)
  const notebookId = z.string().uuid().parse(req.params.notebookId)
  const key = idempotencyKey(req)
  const route = `/api/v1/notebooks/${notebookId}/research`
  const input = z.object({
    type: z.enum(['fast', 'deep']),
    query: z.string().trim().min(1).max(10000),
    goal: z.string().trim().max(5000).optional(),
    title: z.string().trim().max(200).optional(),
  }).parse(req.body)
  const fingerprint = requestFingerprint('POST', route, input)
  let sessionId: string | null = null
  let jobId: string | null = null
  try {
    const replay = await beginIdempotency(id, route, key, fingerprint)
    if (replay) return res.status(replay.status).json(replay.body)
    await assertNotebook(id, notebookId)
    const { data: session, error: sessionError } = await admin.from('vh_research_sessions').insert({
      account_id: id,
      notebook_id: notebookId,
      kind: input.type,
      query: input.query,
      goal: input.goal || null,
      title: input.title || null,
      plan: researchPlan(input.type),
      status: 'queued',
      provenance: { startContract: 'part2-research-v1' },
    }).select('id').single()
    if (sessionError) throw sessionError
    sessionId = String(session.id)
    const job = await enqueueJob({
      accountId: id,
      kind: input.type === 'deep' ? 'part2.research.deep' : 'part2.research.fast',
      payload: { sessionId },
      idempotencyKey: `research:${sessionId}`,
      maxAttempts: input.type === 'deep' ? 5 : 3,
      provenance: { notebookId, researchSessionId: sessionId, type: input.type },
    })
    jobId = String(job.id)
    const { error: linkError } = await admin.from('vh_research_sessions').update({ job_id: jobId, updated_at: new Date().toISOString() })
      .eq('id', sessionId).eq('account_id', id).eq('notebook_id', notebookId)
    if (linkError) throw linkError
    const body = { sessionId, jobId, status: 'queued', type: input.type, plan: researchPlan(input.type) }
    await completeIdempotency(id, route, key, 202, body)
    res.status(202).json(body)
  } catch (error) {
    if (jobId) await admin.from('vh_jobs').delete().eq('id', jobId).eq('account_id', id).in('state', ['queued', 'retry']).catch(() => undefined)
    if (sessionId) await admin.from('vh_research_sessions').delete().eq('id', sessionId).eq('account_id', id).eq('notebook_id', notebookId).catch(() => undefined)
    await failIdempotency(id, route, key).catch(() => undefined)
    next(error)
  }
})

router.get('/notebooks/:notebookId/research', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
    await assertNotebook(id, notebookId)
    const { data, error } = await admin.from('vh_research_sessions')
      .select('id,kind,title,query,goal,plan,status,job_id,report,provenance,safe_error_code,created_at,updated_at,finished_at')
      .eq('account_id', id).eq('notebook_id', notebookId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.get('/notebooks/:notebookId/research/:sessionId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const sessionId = z.string().uuid().parse(req.params.sessionId)
    const { data, error } = await admin.from('vh_research_sessions')
      .select('id,kind,title,query,goal,plan,status,job_id,report,provenance,safe_error_code,created_at,updated_at,finished_at')
      .eq('id', sessionId).eq('account_id', id).eq('notebook_id', notebookId).maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'RESEARCH_SESSION_NOT_FOUND', 'Research session was not found in this Notebook.')
    res.json(data)
  } catch (error) { next(error) }
})

router.get('/notebooks/:notebookId/research/:sessionId/candidates', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const sessionId = z.string().uuid().parse(req.params.sessionId)
    const { data: session, error: sessionError } = await admin.from('vh_research_sessions').select('id')
      .eq('id', sessionId).eq('account_id', id).eq('notebook_id', notebookId).maybeSingle()
    if (sessionError) throw sessionError
    if (!session) throw new ApiError(404, 'RESEARCH_SESSION_NOT_FOUND', 'Research session was not found in this Notebook.')
    const { data, error } = await admin.from('vh_research_candidates')
      .select('id,source_url,title,domain,snippet,rank_score,fetch_status,accepted_asset_id,provenance,created_at,updated_at')
      .eq('account_id', id).eq('research_session_id', sessionId)
      .order('rank_score', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).limit(100)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/notebooks/:notebookId/research/:sessionId/cancel', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const sessionId = z.string().uuid().parse(req.params.sessionId)
    const { data: session, error } = await admin.from('vh_research_sessions').select('id,job_id,status')
      .eq('id', sessionId).eq('account_id', id).eq('notebook_id', notebookId).maybeSingle()
    if (error) throw error
    if (!session) throw new ApiError(404, 'RESEARCH_SESSION_NOT_FOUND', 'Research session was not found in this Notebook.')
    if (!session.job_id) throw new ApiError(409, 'RESEARCH_JOB_UNAVAILABLE', 'Research session has no cancellable job.')
    await cancelJob(id, String(session.job_id))
    res.json({ sessionId, status: 'cancelled' })
  } catch (error) { next(error) }
})

export { router as v1Part2ResearchRouter }
