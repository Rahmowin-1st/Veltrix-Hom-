import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'

export const activityRouter = Router()

activityRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data, error } = await admin.rpc('get_activity_summary', { p_user_id: userId })
    if (error) throw error
    res.json(data ?? {
      weekPoints: 0, monthPoints: 0, bestDayPoints: 0,
      activeLast3: 0, activeLast30: 0, days: [],
    })
  } catch (e) { next(e) }
})


activityRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      kind: z.enum(['homework_done','source_used','skill_used','game_completed']),
      points: z.number().int().min(1).max(500).default(1),
      metadata: z.record(z.unknown()).default({}),
    }).parse(req.body)
    const { error } = await admin.from('activity_events').insert({
      user_id: req.userId!, kind: input.kind, points: input.points, metadata: input.metadata,
    })
    if (error) throw error
    res.status(201).json({ ok: true })
  } catch (e) { next(e) }
})
