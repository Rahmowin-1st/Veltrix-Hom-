import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { admin } from '../services/supabase.js'
import { requestContext, v1ErrorHandler } from './errors.js'
import { v1ProfileRouter } from './profile.js'
import { v1StorageRouter } from './storage.js'

type Result = { data?: any; error?: any }
type Call = [string, any]

type FakeQuery = {
  insertArgs: any[]
  updateArgs: any[]
  eqArgs: Call[]
  select: (...args: any[]) => FakeQuery
  eq: (column: string, value: any) => FakeQuery
  ilike: (...args: any[]) => FakeQuery
  is: (...args: any[]) => FakeQuery
  order: (...args: any[]) => FakeQuery
  limit: (...args: any[]) => FakeQuery
  neq: (...args: any[]) => FakeQuery
  lt: (...args: any[]) => FakeQuery
  in: (...args: any[]) => FakeQuery
  insert: (value: any) => FakeQuery
  update: (value: any) => FakeQuery
  delete: () => FakeQuery
  single: () => Promise<Result>
  maybeSingle: () => Promise<Result>
  then: Promise<Result>['then']
  catch: Promise<Result>['catch']
}

function fakeQuery(result: Result): FakeQuery {
  const promise = Promise.resolve(result)
  const q: any = {
    insertArgs: [], updateArgs: [], eqArgs: [],
    select: () => q,
    eq(column: string, value: any) { q.eqArgs.push([column, value]); return q },
    ilike: () => q,
    is: () => q,
    order: () => q,
    limit: () => q,
    neq: () => q,
    lt: () => q,
    in: () => q,
    insert(value: any) { q.insertArgs.push(value); return q },
    update(value: any) { q.updateArgs.push(value); return q },
    delete: () => q,
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

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = '22222222-2222-4222-8222-222222222222'
const ACCESS_TOKEN = 'part1-access-token-long-enough-for-authentication-0001'

function authQueues(extra: Record<string, FakeQuery[]> = {}) {
  const sessionRead = fakeQuery({ data: { id: SESSION_ID, account_id: ACCOUNT_ID, access_expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null }, error: null })
  const sessionTouch = fakeQuery({ data: null, error: null })
  const accountRead = fakeQuery({ data: { id: ACCOUNT_ID, status: 'active' }, error: null })
  return {
    vh_sessions: [sessionRead, sessionTouch, ...(extra.vh_sessions ?? [])],
    vh_accounts: [accountRead, ...(extra.vh_accounts ?? [])],
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'vh_sessions' && key !== 'vh_accounts')),
  }
}

async function withServer(run: (base: string) => Promise<void>) {
  const app = express()
  app.use(express.json())
  app.use(requestContext)
  app.use('/api/v1/profile', v1ProfileRouter)
  app.use('/api/v1/storage', v1StorageRouter)
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

function headers(json = true) {
  return { authorization: `Bearer ${ACCESS_TOKEN}`, ...(json ? { 'content-type': 'application/json' } : {}) }
}

let originalFrom: any
let originalRpc: any
let originalStorageFrom: any

beforeEach(() => {
  originalFrom = (admin as any).from
  originalRpc = (admin as any).rpc
  originalStorageFrom = (admin as any).storage.from
  ;(admin as any).rpc = vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 10, retry_after_seconds: 0 }, error: null })
})

afterEach(() => {
  ;(admin as any).from = originalFrom
  ;(admin as any).rpc = originalRpc
  ;(admin as any).storage.from = originalStorageFrom
  vi.restoreAllMocks()
})

