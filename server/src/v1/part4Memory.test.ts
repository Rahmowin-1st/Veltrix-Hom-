import { describe, expect, it } from 'vitest'
import { registeredJobKinds } from './jobs.js'
import { memoryCandidateSchema, memoryPrivacyDecision, normalizeMemoryCandidate } from './part4Memory.js'

const safeCandidate = { memoryClass: 'learning', content: 'Prefers worked algebra examples before independent practice', confidence: 0.92, canonicalKey: 'learning:algebra_examples', structuredValue: { style: 'worked-example-first' } }

describe('Part4 Memory candidate pipeline', () => {
  it('accepts durable non-sensitive high-confidence inference', () => {
    const parsed = memoryCandidateSchema.parse(safeCandidate)
    expect(memoryPrivacyDecision(parsed)).toEqual({ allowed: true, reason: null })
    expect(normalizeMemoryCandidate(parsed).persist).toBe(true)
  })

  it('drops low-confidence trivia before persistence', () => {
    expect(normalizeMemoryCandidate({ ...safeCandidate, confidence: 0.4 }).persist).toBe(false)
  })

  it('fail-closes inferred sensitive attributes and secrets', () => {
    const samples = [
      'Medical condition diagnosis is X',
      'Political party preference is Y',
      'Religion affiliation is Z',
      'Sexual orientation is Q',
      'API key is abc123',
      'Bank account number is 123',
    ]
    for (const content of samples) {
      const decision = normalizeMemoryCandidate({ memoryClass: 'ai_inference', content, confidence: 0.99, structuredValue: {} })
      expect(decision.persist, content).toBe(false)
      expect(decision.reason, content).toMatch(/^privacy:/)
    }
  })

  it('keeps automatic memory bounded to registered candidate classes', () => {
    expect(memoryCandidateSchema.safeParse({ ...safeCandidate, memoryClass: 'explicit' }).success).toBe(false)
    expect(memoryCandidateSchema.safeParse({ ...safeCandidate, memoryClass: 'hidden_chain_of_thought' }).success).toBe(false)
  })

  it('registers the durable automatic extraction worker', () => {
    expect(registeredJobKinds()).toContain('memory.extract')
  })
})
