import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { admin } from '../services/supabase.js'
import { digestSecret, hashPassword } from './crypto.js'
import { requestContext, v1ErrorHandler } from './errors.js'
import { v1AuthRouter } from './auth.js'

type Result = { data?: any; error?: any }

type FakeQuery = {
  insertArgs: any[]
  updateArgs: any[]
  upsertArgs: any[]
  select: (...args: any[]) => FakeQuery
  eq: (...args: any[]) => FakeQuery
  ilike: (...args: any[]) => FakeQuery
  is: (...args: any[]) => FakeQuery
  order: (...args: any[]) => FakeQuery
  limit: (...args: any[]) => FakeQuery
  neq: (...args: any[]) => FakeQuery
  insert: (value: any) => FakeQuery
  update: (value: any) => FakeQuery
  upsert: (value: any, options?: any) => FakeQuery
  single: () => Promise<Result>
  maybeSingle: () => Promise<Result>
  then: Promise<Result>['then']
  catch: Promise<Result>['catch']
}

function fakeQuery(result: Result): FakeQuery {
  const promise = Promise.resolve(result)
  const q: any = {
    insertArgs: [], updateArgs: [], upsertArgs: [],
    select: () => q,
    eq: () => q,
    ilike: () => q,
    is: () => q,
    order: () => q,
    limit: () => q,
    neq: () => q,
    insert(value: any) { q.insertArgs.push(value); return q },
    update(value: any) { q.updateArgs.push(value); return q },
    upsert(value: any, options?: any) { q.upsertArgs.push([value, options]); return q },
    single: () => promise,
    maybeSingle: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  return q
}

function installQueues(queues: Record<string, FakeQuery[]>) {
  ;(admin as any).from = vi.fn((table: string) => {
    const next = queues[table]?.shift()
    if (!next) throw new Error(`Unexpected table call: ${table}`)
    return next
  })
}

async function withServer(run: (base: string) => Promise<void>) {
  const app = express()
  app.use(express.json())
  app.use(requestContext)
  app.use('/api/v1/auth', v1AuthRouter)
  app.use(v1ErrorHandler)
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  try {
    const address = server.address() as AddressInfo
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

const realFetch = globalThis.fetch
let originalFrom: any
let originalRpc: any
let originalLegacyPassword: any

beforeEach(() => {
  originalFrom = (admin as any).from
  originalRpc = (admin as any).rpc
  originalLegacyPassword = (admin as any).auth.signInWithPassword
  ;(admin as any).rpc = vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 10, retry_after_seconds: 0 }, error: null })
})

