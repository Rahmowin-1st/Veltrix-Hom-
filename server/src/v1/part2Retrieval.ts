import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { embedOne } from '../services/gemini.js'
import { canonicalAuth } from './auth.js'
import { defaultAiRouter } from './aiRouter.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

type RetrievalRow = {
  chunk_id: string
  asset_id: string
  source_revision: number | string
  chunk_index: number
  content: string
  locator: Record<string, unknown> | null
  content_hash: string
  extraction_version: string
  rank: number | string | null
}

type RankedHit = {
  chunkId: string
  assetId: string
  sourceRevision: number
  chunkIndex: number
  content: string
  locator: Record<string, unknown>
  contentHash: string
  extractionVersion: string
  lexicalRank: number
  semanticRank: number | null
  score: number
}

function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    dot += av * bv
    aa += av * av
    bb += bv * bv
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}

async function assertNotebookAndSources(account: string, notebookId: string, sourceIds: string[] | undefined) {
  const { data: notebook, error: notebookError } = await admin.from('vh_notebooks').select('id')
    .eq('id', notebookId).eq('account_id', account).is('trashed_at', null).maybeSingle()
  if (notebookError) throw notebookError
  if (!notebook) throw new ApiError(404, 'NOTEBOOK_NOT_FOUND', 'Notebook was not found.')

  if (!sourceIds) return
  const unique = [...new Set(sourceIds)]
  if (unique.length !== sourceIds.length) throw new ApiError(400, 'NOTEBOOK_SOURCE_SCOPE_DUPLICATE', 'Selected Notebook sources must be unique.')
  const { data, error } = await admin.from('vh_notebook_sources').select('asset_id')
    .eq('account_id', account).eq('notebook_id', notebookId).eq('enabled', true).in('asset_id', unique)
  if (error) throw error
  const allowed = new Set((data ?? []).map(row => String(row.asset_id)))
  if (allowed.size !== unique.length || unique.some(id => !allowed.has(id))) {
    throw new ApiError(403, 'NOTEBOOK_SOURCE_SCOPE_INVALID', 'One or more selected sources are not enabled in this Notebook.')
  }
}

async function retrieveScoped(account: string, notebookId: string, query: string, sourceIds: string[] | undefined, topK: number): Promise<RankedHit[]> {
  const candidateLimit = Math.min(100, Math.max(topK * 4, 24))
  const { data, error } = await admin.rpc('vh_search_notebook_chunks_scoped', {
    p_account_id: account,
    p_notebook_id: notebookId,
    p_query: query,
    p_source_ids: sourceIds ?? null,
    p_limit: candidateLimit,
  })
  if (error) throw error
  const rows = (data ?? []) as RetrievalRow[]
  if (!rows.length) return []

  let queryEmbedding: number[] | null = null
  try { queryEmbedding = await embedOne(query, 'query') } catch { queryEmbedding = null }

  const vectors = new Map<string, number[]>()
  if (queryEmbedding) {
    const chunkIds = rows.map(row => row.chunk_id)
    const { data: vectorRows, error: vectorError } = await admin.from('vh_source_chunks').select('id,embedding')
      .eq('account_id', account).in('id', chunkIds)
    if (vectorError) throw vectorError
    for (const row of vectorRows ?? []) {
      if (Array.isArray(row.embedding)) vectors.set(String(row.id), row.embedding.map(Number))
    }
  }

  return rows.map(row => {
    const lexical = Number(row.rank ?? 0)
    const vector = vectors.get(row.chunk_id)
    const semantic = queryEmbedding && vector ? cosine(queryEmbedding, vector) : null
    return {
      chunkId: row.chunk_id,
      assetId: row.asset_id,
      sourceRevision: Number(row.source_revision),
      chunkIndex: Number(row.chunk_index),
      content: row.content,
      locator: row.locator ?? {},
      contentHash: row.content_hash,
      extractionVersion: row.extraction_version,
      lexicalRank: lexical,
      semanticRank: semantic,
      score: semantic == null ? lexical : lexical * 0.55 + semantic * 0.45,
    }
  }).sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId)).slice(0, topK)
}

router.post('/notebooks/:notebookId/query', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const input = z.object({
      query: z.string().trim().min(1).max(10000),
      sourceIds: z.array(z.string().uuid()).min(1).max(200).optional(),
      topK: z.number().int().min(1).max(30).default(12),
    }).parse(req.body)

    await assertNotebookAndSources(id, notebookId, input.sourceIds)
    const totalStarted = Date.now()
    const retrievalStarted = Date.now()
    const hits = await retrieveScoped(id, notebookId, input.query, input.sourceIds, input.topK)
    const retrievalLatencyMs = Date.now() - retrievalStarted

    if (!hits.length) {
      return res.json({
        answer: 'The selected Notebook sources do not contain enough evidence to answer this question.',
        citations: [],
        retrieval: {
          hitCount: 0,
          latencyMs: retrievalLatencyMs,
          generationLatencyMs: 0,
          totalLatencyMs: Date.now() - totalStarted,
          providerId: null,
          modelId: null,
          grounded: true,
        },
      })
    }

    const context = hits.map((hit, index) => `[S${index + 1}] ${hit.content}`).join('\n\n')
    const generationStarted = Date.now()
    const ai = await defaultAiRouter.generate({
      taskClass: 'research',
      system: 'Answer only from the supplied Notebook sources. If the sources do not support the answer, say so. Cite source labels like [S1]. Do not invent citations.',
      prompt: `Question: ${input.query}\n\nNotebook sources:\n${context}`,
    })
    const generationLatencyMs = Date.now() - generationStarted

    res.json({
      answer: ai.text,
      citations: hits.map((hit, index) => ({
        label: `S${index + 1}`,
        assetId: hit.assetId,
        chunkId: hit.chunkId,
        locator: hit.locator,
        sourceRevision: hit.sourceRevision,
        chunkIndex: hit.chunkIndex,
        contentHash: hit.contentHash,
        extractionVersion: hit.extractionVersion,
      })),
      retrieval: {
        hitCount: hits.length,
        latencyMs: retrievalLatencyMs,
        generationLatencyMs,
        totalLatencyMs: Date.now() - totalStarted,
        providerId: ai.providerId,
        modelId: ai.modelId,
        grounded: true,
        selectedSourceCount: input.sourceIds?.length ?? null,
      },
    })
  } catch (error) { next(error) }
})

export { router as v1Part2RetrievalRouter }
