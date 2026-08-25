import { GoogleGenAI } from '@google/genai'
import { admin } from '../services/supabase.js'

export type AiTaskClass = 'fast' | 'research' | 'multimodal' | 'structured' | 'code'
export type AiCapability = 'streaming' | 'multimodal' | 'structured' | 'research' | 'code'

export type AiRequest = {
  taskClass: AiTaskClass
  prompt: string
  system?: string
  signal?: AbortSignal
}

export type AiRoute = {
  providerId: string
  modelId: string
  capabilities: ReadonlySet<AiCapability>
  priority: number
  enabled: boolean
}

export type AiResult = {
  text: string
  providerId: string
  modelId: string
  latencyMs: number
  attempts: number
}

export class AiRouteError extends Error {
  constructor(
    public code: 'RATE_LIMITED' | 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_REQUEST' | 'PROVIDER_ERROR',
    message: string,
    public retryable: boolean,
    public status?: number,
  ) { super(message) }
}

export interface AiProviderAdapter {
  id: string
  generate(modelId: string, request: AiRequest): Promise<string>
  stream?(modelId: string, request: AiRequest): AsyncIterable<string>
}

export interface CircuitStore {
  isOpen(providerId: string): Promise<boolean>
  success(providerId: string): Promise<void>
  failure(providerId: string, code: string, openSeconds: number): Promise<void>
}

const REQUIRED_CAPABILITY: Partial<Record<AiTaskClass, AiCapability>> = {
  research: 'research',
  multimodal: 'multimodal',
  structured: 'structured',
  code: 'code',
}

export class ProviderRegistry {
  private adapters = new Map<string, AiProviderAdapter>()
  private routes: AiRoute[] = []

  registerAdapter(adapter: AiProviderAdapter) { this.adapters.set(adapter.id, adapter) }
  registerRoute(route: AiRoute) { this.routes.push(route) }
  adapter(providerId: string) { return this.adapters.get(providerId) }

  candidates(taskClass: AiTaskClass, streaming = false) {
    const required = REQUIRED_CAPABILITY[taskClass]
    return this.routes
      .filter(route => route.enabled)
      .filter(route => !required || route.capabilities.has(required))
      .filter(route => !streaming || route.capabilities.has('streaming'))
      .sort((a, b) => a.priority - b.priority)
  }
}

export const dbCircuitStore: CircuitStore = {
  async isOpen(providerId) {
    const { data, error } = await admin.from('vh_ai_circuits').select('opened_until').eq('provider_id', providerId).maybeSingle()
    if (error) throw error
    return Boolean(data?.opened_until && Date.parse(data.opened_until) > Date.now())
  },
  async success(providerId) {
    const { error } = await admin.from('vh_ai_circuits').upsert({ provider_id: providerId, failure_count: 0, opened_until: null, last_error_code: null, updated_at: new Date().toISOString() }, { onConflict: 'provider_id' })
    if (error) throw error
  },
  async failure(providerId, code, openSeconds) {
    const { data } = await admin.from('vh_ai_circuits').select('failure_count').eq('provider_id', providerId).maybeSingle()
    const failureCount = Number(data?.failure_count ?? 0) + 1
    const openedUntil = failureCount >= 3 ? new Date(Date.now() + openSeconds * 1000).toISOString() : null
    const { error } = await admin.from('vh_ai_circuits').upsert({ provider_id: providerId, failure_count: failureCount, opened_until: openedUntil, last_error_code: code, updated_at: new Date().toISOString() }, { onConflict: 'provider_id' })
    if (error) throw error
  },
}

function classify(error: unknown): AiRouteError {
  if (error instanceof AiRouteError) return error
  if (error instanceof DOMException && error.name === 'AbortError') return new AiRouteError('TIMEOUT', 'AI request was cancelled or timed out.', true)
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/)
  const status = statusMatch ? Number(statusMatch[1]) : undefined
  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) return new AiRouteError('RATE_LIMITED', 'AI route is rate limited.', true, 429)
  if (lower.includes('timeout') || lower.includes('aborted')) return new AiRouteError('TIMEOUT', 'AI route timed out.', true)
  if (status && status >= 500) return new AiRouteError('UNAVAILABLE', 'AI provider is unavailable.', true, status)
  if (status && status >= 400 && status < 500) return new AiRouteError('INVALID_REQUEST', 'AI provider rejected the request.', false, status)
  return new AiRouteError('PROVIDER_ERROR', 'AI provider failed.', true, status)
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
}

