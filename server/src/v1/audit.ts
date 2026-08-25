import type { NextFunction, Request, Response } from 'express'
import { admin } from '../services/supabase.js'
import { digestSecret } from './crypto.js'

export async function auditEvent(input: {
  accountId?: string | null
  eventType: string
  outcome: 'success' | 'failure' | 'denied' | 'info'
  requestId?: string | null
  objectType?: string | null
  objectId?: string | null
  ip?: string | null
  metadata?: Record<string, unknown>
}) {
  const ipHash = input.ip ? digestSecret(input.ip, 'audit-ip') : null
  const metadata = input.metadata ?? {}
  const forbiddenKeys = ['password','token','secret','code','authorization','prompt','content','body']
  for (const key of Object.keys(metadata)) {
    if (forbiddenKeys.some(forbidden => key.toLowerCase().includes(forbidden))) delete metadata[key]
  }
  const { error } = await admin.from('vh_audit_events').insert({
    account_id: input.accountId ?? null,
    event_type: input.eventType,
    outcome: input.outcome,
    request_id: input.requestId ?? null,
    object_type: input.objectType ?? null,
    object_id: input.objectId ?? null,
    ip_hash: ipHash,
    metadata,
  })
  if (error) console.error('[vh-v1-audit]', { eventType: input.eventType, errorClass: error.name ?? 'DatabaseError' })
}

export function auditMutations(req: Request, res: Response, next: NextFunction) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next()
  const started = Date.now()
  res.once('finish', () => {
    const accountId = (req as Request & { accountId?: string }).accountId
    void auditEvent({
      accountId,
      eventType: `http.${req.method.toLowerCase()}`,
      outcome: res.statusCode < 400 ? 'success' : res.statusCode === 401 || res.statusCode === 403 ? 'denied' : 'failure',
      requestId: String(res.locals.requestId ?? ''),
      ip: req.ip,
      metadata: { route: req.baseUrl + req.path, status: res.statusCode, latencyMs: Date.now() - started },
    })
  })
  next()
}
