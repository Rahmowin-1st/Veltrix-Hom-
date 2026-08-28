import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { enqueueJob, registerJobHandler } from './jobs.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

export const SEARCH_ENTITY_TYPES = [
  'project','notebook','conversation','conversation_message','library_asset','library_content',
  'note','todo','goal','studio_artifact','tag','collection',
] as const
export const searchEntityTypeSchema = z.enum(SEARCH_ENTITY_TYPES)
const searchJobPayloadSchema = z.object({ entityType: searchEntityTypeSchema, entityId: z.string().uuid() }).strict()

export function parseSearchTypes(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const parts = Array.isArray(value) ? value.flatMap(String) : String(value).split(',')
  const unique = [...new Set(parts.map(v => v.trim()).filter(Boolean))]
  return z.array(searchEntityTypeSchema).min(1).max(SEARCH_ENTITY_TYPES.length).parse(unique)
}

async function reindexOne(account: string, entityType: string, entityId: string) {
  const { data, error } = await admin.rpc('vh_reindex_search_entity', {
    p_account_id: account,
    p_entity_type: entityType,
    p_entity_id: entityId,
  })
  if (error) throw error
  return Boolean(data)
}

registerJobHandler('search.reindex', async ({ job, checkpoint }) => {
  if (!job.account_id) throw new Error('search_reindex_owner_missing')
  const payload = searchJobPayloadSchema.parse(job.payload)
  await checkpoint({ stage: 'reindex', ...payload }, 0.15)
  const indexed = await reindexOne(job.account_id, payload.entityType, payload.entityId)
  await checkpoint({ stage: 'done', ...payload, indexed }, 0.95)
  return { result: { ...payload, indexed }, resultRef: payload.entityId }
})

registerJobHandler('search.reindex.batch', async ({ job, checkpoint }) => {
  if (!job.account_id) throw new Error('search_reindex_batch_owner_missing')
  const owner = job.account_id
  const maxBatch = 200
  const { data: rows, error } = await admin.from('vh_search_reindex_queue')
    .select('entity_type,entity_id').eq('account_id', owner)
    .order('queued_at', { ascending: true }).order('entity_type').order('entity_id').limit(maxBatch)
  if (error) throw error
  let processed = 0
  let indexed = 0
  for (const row of rows ?? []) {
    const entityType = searchEntityTypeSchema.parse(row.entity_type)
    const entityId = z.string().uuid().parse(row.entity_id)
    if (await reindexOne(owner, entityType, entityId)) indexed++
    processed++
    if (processed === 1 || processed % 25 === 0) {
      await checkpoint({ stage: 'batch', processed, indexed }, Math.min(0.9, processed / Math.max((rows ?? []).length, 1) * 0.9))
    }
  }

  const { data: next, error: nextError } = await admin.from('vh_search_reindex_queue')
    .select('entity_type,entity_id').eq('account_id', owner)
    .order('queued_at', { ascending: true }).order('entity_type').order('entity_id').limit(1).maybeSingle()
  if (nextError) throw nextError
  if (next) {
    await enqueueJob({
      accountId: owner,
      kind: 'search.reindex.batch',
      payload: {},
      idempotencyKey: `search-reindex-batch:${next.entity_type}:${next.entity_id}`,
      maxAttempts: 5,
      provenance: { source: 'part4-search-backfill' },
    })
  }
  await checkpoint({ stage: 'done', processed, indexed, remaining: Boolean(next) }, 0.98)
  return { result: { processed, indexed, remaining: Boolean(next) } }
})

router.get('/search/global', async (req, res, next) => {
  try {
    const parsed = z.object({
      q: z.string().trim().min(1).max(500),
      limit: z.coerce.number().int().min(1).max(100).default(40),
    }).parse({ q: req.query.q, limit: req.query.limit })
    const types = parseSearchTypes(req.query.types)
    const { data, error } = await admin.rpc('vh_global_search', {
      p_account_id: accountId(req),
      p_query: parsed.q,
      p_limit: parsed.limit,
      p_types: types ?? null,
    })
    if (error) throw error
    res.json({ query: parsed.q, types: types ?? null, items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/search/reindex/:entityType/:entityId', async (req, res, next) => {
  try {
    const entityType = searchEntityTypeSchema.parse(req.params.entityType)
    const entityId = z.string().uuid().parse(req.params.entityId)
    const owner = accountId(req)
    const { data: sourceExists, error: sourceError } = await admin.rpc('vh_reindex_search_entity', {
      p_account_id: owner, p_entity_type: entityType, p_entity_id: entityId,
    })
    if (sourceError) throw sourceError
    if (!sourceExists) throw new ApiError(404, 'SEARCH_SOURCE_NOT_FOUND', 'Search source was not found.')
    res.json({ entityType, entityId, reindexed: true })
  } catch (error) { next(error) }
})

export { router as v1Part4SearchRouter }