describe('Part 1 onboarding and profile routes', () => {
  it('completes onboarding with required name, optional Class and one frozen avatar', async () => {
    const existingProfile = fakeQuery({ data: { identity_type: 'VELTRIX_AVATAR', photo_object_id: null, identity_revision: 4 }, error: null })
    const updateProfile = fakeQuery({ data: { account_id: ACCOUNT_ID, onboarding_state: 'COMPLETED', display_name: 'Shahboz', class_level: '9', avatar_id: 'wolf', identity_revision: 5 }, error: null })
    installQueues(authQueues({ vh_profiles: [existingProfile, updateProfile] }))
    await withServer(async base => {
      const response = await fetch(`${base}/api/v1/profile/onboarding`, { method: 'PUT', headers: headers(), body: JSON.stringify({ name: 'Shahboz', classLevel: '9', avatarId: 'wolf' }) })
      expect(response.status).toBe(200)
      const patch = updateProfile.updateArgs[0]
      expect(patch).toMatchObject({ display_name: 'Shahboz', class_level: '9', class_step_skipped: false, avatar_step_skipped: false, onboarding_state: 'COMPLETED', language: 'en', identity_type: 'VELTRIX_AVATAR', avatar_id: 'wolf', identity_revision: 5 })
      expect(patch.onboarding_completed_at).toBeTruthy()
    })
  })

  it('rejects ambiguous identity selection instead of silently choosing one', async () => {
    installQueues(authQueues())
    await withServer(async base => {
      const response = await fetch(`${base}/api/v1/profile/onboarding`, { method: 'PUT', headers: headers(), body: JSON.stringify({ name: 'User', avatarId: 'wolf', skipAvatar: true }) })
      expect(response.status).toBe(400)
      expect((await response.json() as any).error.code).toBe('VALIDATION_FAILED')
      expect((admin as any).from).toHaveBeenCalledTimes(3)
    })
  })

  it('creates a private owner-prefixed custom-photo upload ticket', async () => {
    const objectInsert = fakeQuery({ data: { id: '33333333-3333-4333-8333-333333333333' }, error: null })
    installQueues(authQueues({ vh_storage_objects: [objectInsert] }))
    const createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.invalid/upload', token: 'upload-token' }, error: null })
    ;(admin as any).storage.from = vi.fn((bucket: string) => {
      expect(bucket).toBe('vh-profile')
      return { createSignedUploadUrl }
    })
    await withServer(async base => {
      const response = await fetch(`${base}/api/v1/profile/photo/upload-ticket`, { method: 'POST', headers: headers(), body: JSON.stringify({ mimeType: 'image/webp', sizeBytes: 1024 }) })
      expect(response.status).toBe(201)
      const body: any = await response.json()
      expect(body.path.startsWith(`${ACCOUNT_ID}/`)).toBe(true)
      expect(body.path.endsWith('/original')).toBe(true)
      expect(objectInsert.insertArgs[0]).toMatchObject({ account_id: ACCOUNT_ID, bucket: 'vh-profile', kind: 'profile_photo', state: 'pending' })
      expect(createSignedUploadUrl).toHaveBeenCalledWith(body.path)
    })
  })

  it('commits photo crop metadata only through an owner-scoped object lookup', async () => {
    const objectRead = fakeQuery({ data: { id: '33333333-3333-4333-8333-333333333333', bucket: 'vh-profile', object_path: `${ACCOUNT_ID}/photo/original`, state: 'pending' }, error: null })
    const objectReady = fakeQuery({ data: null, error: null })
    const revisionRead = fakeQuery({ data: { identity_revision: 7 }, error: null })
    const profileUpdate = fakeQuery({ data: { identity_type: 'CUSTOM_PHOTO', photo_object_id: '33333333-3333-4333-8333-333333333333', identity_revision: 8 }, error: null })
    installQueues(authQueues({ vh_storage_objects: [objectRead, objectReady], vh_profiles: [revisionRead, profileUpdate] }))
    ;(admin as any).storage.from = vi.fn(() => ({ list: vi.fn().mockResolvedValue({ data: [{ name: 'original' }], error: null }) }))
    await withServer(async base => {
      const response = await fetch(`${base}/api/v1/profile/photo/commit`, { method: 'POST', headers: headers(), body: JSON.stringify({ objectId: '33333333-3333-4333-8333-333333333333', crop: { centerX: 0.4, centerY: 0.6, scale: 1.3, rotationDegrees: 12 } }) })
      expect(response.status).toBe(200)
      expect(objectRead.eqArgs).toContainEqual(['account_id', ACCOUNT_ID])
      expect(profileUpdate.updateArgs[0]).toMatchObject({ identity_type: 'CUSTOM_PHOTO', crop_center_x: 0.4, crop_center_y: 0.6, crop_scale: 1.3, crop_rotation_degrees: 12, onboarding_state: 'PROFILE_STARTED', identity_revision: 8 })
    })
  })
})

