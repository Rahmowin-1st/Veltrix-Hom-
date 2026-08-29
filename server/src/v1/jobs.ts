import { randomUUID } from 'node:crypto'
import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'

export type CanonicalJob = {
  id: string
  account_id: string | null
  kind: string
  payload: unknown
  state: 'queued' | 'running' | 'retry' | 'succeeded' | 'failed' | 'cancelled'
  attempts: number
  max_attempts: number
  progress: number | null
  idempotency_key: string | null
  checkpoint: unknown
  provenance: Record<string, unknown>
}

export type JobHandlerContext = {
  job: CanonicalJob
  checkpoint(value: unknown, progress?: number): Promise<void>
  signal: AbortSignal
}

export type JobHandler = (context: JobHandlerContext) => Promise<{ result?: unknown; resultRef?: string }>

const handlers = new Map<string, JobHandler>()

export const CANONICAL_JOB_LEASE_SECONDS = 60
export const CANONICAL_JOB_HEARTBEAT_MS = 20_000

export function registerJobHandler(kind: string, handler: JobHandler) {
  if (!/^[a-z][a-z0-9_.-]{2,80}$/.test(kind)) throw new Error('invalid_job_kind')
  if (handlers.has(kind)) throw new Error(`duplicate_job_handler:${kind}`)
  handlers.set(kind, handler)
}

export function registeredJobKinds() { return [...handlers.keys()].sort() }

export async function enqueueJob(input: {
  accountId: string
  kind: string
  payload?: unknown
  inputRef?: string
  idempotencyKey?: string
  maxAttempts?: number
  provenance?: Record<string, unknown>
}) {
  if (!handlers.has(input.kind)) throw new ApiError(422, 'JOB_KIND_UNAVAILABLE', 'This job type is not registered in the current backend.')
  const row = {
    account_id: input.accountId,
    kind: input.kind,
    payload: input.payload ?? {},
    input_ref: input.inputRef ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    max_attempts: input.maxAttempts ?? 5,
    provenance: input.provenance ?? {},
    state: 'queued',
  }
  const { data, error } = await admin.from('vh_jobs').insert(row).select('*').single()
  if (!error) return data as CanonicalJob
  if (error.code === '23505' && input.idempotencyKey) {
    const { data: existing, error: existingError } = await admin.from('vh_jobs')
      .select('*').eq('account_id', input.accountId).eq('kind', input.kind).eq('idempotency_key', input.idempotencyKey).single()
    if (existingError) throw existingError
    return existing as CanonicalJob
  }
  throw error
}

export async function claimJob(workerId: string, leaseSeconds = CANONICAL_JOB_LEASE_SECONDS): Promise<CanonicalJob | null> {
  const { data, error } = await admin.rpc('vh_claim_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  const startedAt = row.started_at ?? new Date().toISOString()
  await admin.from('vh_jobs').update({ started_at: startedAt, progress: row.progress ?? 0, updated_at: new Date().toISOString() }).eq('id', row.id)
  return { ...row, started_at: startedAt } as CanonicalJob
}

export async function renewJobLease(jobId: string, workerId: string, leaseSeconds = CANONICAL_JOB_LEASE_SECONDS) {
  const { data, error } = await admin.rpc('vh_renew_job_lease', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  })
  if (error) throw error
  return Boolean(data)
}

