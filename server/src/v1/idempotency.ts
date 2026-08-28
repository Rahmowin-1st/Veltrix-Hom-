import { createHash } from 'node:crypto'
import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'

export type IdempotencyReplay = { status: number; body: unknown } | null

export function requestFingerprint(method: string, route: string, body: unknown) {
  return createHash('sha256').update(`${method.toUpperCase()}\n${route}\n${JSON.stringify(body ?? null)}`).digest('hex')
}

export async function beginIdempotency(accountId: string, route: string, key: string, requestHash: string): Promise<IdempotencyReplay> {
  if (key.length < 8 || key.length > 200) throw new ApiError(400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must be 8 to 200 characters.')
  const { error } = await admin.from('vh_idempotency').insert({
    account_id: accountId,
    route,
    idempotency_key: key,
    request_hash: requestHash,
    state: 'started',
  })
  if (!error) return null
  if (error.code !== '23505') throw error
  const { data: existing, error: readError } = await admin.from('vh_idempotency')
    .select('request_hash,state,response_status,response_body,expires_at')
    .eq('account_id', accountId).eq('route', route).eq('idempotency_key', key).single()
  if (readError) throw readError
  if (existing.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.')
  if (Date.parse(existing.expires_at) <= Date.now()) throw new ApiError(409, 'IDEMPOTENCY_EXPIRED', 'This idempotency record expired. Use a new key.')
  if (existing.state === 'completed' && existing.response_status != null) {
    return { status: Number(existing.response_status), body: existing.response_body }
  }
  throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'An identical request is already in progress.')
}

export async function completeIdempotency(accountId: string, route: string, key: string, status: number, body: unknown) {
  const { error } = await admin.from('vh_idempotency').update({
    state: 'completed', response_status: status, response_body: body, updated_at: new Date().toISOString(),
  }).eq('account_id', accountId).eq('route', route).eq('idempotency_key', key).eq('state', 'started')
  if (error) throw error
}

export async function failIdempotency(accountId: string, route: string, key: string) {
  const { error } = await admin.from('vh_idempotency').update({
    state: 'failed', updated_at: new Date().toISOString(),
  }).eq('account_id', accountId).eq('route', route).eq('idempotency_key', key).eq('state', 'started')
  if (error) throw error
}
