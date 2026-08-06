import { env } from '../config.js'
import { admin } from './supabase.js'

/**
 * Per-user abuse bounds.
 *
 * OCR and chat both cost real money per call, so a runaway client (or a
 * malicious one) must not be able to spend an account's entire quota. The
 * counter lives in Postgres rather than process memory because Render can run
 * more than one instance and restarts constantly on the free tier — an
 * in-memory limiter would reset on every wake and enforce nothing.
 *
 * `bump_usage_counter` increments and checks in a single statement, so two
 * concurrent requests cannot both observe "under the limit" and slip past.
 */

export type Metric = 'ocr_pages' | 'chat_requests' | 'uploads'

const LIMITS: Record<Metric, () => number> = {
  ocr_pages: () => env.LIMIT_OCR_PAGES_PER_HOUR,
  chat_requests: () => env.LIMIT_CHAT_REQUESTS_PER_HOUR,
  uploads: () => env.LIMIT_UPLOADS_PER_HOUR,
}

const MESSAGES: Record<Metric, string> = {
  ocr_pages: 'Bu soatda juda ko‘p bet o‘qildi. Biroz kutib, qayta urinib ko‘ring.',
  chat_requests: 'Bu soatda juda ko‘p so‘rov yuborildi. Biroz kutib turing.',
  uploads: 'Bu soatda juda ko‘p fayl yuklandi. Biroz kutib turing.',
}

export interface LimitResult {
  allowed: boolean
  count: number
  limit: number
  message?: string
}

/**
 * Records one unit of usage and reports whether the user is still within
 * their hourly budget. Fails OPEN: if the counter itself errors we let the
 * request through rather than locking a paying user out of their own app.
 */
export async function checkLimit(userId: string, metric: Metric): Promise<LimitResult> {
  const limit = LIMITS[metric]()
  try {
    const { data, error } = await admin.rpc('bump_usage_counter', {
      p_user_id: userId,
      p_metric: metric,
      p_limit: limit,
      p_window_seconds: 3600,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    const allowed = row?.allowed !== false
    const count = Number(row?.current_count ?? 0)
    return allowed
      ? { allowed: true, count, limit }
      : { allowed: false, count, limit, message: MESSAGES[metric] }
  } catch (e) {
    console.error('[limits]', metric, e instanceof Error ? e.message : e)
    return { allowed: true, count: 0, limit }
  }
}
