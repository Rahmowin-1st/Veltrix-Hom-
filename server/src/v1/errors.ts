import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].length <= 128
    ? req.headers['x-request-id'] : randomUUID()
  res.locals.requestId = requestId
  res.setHeader('x-request-id', requestId)
  next()
}

export function v1ErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = res.locals.requestId ?? randomUUID()
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid request.', requestId, details: err.issues.map(i => ({ path: i.path.join('.'), code: i.code })) } })
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, requestId, ...(err.details === undefined ? {} : { details: err.details }) } })
  }
  const safeClass = err instanceof Error ? err.name : 'UnknownError'
  console.error('[vh-v1]', { requestId, errorClass: safeClass })
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The server could not complete the request.', requestId } })
}
