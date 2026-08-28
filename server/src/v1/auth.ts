import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'
import { digestSecret, hashPassword, randomFourDigitCode, randomToken, safeEqualText, verifyPassword } from './crypto.js'

const router = Router()
const emailSchema = z.string().trim().email().max(320).transform(v => v.toLowerCase())
const passwordSchema = z.string().min(8).max(256)
const googleClaimsSchema = z.object({
  aud: z.string(),
  iss: z.string(),
  email_verified: z.string(),
  sub: z.string().min(1),
  email: z.string().email(),
})

const CODE_TTL_SECONDS = Number(process.env.AUTH_CODE_TTL_SECONDS ?? 600)
const CODE_RESEND_SECONDS = Number(process.env.AUTH_CODE_RESEND_SECONDS ?? 60)
const ACCESS_TTL_SECONDS = Number(process.env.AUTH_ACCESS_TTL_SECONDS ?? 3600)
const REFRESH_TTL_SECONDS = Number(process.env.AUTH_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 30)

type Account = {
  id: string
  email: string
  email_verified_at: string | null
  password_hash: string | null
  google_subject: string | null
  legacy_supabase_user_id: string | null
  status: 'active' | 'disabled' | 'deleted'
}

type CanonicalRequest = Request & { accountId?: string; canonicalSessionId?: string }

function nowIso(offsetSeconds = 0) { return new Date(Date.now() + offsetSeconds * 1000).toISOString() }
function hmacIp(req: Request) { return digestSecret(req.ip ?? 'unknown', 'auth-ip') }
function uaHash(req: Request) { return digestSecret(String(req.headers['user-agent'] ?? 'unknown').slice(0, 512), 'auth-ua') }

async function findAccount(email: string): Promise<Account | null> {
  const { data, error } = await admin.from('vh_accounts')
    .select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status')
    .ilike('email', email).maybeSingle()
  if (error) throw error
  return data as Account | null
}

async function ensureProfile(accountId: string) {
  const { error } = await admin.from('vh_profiles')
    .upsert({ account_id: accountId, language: 'en' }, { onConflict: 'account_id', ignoreDuplicates: true })
  if (error) throw error
}

async function onboardingRequired(accountId: string) {
  const { data, error } = await admin.from('vh_profiles').select('onboarding_completed_at').eq('account_id', accountId).single()
  if (error) throw error
  return !data.onboarding_completed_at
}

async function issueSession(accountId: string, req: Request, rotatedFrom?: string) {
  const accessToken = randomToken(32)
  const refreshToken = randomToken(48)
  const { data, error } = await admin.from('vh_sessions').insert({
    account_id: accountId,
    access_digest: digestSecret(accessToken, 'access-token'),
    refresh_digest: digestSecret(refreshToken, 'refresh-token'),
    access_expires_at: nowIso(ACCESS_TTL_SECONDS),
    refresh_expires_at: nowIso(REFRESH_TTL_SECONDS),
    rotated_from: rotatedFrom ?? null,
    user_agent_hash: uaHash(req),
  }).select('id').single()
  if (error) throw error
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: ACCESS_TTL_SECONDS,
    refreshExpiresIn: REFRESH_TTL_SECONDS,
    sessionId: String(data.id),
  }
}

async function consumeLimit(bucketKey: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc('vh_consume_rate_limit', {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.allowed) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts.', {
      retryAfterSeconds: row?.retry_after_seconds ?? windowSeconds,
    })
  }
}

async function sendCode(email: string, code: string) {
  if (process.env.APP_ENV === 'test') return { testCode: code }
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.AUTH_CODE_FROM_EMAIL
  if (!apiKey || !from) throw new ApiError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Email code delivery is not configured.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Veltrix Hom code',
      text: `Your Veltrix Hom verification code is ${code}. It expires in ${Math.ceil(CODE_TTL_SECONDS / 60)} minutes.`,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ApiError(503, 'EMAIL_DELIVERY_FAILED', 'The verification code could not be delivered.')
  return {}
}

async function verifyGoogleToken(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new ApiError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google sign-in is not configured.')
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Google identity could not be verified.')
  const parsed = googleClaimsSchema.safeParse(await response.json())
  if (!parsed.success) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Google identity could not be verified.')
  const claims = parsed.data
  if (
    claims.aud !== clientId ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    claims.email_verified !== 'true'
  ) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Google identity could not be verified.')
  return { sub: claims.sub, email: emailSchema.parse(claims.email) }
}

