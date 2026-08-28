import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/supabase.js', () => ({ admin: {} }))

import { V1Worker } from './jobs.js'

describe('V1Worker runLoop', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('recovers after one transient claim failure without rejecting', async () => {
    vi.useFakeTimers()
    const worker = new V1Worker()
    const runOnce = vi.spyOn(worker, 'runOnce')
      .mockRejectedValueOnce(new Error('provider payload must not be logged'))
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => { worker.stop(); return false })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const loop = worker.runLoop(10)
    await vi.advanceTimersByTimeAsync(10)
    await loop

    expect(runOnce).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledWith('V1 worker iteration failed; retrying', {
      errorClass: 'Error', consecutiveFailures: 1,
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('provider payload')
  })

  it('uses bounded exponential backoff and does not hot loop', async () => {
    vi.useFakeTimers()
    const worker = new V1Worker()
    const runOnce = vi.spyOn(worker, 'runOnce').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const loop = worker.runLoop(10_000)

    await vi.advanceTimersByTimeAsync(9_999)
    expect(runOnce).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runOnce).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(runOnce).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(runOnce).toHaveBeenCalledTimes(4)
    worker.stop()
    await loop
  })

  it('keeps successful iterations at the existing immediate cadence', async () => {
    const worker = new V1Worker()
    const runOnce = vi.spyOn(worker, 'runOnce')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => { worker.stop(); return true })

    await worker.runLoop(10_000)
    expect(runOnce).toHaveBeenCalledTimes(3)
  })

  it('waits for the poll interval after an empty iteration', async () => {
    vi.useFakeTimers()
    const worker = new V1Worker()
    const runOnce = vi.spyOn(worker, 'runOnce').mockResolvedValue(false)
    const loop = worker.runLoop(25)

    await vi.advanceTimersByTimeAsync(24)
    expect(runOnce).toHaveBeenCalledTimes(1)
    worker.stop()
    await loop
  })

  it('stops cleanly while waiting in backoff', async () => {
    vi.useFakeTimers()
    const worker = new V1Worker()
    vi.spyOn(worker, 'runOnce').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const loop = worker.runLoop(30_000)
    await vi.advanceTimersByTimeAsync(1)

    worker.stop()
    await expect(loop).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('performs only one claim attempt per loop iteration', async () => {
    const worker = new V1Worker()
    const runOnce = vi.spyOn(worker, 'runOnce')
      .mockImplementationOnce(async () => { worker.stop(); return true })

    await worker.runLoop()
    expect(runOnce).toHaveBeenCalledTimes(1)
  })

  it('propagates explicitly non-retryable failures', async () => {
    const worker = new V1Worker()
    const terminal = Object.assign(new Error('invalid configuration'), { retryable: false })
    vi.spyOn(worker, 'runOnce').mockRejectedValue(terminal)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(worker.runLoop()).rejects.toBe(terminal)
    expect(log).not.toHaveBeenCalled()
  })
})