describe('Part 1 private Library route ownership and Trash', () => {
  it('requires the authenticated account in the signed-access object lookup', async () => {
    const objectRead = fakeQuery({ data: { id: '44444444-4444-4444-8444-444444444444', bucket: 'vh-library', object_path: `${ACCOUNT_ID}/doc/original`, state: 'ready', mime_type: 'application/pdf', size_bytes: 100 }, error: null })
    installQueues(authQueues({ vh_storage_objects: [objectRead] }))
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.invalid/read' }, error: null })
    ;(admin as any).storage.from = vi.fn((bucket: string) => {
      expect(bucket).toBe('vh-library')
      return { createSignedUrl }
    })
    await withServer(async base => {
      const response = await fetch(`${base}/api/v1/storage/library/44444444-4444-4444-8444-444444444444/access`, { headers: headers(false) })
      expect(response.status).toBe(200)
      expect(objectRead.eqArgs).toContainEqual(['account_id', ACCOUNT_ID])
      expect(objectRead.eqArgs).toContainEqual(['kind', 'library'])
      expect(createSignedUrl).toHaveBeenCalledWith(`${ACCOUNT_ID}/doc/original`, 60)
    })
  })

  it('does not sign a URL when the owner-scoped lookup cannot return an object', async () => {
    const deniedRead = fakeQuery({ data: null, error: { code: 'PGRST116', message: 'No rows' } })
    installQueues(authQueues({ vh_storage_objects: [deniedRead] }))
    const createSignedUrl = vi.fn()
    ;(admin as any).storage.from = vi.fn(() => ({ createSignedUrl }))
    await withServer(async base => {
      const response = await fetch(`${base}/api/v1/storage/library/44444444-4444-4444-8444-444444444444/access`, { headers: headers(false) })
      expect(response.status).toBe(500)
      expect((await response.json() as any).error.code).toBe('INTERNAL_ERROR')
      expect(deniedRead.eqArgs).toContainEqual(['account_id', ACCOUNT_ID])
      expect(createSignedUrl).not.toHaveBeenCalled()
    })
  })

  it('moves only an owner-scoped ready Library object into a 30-day recovery window', async () => {
    const trashUpdate = fakeQuery({ data: { id: '44444444-4444-4444-8444-444444444444' }, error: null })
    installQueues(authQueues({ vh_storage_objects: [trashUpdate] }))
    await withServer(async base => {
      const before = Date.now()
      const response = await fetch(`${base}/api/v1/storage/library/44444444-4444-4444-8444-444444444444`, { method: 'DELETE', headers: headers(false) })
      const after = Date.now()
      expect(response.status).toBe(200)
      expect(trashUpdate.eqArgs).toContainEqual(['account_id', ACCOUNT_ID])
      expect(trashUpdate.eqArgs).toContainEqual(['state', 'ready'])
      const patch = trashUpdate.updateArgs[0]
      expect(patch.state).toBe('trashed')
      const retentionMs = Date.parse(patch.purge_after) - Date.parse(patch.trashed_at)
      expect(retentionMs).toBe(30 * 24 * 60 * 60 * 1000)
      expect(Date.parse(patch.trashed_at)).toBeGreaterThanOrEqual(before)
      expect(Date.parse(patch.trashed_at)).toBeLessThanOrEqual(after)
    })
  })
})
