import type { Request, Response } from 'express'
import { once } from 'node:events'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { defaultAiRouter, AiRouteError } from './aiRouter.js'
import { ApiError } from './errors.js'
import { runFirstTurnTitleJob } from './part3History.js'
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
const activeStreams = new Map<string, AbortController>()

function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

function domainError(error: unknown): never {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : String(error)
  if (message.includes('conversation_not_found')) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.')
  if (message.includes('assistant_message_not_found')) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Conversation message was not found.')
  if (message.includes('asset_not_found')) throw new ApiError(404, 'LIBRARY_ASSET_NOT_FOUND', 'One or more Library assets were not found.')
  if (message.includes('attachment_count_exceeded')) throw new ApiError(400, 'ATTACHMENT_COUNT_EXCEEDED', 'A message supports at most 5 attachments.')
  if (message.includes('attachment_bytes_exceeded')) throw new ApiError(400, 'ATTACHMENT_BYTES_EXCEEDED', 'Message attachments may total at most 10 MiB.')
  if (message.includes('conversation_message_terminal')) throw new ApiError(409, 'MESSAGE_TERMINAL', 'This message is already in a terminal state.')
  if (message.includes('stream_request_mismatch')) throw new ApiError(409, 'STREAM_REQUEST_MISMATCH', 'The stream request identity does not match the stored message.')
  throw error
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
  res.flushHeaders()
}

const beginResultSchema = z.object({
  replayed: z.boolean(),
  requestId: z.string().uuid(),
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  assistantStatus: z.enum(['PENDING','STREAMING','COMPLETED','FAILED','CANCELLED','INCOMPLETE']),
})

function rowEvent(row: Record<string, unknown>): PersistedStreamEvent {
  return {
    protocol: 'vh.stream.v1',
    requestId: String(row.request_id),
    messageId: String(row.message_id),
    seq: Number(row.seq),
    type: String(row.event_type) as PersistedStreamEvent['type'],
    ...(row.block_id ? { blockId: String(row.block_id) } : {}),
    ...(row.block_type ? { blockType: String(row.block_type) } : {}),
    ...(row.block_version ? { blockVersion: Number(row.block_version) } : {}),
    payload: row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {},
  }
}

async function ownedMessage(id: string, conversationId: string, messageId: string) {
  const { data, error } = await admin.from('vh_conversation_messages')
    .select('id,status,request_id,content_blocks,plain_text,error_code')
    .eq('id', messageId).eq('conversation_id', conversationId).eq('account_id', id).eq('role', 'ASSISTANT').maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Conversation message was not found.')
  return data
}

