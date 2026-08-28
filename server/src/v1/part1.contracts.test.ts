import { describe, expect, it } from 'vitest'
import { AiRouteError, AiRouter, ProviderRegistry, type AiProviderAdapter, type CircuitStore } from './aiRouter.js'
import { digestSecret, hashPassword, randomFourDigitCode, randomToken, verifyPassword } from './crypto.js'
import { requestFingerprint } from './idempotency.js'
import { GiB, MiB, QUOTA_CONTRACTS } from './quota.js'
import { AVATARS } from './profile.js'

class MemoryCircuitStore implements CircuitStore {
  open = new Set<string>()
  failures: string[] = []
  successes: string[] = []
  async isOpen(providerId: string) { return this.open.has(providerId) }
  async success(providerId: string) { this.successes.push(providerId) }
  async failure(providerId: string, code: string) { this.failures.push(`${providerId}:${code}`) }
}

function routeRegistry(adapters: AiProviderAdapter[]) {
  const registry = new ProviderRegistry()
  for (const adapter of adapters) registry.registerAdapter(adapter)
  const caps = new Set(['streaming','multimodal','structured','research','code'] as const)
  adapters.forEach((adapter, index) => registry.registerRoute({
    providerId: adapter.id,
    modelId: `model-${index + 1}`,
    capabilities: caps,
    priority: (index + 1) * 10,
    enabled: true,
  }))
  return registry
}

describe('Part 1 crypto contract', () => {
  it('generates only exact four-digit codes including leading-zero space', () => {
    for (let i = 0; i < 1000; i++) expect(randomFourDigitCode()).toMatch(/^\d{4}$/)
  })

  it('hashes passwords without storing plaintext and rejects a wrong password', async () => {
    const password = 'Correct-Horse-42!'
    const hash = await hashPassword(password)
    expect(hash.startsWith('scrypt-v1$')).toBe(true)
    expect(hash.includes(password)).toBe(false)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword('Wrong-Horse-42!', hash)).toBe(false)
  })

  it('creates high-entropy opaque session tokens and contextual digests', () => {
    const a = randomToken(32)
    const b = randomToken(32)
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(digestSecret(a, 'access-token')).not.toBe(digestSecret(a, 'refresh-token'))
  })
})

describe('Part 1 frozen quota and avatar contracts', () => {
  it('keeps exact canonical Library and attachment limits', () => {
    expect(QUOTA_CONTRACTS.library.hardBytes).toBe(1 * GiB)
    expect(QUOTA_CONTRACTS.library.warningBytes).toBe(900 * MiB)
    expect(QUOTA_CONTRACTS.projectReference).toMatchObject({ maxItems: 20, maxTotalBytes: 50 * MiB })
    expect(QUOTA_CONTRACTS.conversationReference).toMatchObject({ maxItems: 1, maxTotalBytes: 20 * MiB })
    expect(QUOTA_CONTRACTS.conversationMessageAttachments).toMatchObject({ maxItems: 5, maxTotalBytes: 10 * MiB })
    expect(QUOTA_CONTRACTS.fastAskAttachments).toMatchObject({ maxItems: 5, maxTotalBytes: 10 * MiB })
    expect(QUOTA_CONTRACTS.studioCustomAttachments).toMatchObject({ maxItems: 5, maxTotalBytes: 20 * MiB })
  })

  it('exports exactly the seven frozen avatar identities', () => {
    expect(AVATARS).toEqual(['crocodile','wolf','fox','elephant','shark','tiger','lion'])
    expect(new Set(AVATARS).size).toBe(7)
  })
})

describe('Part 1 idempotency fingerprint', () => {
  it('is stable for an identical request and changes with body or route', () => {
    const a = requestFingerprint('POST', '/api/v1/a', { x: 1 })
    expect(requestFingerprint('POST', '/api/v1/a', { x: 1 })).toBe(a)
    expect(requestFingerprint('POST', '/api/v1/a', { x: 2 })).not.toBe(a)
    expect(requestFingerprint('POST', '/api/v1/b', { x: 1 })).not.toBe(a)
  })
})