export async function canonicalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    const { data, error } = await admin.from('vh_sessions')
      .select('id,account_id,access_expires_at,revoked_at')
      .eq('access_digest', digestSecret(token, 'access-token')).maybeSingle()
    if (error) throw error
    if (!data || data.revoked_at || Date.parse(data.access_expires_at) <= Date.now()) {
      throw new ApiError(401, 'SESSION_INVALID', 'The session is invalid or expired.')
    }
    const { data: account, error: accountError } = await admin.from('vh_accounts')
      .select('id,status').eq('id', data.account_id).single()
    if (accountError) throw accountError
    if (account.status !== 'active') throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'The account is unavailable.')
    ;(req as CanonicalRequest).accountId = data.account_id
    ;(req as CanonicalRequest).canonicalSessionId = data.id
    void admin.from('vh_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id)
    next()
  } catch (error) { next(error) }
}

router.post('/google', async (req, res, next) => {
  try {
    await consumeLimit(`google:${hmacIp(req)}`, 20, 600)
    const { idToken } = z.object({ idToken: z.string().min(20).max(10000) }).parse(req.body)
    const google = await verifyGoogleToken(idToken)
    let account = await findAccount(google.email)
    if (account?.google_subject && account.google_subject !== google.sub) {
      throw new ApiError(409, 'IDENTITY_CONFLICT', 'This email is linked to another identity.')
    }
    if (!account) {
      const { data, error } = await admin.from('vh_accounts').insert({
        email: google.email,
        email_verified_at: new Date().toISOString(),
        google_subject: google.sub,
      }).select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status').single()
      if (error) throw error
      account = data as Account
    } else if (!account.google_subject) {
      const { data, error } = await admin.from('vh_accounts').update({
        google_subject: google.sub,
        email_verified_at: account.email_verified_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', account.id).select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status').single()
      if (error) throw error
      account = data as Account
    }
    if (account.status !== 'active') throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'The account is unavailable.')
    await ensureProfile(account.id)
    res.json({
      accountId: account.id,
      email: account.email,
      onboardingRequired: await onboardingRequired(account.id),
      session: await issueSession(account.id, req),
    })
  } catch (error) { next(error) }
})

router.post('/password', async (req, res, next) => {
  try {
    await consumeLimit(`password:${hmacIp(req)}`, 20, 600)
    const parsed = z.object({ email: emailSchema, password: passwordSchema }).parse(req.body)
    let account = await findAccount(parsed.email)
    if (account?.password_hash) {
      if (!(await verifyPassword(parsed.password, account.password_hash))) {
        throw new ApiError(401, 'CREDENTIALS_INVALID', 'Email or password is incorrect.')
      }
    } else {
      const { data: legacy, error: legacyError } = await admin.auth.signInWithPassword({
        email: parsed.email,
        password: parsed.password,
      })
      if (legacyError || !legacy.user) {
        if (!account) return res.status(202).json({ codeRequired: true, next: 'request_code' })
        throw new ApiError(401, 'CREDENTIALS_INVALID', 'Email or password is incorrect.')
      }
      const passwordHash = await hashPassword(parsed.password)
      if (!account) {
        const { data, error } = await admin.from('vh_accounts').insert({
          email: parsed.email,
          email_verified_at: new Date().toISOString(),
          password_hash: passwordHash,
          legacy_supabase_user_id: legacy.user.id,
        }).select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status').single()
        if (error) throw error
        account = data as Account
      } else {
        const { data, error } = await admin.from('vh_accounts').update({
          password_hash: passwordHash,
          legacy_supabase_user_id: legacy.user.id,
          email_verified_at: account.email_verified_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', account.id).select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status').single()
        if (error) throw error
        account = data as Account
      }
    }
    if (!account || account.status !== 'active') throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'The account is unavailable.')
    await ensureProfile(account.id)
    res.json({
      accountId: account.id,
      email: account.email,
      onboardingRequired: await onboardingRequired(account.id),
      session: await issueSession(account.id, req),
    })
  } catch (error) { next(error) }
})

router.post('/code/request', async (req, res, next) => {
  try {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await consumeLimit(`code-ip:${hmacIp(req)}`, 10, 600)
    await consumeLimit(`code-email:${digestSecret(email, 'rate-email')}`, 5, 600)
    const account = await findAccount(email)
    const purpose = account ? 'login' : 'create_account'
    const { data: latest, error: latestError } = await admin.from('vh_email_codes')
      .select('resend_after').ilike('email', email).is('consumed_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (latestError) throw latestError
    if (latest && Date.parse(latest.resend_after) > Date.now()) {
      throw new ApiError(429, 'CODE_COOLDOWN', 'A code was sent recently.', {
        retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(latest.resend_after) - Date.now()) / 1000)),
      })
    }
    const code = randomFourDigitCode()
    const { data: inserted, error } = await admin.from('vh_email_codes').insert({
      email,
      purpose,
      code_digest: digestSecret(`${email}:${purpose}:${code}`, 'email-code'),
      expires_at: nowIso(CODE_TTL_SECONDS),
      resend_after: nowIso(CODE_RESEND_SECONDS),
      request_ip_hash: hmacIp(req),
      request_id: String(res.locals.requestId ?? ''),
    }).select('id').single()
    if (error) throw error
    try {
      const delivery = await sendCode(email, code)
      res.status(202).json({ delivered: true, expiresIn: CODE_TTL_SECONDS, resendAfter: CODE_RESEND_SECONDS, ...delivery })
    } catch (deliveryError) {
      await admin.from('vh_email_codes').update({ consumed_at: new Date().toISOString() }).eq('id', inserted.id)
      throw deliveryError
    }
  } catch (error) { next(error) }
})

