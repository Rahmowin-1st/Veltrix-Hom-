import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY .env faylida topilmadi.")
}
if (anonKey.startsWith('sb_secret_') || anonKey.includes('service_role')) {
  // Fail loudly rather than silently shipping a service-role key to every phone.
  throw new Error(
    'XAVFSIZLIK: VITE_SUPABASE_ANON_KEY ga maxfiy (secret/service_role) kalit yozilgan. ' +
      'Faqat publishable/anon kalit ishlatilsin.'
  )
}

export const isNative = Capacitor.isNativePlatform()

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // On native there is no URL to parse — the ID token arrives from the
    // Google Play Services dialog, not from a redirect.
    detectSessionInUrl: !isNative,
    flowType: 'pkce',
  },
})

let socialReady = false
async function ensureSocialLogin() {
  if (socialReady || !isNative) return
  await SocialLogin.initialize({
    google: { webClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID },
  })
  socialReady = true
}

/**
 * Google Sign-In: one call, two very different mechanisms underneath.
 *
 * NATIVE: the Android Google Play Services account picker opens directly —
 *   no browser, no redirect, no URL bar flash. It returns an ID token that
 *   Supabase exchanges for a session. This is the reason the app is Capacitor
 *   and not a TWA: a TWA cannot do this.
 *
 * WEB: standard OAuth redirect back to /auth/callback.
 */
export async function signInWithGoogle() {
  if (isNative) {
    await ensureSocialLogin()
    const result = await SocialLogin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'] },
    })

    const idToken = extractIdToken(result)
    if (!idToken) throw new Error('Google ID token olinmadi')

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    })
    if (error) throw error
    return
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
}

/** The plugin's payload shape varies between versions; read it defensively. */
function extractIdToken(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const outer = result as Record<string, unknown>
  const inner = (outer['result'] ?? outer) as Record<string, unknown>
  const token = inner['idToken'] ?? inner['id_token']
  return typeof token === 'string' ? token : null
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: isNative
        ? 'uz.veltrix.hom://auth/callback'
        : `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  // Capture the id before the session is torn down, so the local cache for
  // THIS account can be removed. Without it, the next account to sign in on
  // a shared device could briefly see the previous account's chats.
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id ?? null

  if (isNative) {
    try {
      await ensureSocialLogin()
      await SocialLogin.logout({ provider: 'google' })
    } catch {
      // Best-effort: the Supabase session is what actually gates the app.
    }
  }
  await supabase.auth.signOut()

  // Cloud data is deliberately left intact — signing back in restores it.
  if (userId) {
    const { purgeAccount } = await import('@/lib/cache')
    await purgeAccount(userId).catch(() => { /* cache is disposable */ })
  }
}

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error

  const session = data.session
  if (!session) return null
  const expiresSoon = (session.expires_at ?? 0) * 1000 - Date.now() < 60_000
  if (!forceRefresh && !expiresSoon) return session.access_token

  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error) throw refreshed.error
  return refreshed.data.session?.access_token ?? null
}