describe('Part 1 AI router', () => {
  it('uses the preferred route on success', async () => {
    const store = new MemoryCircuitStore()
    const registry = routeRegistry([{ id: 'primary', async generate() { return 'primary-ok' } }])
    const result = await new AiRouter(registry, store, []).generate({ taskClass: 'fast', prompt: 'x' })
    expect(result.text).toBe('primary-ok')
    expect(result.providerId).toBe('primary')
    expect(result.attempts).toBe(1)
    expect(store.successes).toEqual(['primary:model-1'])
  })

  it('falls back after a bounded retryable provider failure', async () => {
    const store = new MemoryCircuitStore()
    let firstCalls = 0
    const registry = routeRegistry([
      { id: 'primary', async generate() { firstCalls++; throw new AiRouteError('RATE_LIMITED', 'busy', true, 429) } },
      { id: 'fallback', async generate() { return 'fallback-ok' } },
    ])
    const result = await new AiRouter(registry, store, []).generate({ taskClass: 'fast', prompt: 'x' })
    expect(firstCalls).toBe(1)
    expect(result.text).toBe('fallback-ok')
    expect(result.providerId).toBe('fallback')
    expect(store.failures).toContain('primary:model-1:RATE_LIMITED')
  })

  it('skips an open circuit', async () => {
    const store = new MemoryCircuitStore()
    store.open.add('primary:model-1')
    let primaryCalled = false
    const registry = routeRegistry([
      { id: 'primary', async generate() { primaryCalled = true; return 'bad' } },
      { id: 'fallback', async generate() { return 'good' } },
    ])
    const result = await new AiRouter(registry, store, []).generate({ taskClass: 'fast', prompt: 'x' })
    expect(primaryCalled).toBe(false)
    expect(result.text).toBe('good')
  })

  it('does not evade a non-retryable provider rejection', async () => {
    const store = new MemoryCircuitStore()
    const registry = routeRegistry([
      { id: 'primary', async generate() { throw new AiRouteError('INVALID_REQUEST', 'bad input', false, 400) } },
      { id: 'fallback', async generate() { return 'must-not-run' } },
    ])
    await expect(new AiRouter(registry, store, []).generate({ taskClass: 'fast', prompt: 'x' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('isolates circuits for primary and fallback models on one provider', async () => {
    const store = new MemoryCircuitStore()
    store.open.add('shared:primary-model')
    const registry = new ProviderRegistry()
    registry.registerAdapter({ id: 'shared', async generate(modelId) { return modelId } })
    const caps = new Set(['streaming'] as const)
    registry.registerRoute({ providerId: 'shared', modelId: 'primary-model', capabilities: caps, priority: 10, enabled: true })
    registry.registerRoute({ providerId: 'shared', modelId: 'fallback-model', capabilities: caps, priority: 20, enabled: true })
    const result = await new AiRouter(registry, store, []).generate({ taskClass: 'fast', prompt: 'x' })
    expect(result.modelId).toBe('fallback-model')
  })

  it('cancels a provider that does not cooperate with the abort signal', async () => {
    const store = new MemoryCircuitStore()
    const registry = routeRegistry([{ id: 'primary', async generate() { return await new Promise<string>(() => {}) } }])
    const controller = new AbortController()
    const pending = new AiRouter(registry, store, []).generate({ taskClass: 'fast', prompt: 'x', signal: controller.signal })
    controller.abort(new DOMException('deadline', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('falls back for streaming and preserves provider identity', async () => {
    const store = new MemoryCircuitStore()
    const registry = routeRegistry([
      {
        id: 'primary', async generate() { return '' },
        async *stream() { throw new AiRouteError('UNAVAILABLE', 'down', true, 503) },
      },
      {
        id: 'fallback', async generate() { return '' },
        async *stream() { yield 'a'; yield 'b' },
      },
    ])
    const chunks: string[] = []
    for await (const chunk of new AiRouter(registry, store, []).stream({ taskClass: 'fast', prompt: 'x' })) {
      chunks.push(`${chunk.providerId}:${chunk.delta}`)
    }
    expect(chunks).toEqual(['fallback:a','fallback:b'])
  })
})
