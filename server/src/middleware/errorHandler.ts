import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

/** Every error leaves this app as plain, actionable Uzbek. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Yuborilgan ma\'lumot noto\'g\'ri.',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  const message = err instanceof Error ? err.message : String(err)
  console.error('[veltrix]', message)

  if (message.includes('429') || message.toLowerCase().includes('quota')) {
    return res.status(429).json({
      error: 'rate_limited',
      message: '⏳ Navbat band. 20 soniyadan keyin urinamiz.',
    })
  }

  res.status(500).json({
    error: 'internal',
    message: '⚠️ Serverda xatolik. Birozdan keyin urinib ko\'ring.',
  })
}
