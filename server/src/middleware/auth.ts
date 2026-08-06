import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../services/supabase.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { userId?: string }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'auth_required', message: 'Tizimga kiring.' })
  }
  const userId = await verifyToken(token)
  if (!userId) {
    return res.status(401).json({ error: 'invalid_token', message: 'Sessiya tugagan. Qayta kiring.' })
  }
  req.userId = userId
  next()
}
