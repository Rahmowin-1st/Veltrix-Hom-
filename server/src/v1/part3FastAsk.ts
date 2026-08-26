import type { Request, Response } from 'express'
import { once } from 'node:events'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { defaultAiRouter, AiRouteError } from './aiRouter.js'
import { ApiError } from './errors.js'
import { deterministicConversationTitle } from './part3History.js'
import { consumeRateLimit, RATE_LIMIT_DEFAULTS } from './rateLimit.js'
import {
  Part3StreamError,
  formatPart3Sse,
  runTypedAnswerStream,
  type PersistedStreamEvent,
  type StreamEventDraft,
} from './part3Streaming.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }

export const fastAskStatusSchema = z.enum([
  'PENDING','STREAMING','COMPLETED','INCOMPLETE','FAILED','CANCELLED','EXPIRED','CONVERTED',
])
export type FastAskStatus = z.infer<typeof fastAskStatusSchema>

export const fastAskInputSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  attachmentAssetIds: z.array(z.string().uuid()).max(5).default([]),
}).strict()

export const fastAskIdempotencyKeySchema = z.string().trim().min(1).max(128)

export const fastAskEventsQuerySchema = z.object({
  afterSeq: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(250),
})

export const fastAskConversionResponseSchema = z.object({
  fastAskId: z.string().uuid(),
  conversationId: z.string().uuid(),
  userMessageId: z.string().uuid().optional(),
  assistantMessageId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  titleSource: z.literal('AUTO'),
  replayed: z.boolean(),
})

export function canConvertFastAsk(status: FastAskStatus) {
  return status === 'COMPLETED' || status === 'CONVERTED'
}

export function exposesFastAskFinal(status: FastAskStatus) {
  return status === 'COMPLETED' || status === 'CONVERTED'
}

const beginResultSchema = z.object({
  replayed: z.boolean(),
  fastAskId: z.string().uuid(),
  requestId: z.string().uuid(),
  status: fastAskStatusSchema,
  expiresAt: z.string().or(z.date()),
})

const fastAskIdSchema = z.string().uuid()
const activeFastAskStreams = new Map<string, AbortController>()

function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

function domainError(error: unknown): never {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : String(error)
  if (message.includes('fast_ask_not_found')) throw new ApiError(404, 'FAST_ASK_NOT_FOUND', 'Fast Ask was not found or has expired.')
  if (message.includes('fast_ask_expired')) throw new ApiError(410, 'FAST_ASK_EXPIRED', 'Fast Ask has expired.')
  if (message.includes('fast_ask_idempotency_conflict')) throw new ApiError(409, 'FAST_ASK_IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different Fast Ask request.')
  if (message.includes('fast_ask_not_convertible')) throw new ApiError(409, 'FAST_ASK_NOT_CONVERTIBLE', 'Only a completed Fast Ask can be switched to a Conversation.')
  if (message.includes('fast_ask_terminal_immutable') || message.includes('fast_ask_terminal')) throw new ApiError(409, 'FAST_ASK_TERMINAL', 'Fast Ask is already in a terminal state.')
  if (message.includes('fast_ask_request_mismatch')) throw new ApiError(409, 'FAST_ASK_REQUEST_MISMATCH', 'The Fast Ask request identity does not match.')
  if (message.includes('fast_ask_attachment_count_exceeded')) throw new ApiError(400, 'ATTACHMENT_COUNT_EXCEEDED', 'Fast Ask supports at most 5 attachments.')
  if (message.includes('fast_ask_attachment_bytes_exceeded')) throw new ApiError(400, 'ATTACHMENT_BYTES_EXCEEDED', 'Fast Ask attachments may total at most 10 MiB.')
  if (message.includes('asset_not_found')) throw new ApiError(404, 'LIBRARY_ASSET_NOT_FOUND', 'One or more Library assets were not found.')
  throw error
}

function rowEvent(row: Record<string, unknown>): PersistedStreamEvent {
  return {
    protocol: 'vh.stream.v1',
    requestId: String(row.request_id),
    messageId: String(row.fast_ask_id),
    seq: Number(row.seq),
    type: String(row.event_type) as PersistedStreamEvent['type'],
    ...(row.block_id ? { blockId: String(row.block_id) } : {}),
    ...(row.block_type ? { blockType: String(row.block_type) } : {}),
    ...(row.block_version ? { blockVersion: Number(row.block_version) } : {}),
    payload: row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {},
  }
}

async function writeSse(res: Response, event: PersistedStreamEvent) {
  if (res.writableEnded || res.destroyed) return
  if (!res.write(formatPart3Sse(event))) await once(res, 'drain')
}