router.post('/code/verify', async (req, res, next) => {
  try {
    await consumeLimit(`verify:${hmacIp(req)}`, 30, 600)
    const parsed = z.object({
      email: emailSchema,
      code: z.string().regex(/^\d{4}$/),
      password: passwordSchema.optional(),
    }).parse(req.body)
    const { data: record, error } = await admin.from('vh_email_codes')
      .select('id,purpose,code_digest,expires_at,attempts,max_attempts')
      .ilike('email', parsed.email).is('consumed_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!record || Date.parse(record.expires_at) <= Date.now()) {
      throw new ApiError(401, 'CODE_INVALID', 'The code is invalid or expired.')
    }
    if (record.attempts >= record.max_attempts) {
      throw new ApiError(429, 'CODE_ATTEMPTS_EXHAUSTED', 'Too many invalid code attempts.')
    }
    const supplied = digestSecret(`${parsed.email}:${record.purpose}:${parsed.code}`, 'email-code')
    if (!safeEqualText(supplied, record.code_digest)) {
      await admin.from('vh_email_codes').update({ attempts: record.attempts + 1 }).eq('id', record.id)
      throw new ApiError(401, 'CODE_INVALID', 'The code is invalid or expired.')
    }
    const consumedAt = new Date().toISOString()
    const { data: consumed, error: consumeError } = await admin.from('vh_email_codes')
      .update({ consumed_at: consumedAt, attempts: record.attempts + 1 })
      .eq('id', record.id).is('consumed_at', null).select('id').maybeSingle()
    if (consumeError) throw consumeError
    if (!consumed) throw new ApiError(409, 'CODE_ALREADY_USED', 'The code has already been used.')

    let account = await findAccount(parsed.email)
    if (!account) {
      const { data, error: createError } = await admin.from('vh_accounts').insert({
        email: parsed.email,
        email_verified_at: consumedAt,
        password_hash: parsed.password ? await hashPassword(parsed.password) : null,
      }).select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status').single()
      if (createError) throw createError
      account = data as Account
    } else if (parsed.password && !account.password_hash) {
      const { data, error: updateError } = await admin.from('vh_accounts').update({
        password_hash: await hashPassword(parsed.password),
        email_verified_at: account.email_verified_at ?? consumedAt,
        updated_at: consumedAt,
      }).eq('id', account.id).select('id,email,email_verified_at,password_hash,google_subject,legacy_supabase_user_id,status').single()
      if (updateError) throw updateError
      account = data as Account
    }
    if (account.status !== 'active') throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'The account is unavailable.')
    await ensureProfile(account.id)
    res.json({
      accountId: account.id,
      email: account.email,
      onboardingRequired: await onboardingRequired(account.id),
      session: await issueSession(account.id, req),
    })
  } catch (error) { next(error) }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(20).max(500) }).parse(req.body)
    const { data: existing, error } = await admin.from('vh_sessions')
      .select('id,account_id,refresh_expires_at,revoked_at')
      .eq('refresh_digest', digestSecret(refreshToken, 'refresh-token')).maybeSingle()
    if (error) throw error
    if (!existing || existing.revoked_at || Date.parse(existing.refresh_expires_at) <= Date.now()) {
      throw new ApiError(401, 'REFRESH_INVALID', 'The refresh session is invalid or expired.')
    }
    const revokedAt = new Date().toISOString()
    const { data: revoked, error: revokeError } = await admin.from('vh_sessions')
      .update({ revoked_at: revokedAt }).eq('id', existing.id).is('revoked_at', null)
      .select('id').maybeSingle()
    if (revokeError) throw revokeError
    if (!revoked) throw new ApiError(409, 'REFRESH_ALREADY_USED', 'The refresh session was already rotated.')
    res.json({ session: await issueSession(existing.account_id, req, existing.id) })
  } catch (error) { next(error) }
})

router.post('/logout', canonicalAuth, async (req, res, next) => {
  try {
    const sessionId = (req as CanonicalRequest).canonicalSessionId!
    const { error } = await admin.from('vh_sessions')
      .update({ revoked_at: new Date().toISOString() }).eq('id', sessionId)
    if (error) throw error
    res.status(204).end()
  } catch (error) { next(error) }
})

export { router as v1AuthRouter }
