import { createClient } from '@supabase/supabase-js'
import { env } from '../config.js'

/** Service-role client. Bypasses RLS — every query MUST filter by user_id itself. */
export const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Verifies a user's access token and returns their id. */
export async function verifyToken(token: string): Promise<string | null> {
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