export class AiRouter {
  constructor(
    private registry: ProviderRegistry,
    private circuits: CircuitStore = dbCircuitStore,
    private retryBackoffMs: readonly number[] = [250, 750],
  ) {}

  async generate(request: AiRequest): Promise<AiResult> {
    const candidates = this.registry.candidates(request.taskClass, false)
    let last: AiRouteError | null = null
    let attempts = 0
    for (const route of candidates) {
      if (await this.circuits.isOpen(route.providerId)) continue
      const adapter = this.registry.adapter(route.providerId)
      if (!adapter) continue
      const started = Date.now()
      for (let retry = 0; retry <= this.retryBackoffMs.length; retry++) {
        attempts++
        try {
          const text = await adapter.generate(route.modelId, request)
          await this.circuits.success(route.providerId)
          return { text, providerId: route.providerId, modelId: route.modelId, latencyMs: Date.now() - started, attempts }
        } catch (error) {
          last = classify(error)
          await this.circuits.failure(route.providerId, last.code, 60)
          if (!last.retryable || retry >= this.retryBackoffMs.length) break
          await sleep(this.retryBackoffMs[retry]!, request.signal)
        }
      }
    }
    throw last ?? new AiRouteError('UNAVAILABLE', 'No authorized AI route is available.', true, 503)
  }

  async *stream(request: AiRequest): AsyncIterable<{ delta: string; providerId: string; modelId: string }> {
    const candidates = this.registry.candidates(request.taskClass, true)
    let last: AiRouteError | null = null
    for (const route of candidates) {
      if (await this.circuits.isOpen(route.providerId)) continue
      const adapter = this.registry.adapter(route.providerId)
      if (!adapter?.stream) continue
      try {
        for await (const delta of adapter.stream(route.modelId, request)) {
          if (request.signal?.aborted) throw request.signal.reason ?? new DOMException('Aborted', 'AbortError')
          if (delta) yield { delta, providerId: route.providerId, modelId: route.modelId }
        }
        await this.circuits.success(route.providerId)
        return
      } catch (error) {
        last = classify(error)
        await this.circuits.failure(route.providerId, last.code, 60)
        if (!last.retryable) break
      }
    }
    throw last ?? new AiRouteError('UNAVAILABLE', 'No authorized streaming AI route is available.', true, 503)
  }
}

export function buildDefaultAiRegistry() {
  const registry = new ProviderRegistry()
  const apiKey = process.env.GEMINI_API_KEY
  if (apiKey) {
    const google = new GoogleGenAI({ apiKey })
    const adapter: AiProviderAdapter = {
      id: 'google-gemini',
      async generate(modelId, request) {
        const response = await google.models.generateContent({
          model: modelId,
          contents: request.prompt,
          config: request.system ? { systemInstruction: request.system } : undefined,
        })
        return response.text ?? ''
      },
      async *stream(modelId, request) {
        const response = await google.models.generateContentStream({
          model: modelId,
          contents: request.prompt,
          config: request.system ? { systemInstruction: request.system } : undefined,
        })
        for await (const chunk of response) {
          if (request.signal?.aborted) throw request.signal.reason ?? new DOMException('Aborted', 'AbortError')
          const text = chunk.text ?? ''
          if (text) yield text
        }
      },
    }
    registry.registerAdapter(adapter)
    const all = new Set<AiCapability>(['streaming','multimodal','structured','research','code'])
    registry.registerRoute({ providerId: adapter.id, modelId: process.env.VH_AI_FAST_MODEL ?? 'gemini-3.7-flash', capabilities: all, priority: 10, enabled: true })
    registry.registerRoute({ providerId: adapter.id, modelId: process.env.VH_AI_FALLBACK_MODEL ?? 'gemini-3.6-flash', capabilities: all, priority: 20, enabled: true })
  }
  return registry
}

export const defaultAiRouter = new AiRouter(buildDefaultAiRegistry())
