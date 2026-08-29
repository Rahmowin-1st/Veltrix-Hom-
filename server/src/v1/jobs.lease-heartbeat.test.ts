import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('../services/supabase.js', () => ({ admin: mocks }))

import { CANONICAL_JOB_HEARTBEAT_MS, V1Worker, registerJobHandler } from './jobs.js'

const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const ACCOUNT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function updateChain() {
  const chain: any = {}
  chain.eq = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: { id: JOB_ID }, error: null }))
  return chain
}

function installDbMocks(kind: string, renewResult: boolean) {
  let claimed = false
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'vh_claim_job') {
      if (claimed) return { data: [], error: null }
      claimed = true
      return {
        data: [{
          id: JOB_ID,
          account_id: ACCOUNT_ID,
          kind,
          payload: {},
          state: 'running',
          attempts: 1,
          max_attempts: 5,
          progress: 0,
          idempotency_key: null,
          checkpoint: null,
          provenance: {},
          lease_owner: 'server-side-worker-id',
        }],
        error: null,
      }
    }
    if (name === 'vh_renew_job_lease') return { data: renewResult, error: null }
    throw new Error(`unexpected_rpc:${name}`)
  })
  mocks.from.mockImplementation(() => ({ update: vi.fn(() => updateChain()) }))
}

registerJobHandler('max.heartbeat.success', async () => {
  await new Promise<void>(resolve => setTimeout(resolve, CANONICAL_JOB_HEARTBEAT_MS * 2 + 5_000))
  return { result: { ok: true } }
})

let lostSignalObserved = false
registerJobHandler('max.heartbeat.lost', async ({ signal }) => {
  await new Promise<void>((_, reject) => {
    if (signal.aborted) { lostSignalObserved = true; reject(signal.reason); return }
    signal.addEventListener('abort', () => {
      lostSignalObserved = true
      reject(signal.reason)
    }, { once: true })
  })
  return { result: { impossible: true } }
})

describe('canonical V1Worker lease heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.rpc.mockReset()
    mocks.from.mockReset()
    lostSignalObserved = false
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renews a healthy long-running job before the canonical 60s lease can expire', async () => {
    installDbMocks('max.heartbeat.success', true)
    const worker = new V1Worker()
    const run = worker.runOnce()

    await vi.advanceTimersByTimeAsync(CANONICAL_JOB_HEARTBEAT_MS)
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'vh_renew_job_lease')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(CANONICAL_JOB_HEARTBEAT_MS)
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'vh_renew_job_lease')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(run).resolves.toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts handler work when the database says this worker no longer owns a renewable lease', async () => {
    installDbMocks('max.heartbeat.lost', false)
    const worker = new V1Worker()
    const run = worker.runOnce()

    await vi.advanceTimersByTimeAsync(CANONICAL_JOB_HEARTBEAT_MS)
    await expect(run).resolves.toBe(true)
    expect(lostSignalObserved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