afterEach(() => {
  ;(admin as any).from = originalFrom
  ;(admin as any).rpc = originalRpc
  ;(admin as any).auth.signInWithPassword = originalLegacyPassword
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('Part 1 auth HTTP contract', () => {
  it('logs in an existing canonical password account and stores only session digests', async () => {
    const password = 'Correct-Horse-42!'
    const passwordHash = await hashPassword(password)
    const account = { id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', email_verified_at: new Date().toISOString(), password_hash: passwordHash, google_subject: null, legacy_supabase_user_id: null, status: 'active' }
    const accountQ = fakeQuery({ data: account, error: null })
    const profileUpsertQ = fakeQuery({ data: null, error: null })
    const profileReadQ = fakeQuery({ data: { onboarding_completed_at: null }, error: null })
    const sessionQ = fakeQuery({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null })
    installQueues({ vh_accounts: [accountQ], vh_profiles: [profileUpsertQ, profileReadQ], vh_sessions: [sessionQ] })

    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'USER@example.com', password }) })
      expect(response.status).toBe(200)
      const body: any = await response.json()
      expect(body.accountId).toBe(account.id)
      expect(body.onboardingRequired).toBe(true)
      expect(body.session.accessToken).toBeTruthy()
      expect(body.session.refreshToken).toBeTruthy()
      const inserted = sessionQ.insertArgs[0]
      expect(inserted.access_digest).toBe(digestSecret(body.session.accessToken, 'access-token'))
      expect(inserted.refresh_digest).toBe(digestSecret(body.session.refreshToken, 'refresh-token'))
      expect(JSON.stringify(inserted)).not.toContain(body.session.accessToken)
      expect(JSON.stringify(inserted)).not.toContain(body.session.refreshToken)
    })
  })

  it('rejects a wrong canonical password without issuing a session', async () => {
    const passwordHash = await hashPassword('Correct-Horse-42!')
    installQueues({
      vh_accounts: [fakeQuery({ data: { id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', email_verified_at: null, password_hash: passwordHash, google_subject: null, legacy_supabase_user_id: null, status: 'active' }, error: null })],
    })
    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'user@example.com', password: 'Definitely-Wrong-42!' }) })
      expect(response.status).toBe(401)
      expect((await response.json() as any).error.code).toBe('CREDENTIALS_INVALID')
      expect((admin as any).from).toHaveBeenCalledTimes(1)
    })
  })

  it('unknown password entry never creates an unverified account', async () => {
    installQueues({ vh_accounts: [fakeQuery({ data: null, error: null })] })
    ;(admin as any).auth.signInWithPassword = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.com', password: 'New-Password-42!' }) })
      expect(response.status).toBe(202)
      expect(await response.json()).toMatchObject({ codeRequired: true, next: 'request_code' })
      expect((admin as any).from).toHaveBeenCalledTimes(1)
    })
  })

  it('requests a four-digit code, persists only its digest, and enforces cooldown metadata', async () => {
    const accountQ = fakeQuery({ data: null, error: null })
    const latestQ = fakeQuery({ data: null, error: null })
    const insertQ = fakeQuery({ data: { id: '33333333-3333-4333-8333-333333333333' }, error: null })
    installQueues({ vh_accounts: [accountQ], vh_email_codes: [latestQ, insertQ] })
    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/code/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.com' }) })
      expect(response.status).toBe(202)
      const body: any = await response.json()
      expect(body.testCode).toMatch(/^\d{4}$/)
      expect(body.expiresIn).toBeGreaterThan(0)
      expect(body.resendAfter).toBeGreaterThan(0)
      const inserted = insertQ.insertArgs[0]
      expect(inserted.purpose).toBe('create_account')
      expect(inserted.code_digest).toBe(digestSecret(`new@example.com:create_account:${body.testCode}`, 'email-code'))
      expect(JSON.stringify(inserted)).not.toContain(`"code":"${body.testCode}"`)
      expect(inserted.expires_at).toBeTruthy()
      expect(inserted.resend_after).toBeTruthy()
    })
  })

  it('verifies a fresh code once, creates the account, and requires onboarding', async () => {
    const email = 'new@example.com'
    const code = '0042'
    const recordQ = fakeQuery({ data: { id: '33333333-3333-4333-8333-333333333333', purpose: 'create_account', code_digest: digestSecret(`${email}:create_account:${code}`, 'email-code'), expires_at: new Date(Date.now() + 60_000).toISOString(), attempts: 0, max_attempts: 5 }, error: null })
    const consumeQ = fakeQuery({ data: { id: '33333333-3333-4333-8333-333333333333' }, error: null })
    const findQ = fakeQuery({ data: null, error: null })
    const createQ = fakeQuery({ data: { id: '11111111-1111-4111-8111-111111111111', email, email_verified_at: new Date().toISOString(), password_hash: null, google_subject: null, legacy_supabase_user_id: null, status: 'active' }, error: null })
    const profileUpsertQ = fakeQuery({ data: null, error: null })
    const profileReadQ = fakeQuery({ data: { onboarding_completed_at: null }, error: null })
    const sessionQ = fakeQuery({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null })
    installQueues({ vh_email_codes: [recordQ, consumeQ], vh_accounts: [findQ, createQ], vh_profiles: [profileUpsertQ, profileReadQ], vh_sessions: [sessionQ] })

    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/code/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) })
      expect(response.status).toBe(200)
      const body: any = await response.json()
      expect(body.accountId).toBe('11111111-1111-4111-8111-111111111111')
      expect(body.onboardingRequired).toBe(true)
      expect(consumeQ.updateArgs[0].consumed_at).toBeTruthy()
    })
  })

  it('rejects expired and already-consumed code races', async () => {
    const email = 'user@example.com'
    const code = '1234'
    installQueues({ vh_email_codes: [fakeQuery({ data: { id: '33333333-3333-4333-8333-333333333333', purpose: 'login', code_digest: digestSecret(`${email}:login:${code}`, 'email-code'), expires_at: new Date(Date.now() - 1_000).toISOString(), attempts: 0, max_attempts: 5 }, error: null })] })
    await withServer(async base => {
      const expired = await realFetch(`${base}/api/v1/auth/code/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) })
      expect(expired.status).toBe(401)
      expect((await expired.json() as any).error.code).toBe('CODE_INVALID')
    })

    const recordQ = fakeQuery({ data: { id: '44444444-4444-4444-8444-444444444444', purpose: 'login', code_digest: digestSecret(`${email}:login:${code}`, 'email-code'), expires_at: new Date(Date.now() + 60_000).toISOString(), attempts: 0, max_attempts: 5 }, error: null })
    const lostRaceQ = fakeQuery({ data: null, error: null })
    installQueues({ vh_email_codes: [recordQ, lostRaceQ] })
    await withServer(async base => {
      const reused = await realFetch(`${base}/api/v1/auth/code/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) })
      expect(reused.status).toBe(409)
      expect((await reused.json() as any).error.code).toBe('CODE_ALREADY_USED')
    })
  })

  it('rotates refresh sessions and makes the previous refresh token single-use', async () => {
    const oldRefresh = 'old-refresh-token-that-is-long-enough-for-validation-0001'
    const existingQ = fakeQuery({ data: { id: '22222222-2222-4222-8222-222222222222', account_id: '11111111-1111-4111-8111-111111111111', refresh_expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null }, error: null })
    const revokeQ = fakeQuery({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null })
    const newSessionQ = fakeQuery({ data: { id: '55555555-5555-4555-8555-555555555555' }, error: null })
    installQueues({ vh_sessions: [existingQ, revokeQ, newSessionQ] })
    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: oldRefresh }) })
      expect(response.status).toBe(200)
      const inserted = newSessionQ.insertArgs[0]
      expect(inserted.rotated_from).toBe('22222222-2222-4222-8222-222222222222')
      expect(revokeQ.updateArgs[0].revoked_at).toBeTruthy()
    })
  })

  it('revokes the authenticated session on logout', async () => {
    const accessToken = 'access-token-that-is-long-enough-for-validation-0001'
    const sessionReadQ = fakeQuery({ data: { id: '22222222-2222-4222-8222-222222222222', account_id: '11111111-1111-4111-8111-111111111111', access_expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null }, error: null })
    const accountReadQ = fakeQuery({ data: { id: '11111111-1111-4111-8111-111111111111', status: 'active' }, error: null })
    const touchQ = fakeQuery({ data: null, error: null })
    const revokeQ = fakeQuery({ data: null, error: null })
    installQueues({ vh_sessions: [sessionReadQ, touchQ, revokeQ], vh_accounts: [accountReadQ] })
    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } })
      expect(response.status).toBe(204)
      expect(revokeQ.updateArgs[0].revoked_at).toBeTruthy()
    })
  })

  it('accepts only a valid Google audience/issuer/verified-email token and never imports Google profile fields', async () => {
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
        return new Response(JSON.stringify({ aud: 'ci-client-id.apps.googleusercontent.com', iss: 'https://accounts.google.com', email_verified: 'true', sub: 'google-sub-123', email: 'google@example.com', name: 'Must Not Import', picture: 'https://example.invalid/p.png' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return realFetch(input, init)
    }) as any
    const findQ = fakeQuery({ data: null, error: null })
    const createQ = fakeQuery({ data: { id: '11111111-1111-4111-8111-111111111111', email: 'google@example.com', email_verified_at: new Date().toISOString(), password_hash: null, google_subject: 'google-sub-123', legacy_supabase_user_id: null, status: 'active' }, error: null })
    const profileUpsertQ = fakeQuery({ data: null, error: null })
    const profileReadQ = fakeQuery({ data: { onboarding_completed_at: null }, error: null })
    const sessionQ = fakeQuery({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null })
    installQueues({ vh_accounts: [findQ, createQ], vh_profiles: [profileUpsertQ, profileReadQ], vh_sessions: [sessionQ] })
    await withServer(async base => {
      const response = await realFetch(`${base}/api/v1/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'google-id-token-long-enough-1234567890' }) })
      expect(response.status).toBe(200)
      const inserted = createQ.insertArgs[0]
      expect(inserted).toMatchObject({ email: 'google@example.com', google_subject: 'google-sub-123' })
      expect(inserted).not.toHaveProperty('display_name')
      expect(inserted).not.toHaveProperty('photo')
      expect(profileUpsertQ.upsertArgs[0][0]).toEqual({ account_id: '11111111-1111-4111-8111-111111111111', language: 'en' })
    })
  })
})
