import { GoogleGenAI } from '@google/genai'
import PQueue from 'p-queue'
import {
  BACKOFF_MS, MODELS, QUEUE_CONCURRENCY, env,
  EMBEDDING_DIM, embedDocument, embedQuery,
} from '../config.js'
import { admin } from './supabase.js'

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })

/** Global queue. Free-tier RPM is shared across all users of this key. */
const queue = new PQueue({ concurrency: QUEUE_CONCURRENCY })

const isRateLimit = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  return m.includes('429') || m.toLowerCase().includes('resource_exhausted') || m.toLowerCase().includes('quota')
}

/** Retries a rate-limited call: 1s → 2s → 4s → 8s, then gives up. */
async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (!isRateLimit(e)) throw e
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt] ?? 8000))
    }
  }
  throw lastError
}

async function trackQuota(userId: string, model: string, tokens: number) {
  const day = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from('quota_usage')
    .select('requests, tokens')
    .eq('user_id', userId).eq('day', day).eq('model', model)
    .maybeSingle()

  await admin.from('quota_usage').upsert(
    {
      user_id: userId, day, model,
      requests: (data?.requests ?? 0) + 1,
      tokens: (data?.tokens ?? 0) + tokens,
    },
    { onConflict: 'user_id,day,model' }
  )
}

interface GenerateOptions {
  userId: string
  system?: string
  prompt: string
  model?: string
  json?: boolean
  /** Inline images / audio / PDF pages for multimodal calls. */
  media?: { mimeType: string; data: string }[]
}

/** One text/multimodal generation, queued, backed off, quota-tracked,
 *  and falling back to the lighter model if the main one stays busy. */
export async function generate(opts: GenerateOptions): Promise<string> {
  const primary = opts.model ?? MODELS.answer

  const call = (model: string) =>
    withBackoff(async () => {
      const parts: Record<string, unknown>[] = [{ text: opts.prompt }]
      for (const m of opts.media ?? []) {
        parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } })
      }

      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          ...(opts.system ? { systemInstruction: opts.system } : {}),
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          temperature: 0.2, // homework answers should be reproducible, not creative
        },
      })

      const tokens = res.usageMetadata?.totalTokenCount ?? 0
      void trackQuota(opts.userId, model, tokens)
      return res.text ?? ''
    })

  return queue.add(async () => {
    try {
      return await call(primary)
    } catch (e) {
      if (!isRateLimit(e)) throw e
      return await call(MODELS.fallback)
    }
  }) as Promise<string>
}

/**
 * Embeddings via gemini-embedding-2.
 * Note: unlike embedding-001, passing several strings at once returns ONE
 * aggregated vector — so each input must be its own Content object.
 */
export async function embed(
  texts: string[],
  kind: 'query' | 'document',
  titles?: (string | undefined)[]
): Promise<number[][]> {
  if (texts.length === 0) return []

  const prepared = texts.map((t, i) =>
    kind === 'query' ? embedQuery(t) : embedDocument(t, titles?.[i])
  )

  return queue.add(() =>
    withBackoff(async () => {
      const res = await ai.models.embedContent({
        model: MODELS.embedding,
        contents: prepared.map((text) => ({ parts: [{ text }] })),
        config: { outputDimensionality: EMBEDDING_DIM },
      })
      return (res.embeddings ?? []).map((e) => e.values ?? [])
    })
  ) as Promise<number[][]>
}

export async function embedOne(text: string, kind: 'query' | 'document'): Promise<number[]> {
  const [vector] = await embed([text], kind)
  if (!vector) throw new Error('Embedding qaytmadi')
  return vector
}

/** Percentage of today's known free-tier ceiling already consumed. */
export async function quotaPercent(userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from('quota_usage').select('requests').eq('user_id', userId).eq('day', day)
  const total = (data ?? []).reduce((sum, r) => sum + (r.requests ?? 0), 0)
  const DAILY_BUDGET = 200
  return Math.min(100, Math.round((total / DAILY_BUDGET) * 100))
}