function startSse(res: Response) {
  res.status(200)
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-cache, no-transform')
  res.setHeader('connection', 'keep-alive')
  res.setHeader('x-accel-buffering', 'no')
  res.setHeader('x-veltrix-stream-protocol', 'vh.stream.v1')
  res.setHeader('x-veltrix-stream-scope', 'fast-ask')
  res.flushHeaders()
}

async function ownedFastAsk(id: string, fastAskId: string) {
  const { data, error } = await admin.from('vh_fast_ask_sessions')
    .select('id,prompt,status,request_id,response_blocks,response_text,error_code,expires_at,converted_conversation_id')
    .eq('id', fastAskId).eq('account_id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(404, 'FAST_ASK_NOT_FOUND', 'Fast Ask was not found.')
  const status = fastAskStatusSchema.parse(data.status)
  const expiresAt = new Date(String(data.expires_at)).getTime()
  if (status !== 'CONVERTED' && expiresAt <= Date.now()) throw new ApiError(410, 'FAST_ASK_EXPIRED', 'Fast Ask has expired.')
  return { ...data, status }
}

router.post('/fast-ask/stream', async (req, res, next) => {
  const id = accountId(req)
  let fastAskId: string | null = null
  let requestId: string | null = null
  let controller: AbortController | null = null
  let timeout: NodeJS.Timeout | null = null
  try {
    const idempotencyKey = fastAskIdempotencyKeySchema.parse(req.headers['idempotency-key'])
    const input = fastAskInputSchema.parse(req.body)
    await consumeRateLimit(`fast-ask-stream:${id}`, RATE_LIMIT_DEFAULTS.ai.limit, RATE_LIMIT_DEFAULTS.ai.windowSeconds)

    const { data: begun, error: beginError } = await admin.rpc('vh_begin_fast_ask', {
      p_account_id: id,
      p_idempotency_key: idempotencyKey,
      p_prompt: input.prompt,
      p_attachment_asset_ids: input.attachmentAssetIds,
    })
    if (beginError) domainError(beginError)
    const session = beginResultSchema.parse(begun)
    fastAskId = session.fastAskId
    requestId = session.requestId

    startSse(res)
    if (session.replayed) {
      const { data: events, error: eventsError } = await admin.from('vh_fast_ask_stream_events')
        .select('fast_ask_id,request_id,seq,event_type,block_id,block_type,block_version,payload')
        .eq('account_id', id).eq('fast_ask_id', session.fastAskId).order('seq', { ascending: true }).limit(5000)
      if (eventsError) throw eventsError
      for (const row of events ?? []) await writeSse(res, rowEvent(row))
      if (!res.writableEnded) res.end()
      return
    }

    controller = new AbortController()
    activeFastAskStreams.set(session.fastAskId, controller)
    const timeoutMs = Math.max(5000, Math.min(Number(process.env.VH_AI_STREAM_TIMEOUT_MS ?? 90000), 180000))
    timeout = setTimeout(() => controller?.abort(new DOMException('Stream timeout', 'AbortError')), timeoutMs)

    let clientConnected = true
    res.once('close', () => { clientConnected = false })

    const persist = async (draft: StreamEventDraft) => {
      const { data, error } = await admin.rpc('vh_append_fast_ask_stream_event', {
        p_account_id: id,
        p_fast_ask_id: session.fastAskId,
        p_request_id: session.requestId,
        p_event_type: draft.type,
        p_payload: draft.payload,
        p_block_id: draft.blockId ?? null,
        p_block_type: draft.blockType ?? null,
        p_block_version: draft.blockVersion ?? null,
      })
      if (error) domainError(error)
      return Number(data)
    }

    await runTypedAnswerStream({
      requestId: session.requestId,
      messageId: session.fastAskId,
      signal: controller.signal,
      chunks: defaultAiRouter.stream({
        taskClass: 'fast',
        prompt: input.prompt,
        system: 'Answer the user faithfully and directly. Output answer text only. Fast Ask is one-time and does not create a Conversation unless the user explicitly switches.',
        signal: controller.signal,
      }),
      persist,
      deliver: async event => { if (clientConnected) await writeSse(res, event) },
      finalize: async final => {
        const { data, error } = await admin.rpc('vh_complete_fast_ask', {
          p_account_id: id,
          p_fast_ask_id: session.fastAskId,
          p_request_id: session.requestId,
          p_response_text: final.plainText,
          p_response_blocks: final.blocks,
          p_model_route: { providerId: final.providerId, modelId: final.modelId, taskClass: 'fast' },
          p_provenance: { protocol: 'vh.stream.v1', scope: 'fast_ask', idempotencyKey },
        })
        if (error) domainError(error)
        return Number(z.object({ seq: z.coerce.number().int().positive() }).parse(data).seq)
      },
    })
    if (!res.writableEnded && !res.destroyed) res.end()
  } catch (error) {
    if (fastAskId && requestId) {
      const current = await ownedFastAsk(id, fastAskId).catch(() => null)
      if (current && current.status === 'STREAMING') {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const { error: cleanupError } = await admin.rpc('vh_mark_fast_ask_incomplete', {
            p_account_id: id,p_fast_ask_id: fastAskId,p_request_id: requestId,p_code: 'STREAM_INTERRUPTED',
          })
          if (cleanupError) console.error('[vh-v1-part3-fast-ask-cleanup]', { fastAskId, operation: 'mark_incomplete', errorCode: cleanupError.code })
        } else {
          const code = error instanceof AiRouteError ? error.code : error instanceof Part3StreamError ? error.code : 'STREAM_FAILED'
          const { error: cleanupError } = await admin.rpc('vh_fail_fast_ask', {
            p_account_id: id,p_fast_ask_id: fastAskId,p_request_id: requestId,p_code: code,
          })
          if (cleanupError) console.error('[vh-v1-part3-fast-ask-cleanup]', { fastAskId, operation: 'mark_failed', errorCode: cleanupError.code })
          if (!res.destroyed && res.headersSent) {
            const { data } = await admin.from('vh_fast_ask_stream_events')
              .select('fast_ask_id,request_id,seq,event_type,block_id,block_type,block_version,payload')
              .eq('account_id', id).eq('fast_ask_id', fastAskId).eq('event_type', 'message.failed')
              .order('seq', { ascending: false }).limit(1).maybeSingle()
            if (data) await writeSse(res, rowEvent(data)).catch(() => undefined)
          }
        }
      }
    }
    if (res.headersSent) {
      if (!res.writableEnded && !res.destroyed) res.end()
      return
    }
    next(error)
  } finally {
    if (timeout) clearTimeout(timeout)
    if (fastAskId && activeFastAskStreams.get(fastAskId) === controller) activeFastAskStreams.delete(fastAskId)
  }
})