export async function checkpointJob(jobId: string, workerId: string, checkpoint: unknown, progress?: number) {
  if (progress !== undefined && (!Number.isFinite(progress) || progress < 0 || progress > 1)) throw new Error('invalid_job_progress')
  const patch: Record<string, unknown> = { checkpoint, updated_at: new Date().toISOString() }
  if (progress !== undefined) patch.progress = progress
  const { data, error } = await admin.from('vh_jobs').update(patch)
    .eq('id', jobId).eq('state', 'running').eq('lease_owner', workerId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('job_lease_lost')
}

export async function finishJob(jobId: string, workerId: string, result?: unknown, resultRef?: string) {
  const now = new Date().toISOString()
  const { data, error } = await admin.from('vh_jobs').update({
    state: 'succeeded', result: result ?? null, result_ref: resultRef ?? null,
    progress: 1, finished_at: now, lease_expires_at: null, updated_at: now,
  }).eq('id', jobId).eq('state', 'running').eq('lease_owner', workerId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('job_lease_lost')
}

export async function failOrRetryJob(job: CanonicalJob, workerId: string, error: unknown) {
  const retry = job.attempts < job.max_attempts
  const now = new Date()
  const safeClass = error instanceof Error ? error.name : 'UnknownError'
  const patch = retry ? {
    state: 'retry',
    available_at: new Date(now.getTime() + Math.min(60_000, 1000 * 2 ** Math.max(0, job.attempts - 1))).toISOString(),
    last_error_code: safeClass,
    safe_error_message: 'Job failed and is scheduled for retry.',
    lease_owner: null,
    lease_expires_at: null,
    updated_at: now.toISOString(),
  } : {
    state: 'failed',
    last_error_code: safeClass,
    safe_error_message: 'Job failed after the allowed attempts.',
    lease_owner: null,
    lease_expires_at: null,
    finished_at: now.toISOString(),
    updated_at: now.toISOString(),
  }
  const { data, error: dbError } = await admin.from('vh_jobs').update(patch)
    .eq('id', job.id).eq('state', 'running').eq('lease_owner', workerId).select('id').maybeSingle()
  if (dbError) throw dbError
  if (!data) throw new Error('job_lease_lost')
}

export async function cancelJob(accountId: string, jobId: string) {
  const { data, error } = await admin.from('vh_jobs').update({
    state: 'cancelled', finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', jobId).eq('account_id', accountId).in('state', ['queued','retry']).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(409, 'JOB_NOT_CANCELLABLE', 'The job cannot be cancelled in its current state.')
}

export class V1Worker {
  private stopped = false
  private controller: AbortController | null = null
  readonly id = `vh-worker-${randomUUID()}`

  stop() { this.stopped = true; this.controller?.abort() }

  private async wait(milliseconds: number) {
    this.controller = new AbortController()
    const signal = this.controller.signal
    try {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, milliseconds)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        }, { once: true })
      })
    } finally {
      this.controller = null
    }
  }

  async runOnce() {
    const job = await claimJob(this.id)
    if (!job) return false
    const handler = handlers.get(job.kind)
    if (!handler) {
      await failOrRetryJob(job, this.id, new Error('handler_not_registered'))
      return true
    }

    this.controller = new AbortController()
    const controller = this.controller
    let heartbeatError: unknown = null
    let heartbeatInFlight: Promise<void> | null = null

    const heartbeat = () => {
      if (heartbeatInFlight || controller.signal.aborted) return
      heartbeatInFlight = renewJobLease(job.id, this.id)
        .then(renewed => {
          if (!renewed) {
            const lost = new Error('job_lease_lost')
            heartbeatError = lost
            controller.abort(lost)
          }
        })
        .catch(error => {
          heartbeatError = error
          controller.abort(error)
        })
        .finally(() => { heartbeatInFlight = null })
    }
    const heartbeatTimer = setInterval(heartbeat, CANONICAL_JOB_HEARTBEAT_MS)

    try {
      const result = await handler({
        job,
        signal: controller.signal,
        checkpoint: (value, progress) => checkpointJob(job.id, this.id, value, progress),
      })
      clearInterval(heartbeatTimer)
      if (heartbeatInFlight) await heartbeatInFlight
      if (heartbeatError) throw heartbeatError
      await finishJob(job.id, this.id, result.result, result.resultRef)
    } catch (error) {
      await failOrRetryJob(job, this.id, error)
    } finally {
      clearInterval(heartbeatTimer)
      if (heartbeatInFlight) await heartbeatInFlight
      this.controller = null
    }
    return true
  }

  async runLoop(pollMs = 1500) {
    this.stopped = false
    let consecutiveFailures = 0
    while (!this.stopped) {
      try {
        const worked = await this.runOnce()
        consecutiveFailures = 0
        if (!worked && !this.stopped) await this.wait(pollMs)
      } catch (error) {
        if (this.stopped) return
        if (typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false) throw error

        consecutiveFailures += 1
        console.error('V1 worker iteration failed; retrying', {
          errorClass: error instanceof Error ? error.name : 'UnknownError',
          consecutiveFailures,
        })
        const backoffMs = Math.min(30_000, pollMs * 2 ** (consecutiveFailures - 1))
        await this.wait(backoffMs)
      }
    }
  }
}
