import type { Request, Response } from 'express'
import { once } from 'node:events'
import { Router } from 'express'
import { z } from 'zod'
import { canonicalAuth } from './auth.js'
import { defaultAiRouter, AiRouteError } from './aiRouter.js'
import { ApiError } from './errors.js'
import { beginIdempotency, completeIdempotency, failIdempotency, requestFingerprint } from './idempotency.js'
import { consumeRateLimit, RATE_LIMIT_DEFAULTS } from './rateLimit.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }

type StreamEventType = 'start' | 'block_delta' | 'meta' | 'done' | 'error' | 'heartbeat'
type StreamEvent = { requestId: string; seq: number; type: StreamEventType; payload: unknown }

async function writeEvent(res: Response, event: StreamEvent) {
  if (res.writableEnded || res.destroyed) return
  const data = `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  if (!res.write(data)) await once(res, 'drain')
}

router.post('/ai/stream', async (req, res, next) => {
  const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : ''
  const accountId = (req as CanonicalRequest).accountId!
  const routeKey = 'POST:/api/v1/ai/stream'
  let idemStarted = false
  try {
    if (!idempotencyKey) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required for streaming requests.')
    const parsed = z.object({
      taskClass: z.enum(['fast','research','multimodal','structured','code']).default('fast'),
      prompt: z.string().trim().min(1).max(20000),
      system: z.string().max(8000).optional(),
    }).parse(req.body)
    await consumeRateLimit(`ai:${accountId}`, RATE_LIMIT_DEFAULTS.ai.limit, RATE_LIMIT_DEFAULTS.ai.windowSeconds)
    const requestHash = requestFingerprint(req.method, routeKey, parsed)
    const replay = await beginIdempotency(accountId, routeKey, idempotencyKey, requestHash)

    res.status(200)
    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('connection', 'keep-alive')
    res.setHeader('x-accel-buffering', 'no')
    res.flushHeaders()

    let seq = 0
    const requestId = String(res.locals.requestId)
    if (replay) {
      await writeEvent(res, { requestId, seq: ++seq, type: 'start', payload: { replayed: true } })
      await writeEvent(res, { requestId, seq: ++seq, type: 'done', payload: replay.body ?? { completed: true } })
      return res.end()
    }
    idemStarted = true

    const controller = new AbortController()
    const timeoutMs = Math.max(5000, Math.min(Number(process.env.VH_AI_STREAM_TIMEOUT_MS ?? 90000), 180000))
    const timeout = setTimeout(() => controller.abort(new DOMException('Stream timeout', 'AbortError')), timeoutMs)
    const close = () => controller.abort(new DOMException('Client disconnected', 'AbortError'))
    req.once('close', close)

    let heartbeatStopped = false
    const heartbeat = (async () => {
      while (!heartbeatStopped && !controller.signal.aborted && !res.writableEnded) {
        await new Promise(resolve => setTimeout(resolve, 15000))
        if (!heartbeatStopped && !controller.signal.aborted && !res.writableEnded) {
          await writeEvent(res, { requestId, seq: ++seq, type: 'heartbeat', payload: { ts: Date.now() } })
        }
      }
    })().catch(() => undefined)

    try {
      await writeEvent(res, { requestId, seq: ++seq, type: 'start', payload: { taskClass: parsed.taskClass } })
      let providerId = ''
      let modelId = ''
      let characters = 0
      for await (const chunk of defaultAiRouter.stream({ ...parsed, signal: controller.signal })) {
        providerId = chunk.providerId
        modelId = chunk.modelId
        characters += chunk.delta.length
        await writeEvent(res, {
          requestId,
          seq: ++seq,
          type: 'block_delta',
          payload: { block: { kind: 'text', path: ['body'], delta: chunk.delta } },
        })
      }
      await writeEvent(res, { requestId, seq: ++seq, type: 'meta', payload: { providerId, modelId, characters } })
      const done = { completed: true, providerId, modelId, characters }
      await completeIdempotency(accountId, routeKey, idempotencyKey, 200, done)
      await writeEvent(res, { requestId, seq: ++seq, type: 'done', payload: done })
    } catch (error) {
      if (controller.signal.aborted && res.destroyed) {
        await failIdempotency(accountId, routeKey, idempotencyKey).catch(() => undefined)
      } else {
        const code = error instanceof AiRouteError ? error.code : 'STREAM_FAILED'
        const retryable = error instanceof AiRouteError ? error.retryable : true
        await failIdempotency(accountId, routeKey, idempotencyKey).catch(() => undefined)
        await writeEvent(res, { requestId, seq: ++seq, type: 'error', payload: { code, retryable } })
      }
    } finally {
      heartbeatStopped = true
      clearTimeout(timeout)
      req.off('close', close)
      await heartbeat
      if (!res.writableEnded) res.end()
    }
  } catch (error) {
    if (idemStarted) await failIdempotency(accountId, routeKey, idempotencyKey).catch(() => undefined)
    if (res.headersSent) {
      if (!res.writableEnded) res.end()
      return
    }
    next(error)
  }
})

export { router as v1StreamRouter, writeEvent }
