import { createClient } from '@supabase/supabase-js'
import {
  env,
  SUPABASE_ADMIN_KEY,
  SUPABASE_ADMIN_KEY_FINGERPRINT,
  SUPABASE_ADMIN_KEY_KIND,
  SUPABASE_PROJECT_REF,
} from '../config.js'

/**
 * Compatibility fetch for modern opaque `sb_secret_*` keys.
 * Older supabase-js releases mirror the API key into `Authorization: Bearer`.
 * Opaque keys are not JWTs, so remove only that SDK-generated fallback while
 * keeping the `apikey` header. Real user access tokens are never touched.
 */
const adminFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))

  headers.set('apikey', SUPABASE_ADMIN_KEY)
  const authorization = headers.get('authorization')
  if (
    SUPABASE_ADMIN_KEY.startsWith('sb_secret_') &&
    authorization === `Bearer ${SUPABASE_ADMIN_KEY}`
  ) {
    headers.delete('authorization')
  }

  return fetch(input, { ...init, headers })
}

/** Service/secret client. Bypasses RLS — every query MUST filter by user_id itself. */
export const admin = createClient(env.SUPABASE_URL, SUPABASE_ADMIN_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { fetch: adminFetch },
})

export interface SupabaseDiagnostic {
  ok: boolean
  project_ref: string
  key_kind: string
  key_fingerprint: string
  latency_ms: number
  error?: string
  action?: string
}

export function explainSupabaseError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('unregistered api key')) {
    return (
      'SUPABASE_URL va admin key mos emas, key o‘chirilgan yoki eski supabase-js ishlatilgan. ' +
      'Render’da shu projectning SUPABASE_SECRET_KEY (sb_secret_*) yoki legacy service_role kalitini saqlang.'
    )
  }
  if (normalized.includes('invalid jwt') || normalized.includes('jwt')) {
    return 'Admin kalit o‘rniga publishable/anon key qo‘yilgan yoki legacy JWT buzilgan.'
  }
  if (normalized.includes('claim_processing_job') || normalized.includes('does not exist')) {
    return 'Database migration-010 va migration-011 to‘liq ishlatilmagan. Avval fixed migratsiyalarni run qiling.'
  }
  if (normalized.includes('fetch failed') || normalized.includes('enotfound')) {
    return 'SUPABASE_URL noto‘g‘ri yoki Render Supabase hostiga ulana olmayapti.'
  }
  return 'Render environment va Supabase project sozlamalarini tekshiring.'
}

/**
 * Non-destructive dependency probe used at startup and by /health/dependencies.
 * It never returns or logs the raw API key.
 */
export async function checkSupabaseAdminConnection(): Promise<SupabaseDiagnostic> {
  const started = Date.now()
  const { error } = await admin
    .from('processing_jobs')
    .select('id', { count: 'exact', head: true })
    .limit(1)

  if (error) {
    return {
      ok: false,
      project_ref: SUPABASE_PROJECT_REF,
      key_kind: SUPABASE_ADMIN_KEY_KIND,
      key_fingerprint: SUPABASE_ADMIN_KEY_FINGERPRINT,
      latency_ms: Date.now() - started,
      error: error.message,
      action: explainSupabaseError(error.message),
    }
  }

  return {
    ok: true,
    project_ref: SUPABASE_PROJECT_REF,
    key_kind: SUPABASE_ADMIN_KEY_KIND,
    key_fingerprint: SUPABASE_ADMIN_KEY_FINGERPRINT,
    latency_ms: Date.now() - started,
  }
}

/** Verifies a user's access token and returns their id. */
export async function verifyToken(token: string): Promise<string | null> {
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
