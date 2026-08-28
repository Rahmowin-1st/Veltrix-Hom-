import { describe, expect, it } from 'vitest'
import { AiRouter, ProviderRegistry, type AiProviderAdapter, type CircuitStore } from './aiRouter.js'

function circuits(open = new Set<string>()): CircuitStore {
  return {
    async isOpen(id) { return open.has(id) },
    async success() {},
    async failure() {},
  }
}

function routeRegistry(primary: AiProviderAdapter, fallback: AiProviderAdapter) {
  const registry = new ProviderRegistry()
  registry.registerAdapter(primary)
  registry.registerAdapter(fallback)
  const capabilities = new Set(['streaming','multimodal','structured','research','code'] as const)
  registry.registerRoute({ providerId: primary.id, modelId: 'primary-model', capabilities, priority: 10, enabled: true })
  registry.registerRoute({ providerId: fallback.id, modelId: 'fallback-model', capabilities, priority: 20, enabled: true })
  return registry
}

describe('Part 5 AI Router failover', () => {
  it('falls through to the next authorized provider after retryable primary exhaustion', async () => {
    const primary: AiProviderAdapter = { id: 'primary', async generate() { throw new Error('503 provider unavailable') } }
    const fallback: AiProviderAdapter = { id: 'fallback', async generate() { return 'fallback-ok' } }
    const result = await new AiRouter(routeRegistry(primary, fallback), circuits(), [0, 0]).generate({ taskClass: 'fast', prompt: 'hello' })
    expect(result.text).toBe('fallback-ok')
    expect(result.providerId).toBe('fallback')
    expect(result.modelId).toBe('fallback-model')
    expect(result.attempts).toBe(4)
  })

  it('fails closed on a non-retryable provider rejection instead of silently changing semantics', async () => {
    let fallbackCalls = 0
    const primary: AiProviderAdapter = { id: 'primary', async generate() { throw new Error('400 invalid request') } }
    const fallback: AiProviderAdapter = { id: 'fallback', async generate() { fallbackCalls++; return 'must-not-run' } }
    await expect(new AiRouter(routeRegistry(primary, fallback), circuits(), [0]).generate({ taskClass: 'fast', prompt: 'bad' }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST', retryable: false })
    expect(fallbackCalls).toBe(0)
  })

  it('skips an open circuit and uses the next healthy route', async () => {
    let primaryCalls = 0
    const primary: AiProviderAdapter = { id: 'primary', async generate() { primaryCalls++; return 'primary' } }
    const fallback: AiProviderAdapter = { id: 'fallback', async generate() { return 'fallback' } }
    const result = await new AiRouter(routeRegistry(primary, fallback), circuits(new Set(['primary:primary-model'])), []).generate({ taskClass: 'fast', prompt: 'hello' })
    expect(result.providerId).toBe('fallback')
    expect(primaryCalls).toBe(0)
  })

  it('fails closed with UNAVAILABLE when no authorized route exists', async () => {
    const registry = new ProviderRegistry()
    await expect(new AiRouter(registry, circuits(), []).generate({ taskClass: 'fast', prompt: 'hello' }))
      .rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 })
  })

  it('falls over streaming to the next route when the primary stream fails', async () => {
    const primary: AiProviderAdapter = {
      id: 'primary',
      async generate() { return 'unused' },
      async *stream() { throw new Error('503 stream unavailable') },
    }
    const fallback: AiProviderAdapter = {
      id: 'fallback',
      async generate() { return 'unused' },
      async *stream() { yield 'a'; yield 'b' },
    }
    const router = new AiRouter(routeRegistry(primary, fallback), circuits(), [])
    const chunks: string[] = []
    for await (const item of router.stream({ taskClass: 'fast', prompt: 'hello' })) chunks.push(item.delta)
    expect(chunks).toEqual(['a', 'b'])
  })

  it('preserves typed routing capability requirements', async () => {
    const registry = new ProviderRegistry()
    const fastOnly: AiProviderAdapter = { id: 'fast-only', async generate() { return 'wrong' } }
    const research: AiProviderAdapter = { id: 'research', async generate() { return 'research-ok' } }
    registry.registerAdapter(fastOnly)
    registry.registerAdapter(research)
    registry.registerRoute({ providerId: fastOnly.id, modelId: 'fast', capabilities: new Set(['streaming']), priority: 1, enabled: true })
    registry.registerRoute({ providerId: research.id, modelId: 'research', capabilities: new Set(['research']), priority: 2, enabled: true })
    const result = await new AiRouter(registry, circuits(), []).generate({ taskClass: 'research', prompt: 'deep' })
    expect(result.providerId).toBe('research')
  })
})