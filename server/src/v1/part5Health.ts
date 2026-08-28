import { createHash, randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { admin } from '../services/supabase.js'
import { workerHealth } from '../services/jobWorker.js'

function safeUserId(req: Request) {
  const userId = (req as Request & { userId?: string }).userId
  if (!userId) return undefined
  return createHash('sha256').update(userId).digest('hex').slice(0, 16)
}

export function part5RequestTelemetry(req: Request, res: Response, next: NextFunction) {
  const requestId = String(req.header('x-request-id') || randomUUID()).slice(0, 128)
  res.setHeader('x-request-id', requestId)
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000
    console.log('[request]', {
      requestId,
      user: safeUserId(req),
      method: req.method,
      route: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    })
  })
  next()
}

async function dbProbe() {
  const started = Date.now()
  const { error } = await admin.from('vh_accounts').select('id', { head: true, count: 'exact' }).limit(1)
  if (error) throw new Error(`db_probe:${error.code || 'unknown'}`)
  return Date.now() - started
}

async function storageProbe() {
  const started = Date.now()
  const { error } = await admin.storage.listBuckets()
  if (error) throw new Error(`storage_probe:${error.message ? 'unavailable' : 'unknown'}`)
  return Date.now() - started
}

function providerState() {
  return {
    ai: process.env.GEMINI_API_KEY ? 'configured' : 'degraded',
    authMail: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'degraded',
  }
}

export const part5HealthRouter = Router()

part5HealthRouter.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    service: 'veltrix-hom-backend',
    version: process.env.VELTRIX_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || 'unknown',
  })
})

part5HealthRouter.get('/readyz', async (_req, res) => {
  const checks: Record<string, unknown> = {}
  let ready = true

  try { checks.db = { ok: true, latencyMs: await dbProbe() } }
  catch { ready = false; checks.db = { ok: false } }

  try { checks.storage = { ok: true, latencyMs: await storageProbe() } }
  catch { ready = false; checks.storage = { ok: false } }

  try {
    const state = await workerHealth()
    checks.worker = { ok: true, state }
  } catch {
    ready = false
    checks.worker = { ok: false }
  }

  const providers = providerState()
  if (providers.ai !== 'configured' || providers.authMail !== 'configured') ready = false
  checks.providers = providers

  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'veltrix-hom-backend',
    version: process.env.VELTRIX_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || 'unknown',
    checks,
  })
})