router.get('/fast-ask/:fastAskId/events', async (req, res, next) => {
  try {
    const id = accountId(req)
    const fastAskId = fastAskIdSchema.parse(req.params.fastAskId)
    const query = fastAskEventsQuerySchema.parse(req.query)
    const session = await ownedFastAsk(id, fastAskId)
    const { data, error } = await admin.from('vh_fast_ask_stream_events')
      .select('fast_ask_id,request_id,seq,event_type,block_id,block_type,block_version,payload,created_at')
      .eq('account_id', id).eq('fast_ask_id', fastAskId).gt('seq', query.afterSeq)
      .order('seq', { ascending: true }).limit(query.limit)
    if (error) throw error
    res.json({
      protocol: 'vh.stream.v1',scope: 'fast_ask',fastAskId,status: session.status,errorCode: session.error_code,
      finalBlocks: exposesFastAskFinal(session.status) ? session.response_blocks : [],
      finalText: exposesFastAskFinal(session.status) ? session.response_text : '',
      convertedConversationId: session.converted_conversation_id,
      events: (data ?? []).map(rowEvent),
    })
  } catch (error) { next(error) }
})

router.post('/fast-ask/:fastAskId/cancel', async (req, res, next) => {
  try {
    const id = accountId(req)
    const fastAskId = fastAskIdSchema.parse(req.params.fastAskId)
    await ownedFastAsk(id, fastAskId)
    activeFastAskStreams.get(fastAskId)?.abort(new DOMException('Cancelled by user', 'AbortError'))
    const { data, error } = await admin.rpc('vh_cancel_fast_ask', { p_account_id: id,p_fast_ask_id: fastAskId })
    if (error) domainError(error)
    res.json(data)
  } catch (error) { next(error) }
})

router.post('/fast-ask/:fastAskId/switch-to-conversation', async (req, res, next) => {
  try {
    const id = accountId(req)
    const fastAskId = fastAskIdSchema.parse(req.params.fastAskId)
    const session = await ownedFastAsk(id, fastAskId)
    if (!canConvertFastAsk(session.status)) throw new ApiError(409, 'FAST_ASK_NOT_CONVERTIBLE', 'Only a completed Fast Ask can be switched to a Conversation.')
    const title = deterministicConversationTitle(String(session.prompt), String(session.response_text))
    const { data, error } = await admin.rpc('vh_convert_fast_ask_to_conversation', {
      p_account_id: id,p_fast_ask_id: fastAskId,p_auto_title: title,
    })
    if (error) domainError(error)
    res.status(201).json(fastAskConversionResponseSchema.parse(data))
  } catch (error) { next(error) }
})

export { router as v1Part3FastAskRouter, activeFastAskStreams }
