import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

/** Every error leaves this app as plain, actionable Uzbek. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Yuborilgan ma’lumot noto‘g‘ri.',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }

  const coded = err as { code?: string; message?: string }
  if (coded?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'too_large',
      message: 'Fayl hajmi limitdan katta. Maksimal hajm: 20 MB.',
    })
  }
  if (coded?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'invalid_file', message: 'Faqat bitta mos fayl yuklang.' })
  }

  const message = formatUnknownError(err)
  console.error('[veltrix]', message)

  if (message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('resource_exhausted')) {
    return res.status(429).json({
      error: 'rate_limited',
      message: '⏳ Bepul AI limiti band. Birozdan keyin qayta urinib ko‘ring.',
    })
  }

  if (/jwt|token|session|unauthorized/i.test(message)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sessiya tugadi. Qayta kiring.' })
  }

  res.status(500).json({
    error: 'internal',
    message: '⚠️ Serverda xatolik. Birozdan keyin urinib ko‘ring.',
  })
}


function formatUnknownError(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) }
  catch { return Object.prototype.toString.call(value) }
}
