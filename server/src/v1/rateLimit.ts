import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'

export async function consumeRateLimit(bucketKey: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc('vh_consume_rate_limit', {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.allowed) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests.', {
      retryAfterSeconds: row?.retry_after_seconds ?? windowSeconds,
    })
  }
  return {
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
  }
}

export const RATE_LIMIT_DEFAULTS = {
  authPassword: { limit: 20, windowSeconds: 600 },
  codeSendIp: { limit: 10, windowSeconds: 600 },
  codeSendEmail: { limit: 5, windowSeconds: 600 },
  codeVerify: { limit: 30, windowSeconds: 600 },
  ai: { limit: 60, windowSeconds: 60 },
  upload: { limit: 30, windowSeconds: 3600 },
  search: { limit: 120, windowSeconds: 60 },
  heavyJob: { limit: 10, windowSeconds: 3600 },
} as const