router.post('/conversations/:conversationId/messages/stream', async (req, res, next) => {
  const id = accountId(req)
  let assistantMessageId: string | null = null
  let requestId: string | null = null
  let controller: AbortController | null = null
  let timeout: NodeJS.Timeout | null = null
  try {
    const conversationId = z.string().uuid().parse(req.params.conversationId)
    const idempotencyKey = z.string().trim().min(1).max(128).parse(req.headers['idempotency-key'])
    const input = z.object({
      prompt: z.string().trim().min(1).max(20000),
      attachmentAssetIds: z.array(z.string().uuid()).max(5).default([]),
    }).parse(req.body)
    await consumeRateLimit(`conversation-stream:${id}`, RATE_LIMIT_DEFAULTS.ai.limit, RATE_LIMIT_DEFAULTS.ai.windowSeconds)

    const { data: begun, error: beginError } = await admin.rpc('vh_begin_conversation_turn', {
      p_account_id: id,
      p_conversation_id: conversationId,
      p_idempotency_key: idempotencyKey,
      p_prompt: input.prompt,
      p_attachment_asset_ids: input.attachmentAssetIds,
    })
    if (beginError) domainError(beginError)
    const turn = beginResultSchema.parse(begun)
    assistantMessageId = turn.assistantMessageId
    requestId = turn.requestId

    startSse(res)
    if (turn.replayed) {
      const { data: events, error: eventsError } = await admin.from('vh_stream_events')
        .select('message_id,request_id,seq,event_type,block_id,block_type,block_version,payload')
        .eq('account_id', id).eq('message_id', turn.assistantMessageId).order('seq', { ascending: true }).limit(5000)
      if (eventsError) throw eventsError
      for (const row of events ?? []) await writeSse(res, rowEvent(row))
      if (!res.writableEnded) res.end()
      return
    }

    controller = new AbortController()
    activeStreams.set(turn.assistantMessageId, controller)
    const timeoutMs = Math.max(5000, Math.min(Number(process.env.VH_AI_STREAM_TIMEOUT_MS ?? 90000), 180000))
    timeout = setTimeout(() => controller?.abort(new DOMException('Stream timeout', 'AbortError')), timeoutMs)

    // Client disconnect does not destroy authoritative generation. The server continues
    // persisting events/final state; the client can replay them from the resume endpoint.
    let clientConnected = true
    res.once('close', () => { clientConnected = false })

    const persist = async (draft: StreamEventDraft) => {
      const { data, error } = await admin.rpc('vh_append_conversation_stream_event', {
        p_account_id: id,
        p_message_id: turn.assistantMessageId,
        p_request_id: turn.requestId,
        p_event_type: draft.type,
        p_payload: draft.payload,
        p_block_id: draft.blockId ?? null,
        p_block_type: draft.blockType ?? null,
        p_block_version: draft.blockVersion ?? null,
      })
      if (error) domainError(error)
      return Number(data)
    }

    const streamed = await runTypedAnswerStream({
      requestId: turn.requestId,
      messageId: turn.assistantMessageId,
      signal: controller.signal,
      chunks: defaultAiRouter.stream({
        taskClass: 'fast',
        prompt: input.prompt,
        system: 'Answer the user faithfully and directly. Output answer text only. Veltrix server owns typed block framing and validation.',
        signal: controller.signal,
      }),
      persist,
      deliver: async event => { if (clientConnected) await writeSse(res, event) },
      finalize: async final => {
        const { data, error } = await admin.rpc('vh_complete_conversation_message', {
          p_account_id: id,
          p_message_id: turn.assistantMessageId,
          p_request_id: turn.requestId,
          p_plain_text: final.plainText,
          p_content_blocks: final.blocks,
          p_model_route: { providerId: final.providerId, modelId: final.modelId, taskClass: 'fast' },
          p_usage_metrics: { outputCharacters: final.characters },
          p_provenance: { protocol: 'vh.stream.v1', idempotencyKey },
        })
        if (error) domainError(error)
        return Number(z.object({ seq: z.coerce.number().int().positive() }).parse(data).seq)
      },
    })
    // Title work is secondary metadata: it runs only after the authoritative message is
    // complete, installs a deterministic fallback first, never overwrites USER titles,
    // and absorbs provider/title-job failures without invalidating the completed answer.
    void runFirstTurnTitleJob({
      accountId: id,
      conversationId,
      prompt: input.prompt,
      answer: streamed.block.text,
    })
    if (!res.writableEnded && !res.destroyed) res.end()
  } catch (error) {
    if (assistantMessageId && requestId) {
      const status = await ownedMessage(id, String(req.params.conversationId), assistantMessageId).catch(() => null)
      if (status && status.status !== 'CANCELLED' && status.status !== 'COMPLETED') {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const { error: cleanupError } = await admin.rpc('vh_mark_conversation_message_incomplete', {
            p_account_id: id, p_message_id: assistantMessageId, p_request_id: requestId, p_code: 'STREAM_INTERRUPTED',
          })
          if (cleanupError) {
            console.error('[vh-v1-part3-stream-cleanup]', {
              requestId,
              assistantMessageId,
              operation: 'mark_incomplete',
              errorCode: cleanupError.code,
            })
          }
        } else {
          const code = error instanceof AiRouteError ? error.code : error instanceof Part3StreamError ? error.code : 'STREAM_FAILED'
          const { error: cleanupError } = await admin.rpc('vh_fail_conversation_message', {
            p_account_id: id, p_message_id: assistantMessageId, p_request_id: requestId, p_code: code,
          })
          if (cleanupError) {
            console.error('[vh-v1-part3-stream-cleanup]', {
              requestId,
              assistantMessageId,
              operation: 'mark_failed',
              errorCode: cleanupError.code,
            })
          }
          if (!res.destroyed && res.headersSent) {
            const { data } = await admin.from('vh_stream_events')
              .select('message_id,request_id,seq,event_type,block_id,block_type,block_version,payload')
              .eq('account_id', id).eq('message_id', assistantMessageId).eq('event_type', 'message.failed')
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
    if (assistantMessageId && activeStreams.get(assistantMessageId) === controller) activeStreams.delete(assistantMessageId)
  }
})

router.get('/conversations/:conversationId/messages/:messageId/events', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = z.string().uuid().parse(req.params.conversationId)
    const messageId = z.string().uuid().parse(req.params.messageId)
    const query = z.object({
      afterSeq: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(1000).default(250),
    }).parse(req.query)
    const message = await ownedMessage(id, conversationId, messageId)
    const { data, error } = await admin.from('vh_stream_events')
      .select('message_id,request_id,seq,event_type,block_id,block_type,block_version,payload,created_at')
      .eq('account_id', id).eq('message_id', messageId).gt('seq', query.afterSeq)
      .order('seq', { ascending: true }).limit(query.limit)
    if (error) throw error
    res.json({
      protocol: 'vh.stream.v1',
      messageId,
      status: message.status,
      errorCode: message.error_code,
      finalBlocks: message.status === 'COMPLETED' ? message.content_blocks : [],
      finalText: message.status === 'COMPLETED' ? message.plain_text : '',
      events: (data ?? []).map(rowEvent),
    })
  } catch (error) { next(error) }
})

router.post('/conversations/:conversationId/messages/:messageId/cancel', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = z.string().uuid().parse(req.params.conversationId)
    const messageId = z.string().uuid().parse(req.params.messageId)
    await ownedMessage(id, conversationId, messageId)
    activeStreams.get(messageId)?.abort(new DOMException('Cancelled by user', 'AbortError'))
    const { data, error } = await admin.rpc('vh_cancel_conversation_message', { p_account_id: id, p_message_id: messageId })
    if (error) domainError(error)
    res.json(data)
  } catch (error) { next(error) }
})

export { router as v1Part3ConversationRouter, activeStreams }
