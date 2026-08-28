import { describe, expect, it } from 'vitest'
import { registeredJobKinds } from './jobs.js'
import { artifactOutputSchemas, bindingSchema } from './part4Studio.js'

const samples: Record<string, unknown> = {
  flashcards: { cards: [{ front: 'Q', back: 'A' }] },
  quiz: { questions: [{ prompt: 'Q', options: ['A','B'], correctIndex: 0 }] },
  practice_test: { sections: [{ title: 'S', questions: [{ prompt: 'Q', answer: 'A' }] }] },
  study_guide: { sections: [{ heading: 'H', body: 'B' }] },
  mind_map: { nodes: [{ id: 'n1', label: 'L' }], edges: [] },
  summary: { sections: [{ heading: 'H', text: 'T' }], keyPoints: ['K'] },
  notes: { blocks: [{ type: 'paragraph', text: 'T' }] },
  presentation: { slides: [{ title: 'S', bullets: ['B'] }] },
  infographic: { layout: { title: 'I', blocks: [{ kind: 'text', text: 'T' }] } },
  audio_lesson: { segments: [{ speaker: 'Tutor', text: 'T' }] },
  cheat_sheet: { items: [{ label: 'L', value: 'V' }] },
  question_bank: { questions: [{ prompt: 'Q', answer: 'A', difficulty: 'easy' }] },
  timeline: { events: [{ date: '2026', title: 'E', details: 'D' }] },
  concept_breakdown: { concepts: [{ title: 'C', explanation: 'E', examples: ['X'] }] },
}

describe('Part4 Studio registry contracts', () => {
  it('has the frozen fourteen initial typed artifacts', () => {
    expect(Object.keys(artifactOutputSchemas).sort()).toEqual(Object.keys(samples).sort())
    expect(Object.keys(artifactOutputSchemas)).toHaveLength(14)
    for (const [type, sample] of Object.entries(samples)) expect(artifactOutputSchemas[type]!.safeParse(sample).success, type).toBe(true)
  })

  it('does not collapse incompatible artifact shapes into one blob', () => {
    expect(artifactOutputSchemas.flashcards!.safeParse({ markdown: '# cards' }).success).toBe(false)
    expect(artifactOutputSchemas.mind_map!.safeParse(samples.flashcards).success).toBe(false)
    expect(artifactOutputSchemas.presentation!.safeParse(samples.summary).success).toBe(false)
  })

  it('registers a durable Studio generation job handler', () => {
    expect(registeredJobKinds()).toContain('studio.generate')
  })
})

describe('Part4 Studio binding validation', () => {
  it('accepts live references and direct text', () => {
    expect(bindingSchema.safeParse({ kind: 'project', targetId: '11111111-1111-4111-8111-111111111111' }).success).toBe(true)
    expect(bindingSchema.safeParse({ kind: 'library_selection', selector: { assetIds: [] } }).success).toBe(true)
    expect(bindingSchema.safeParse({ kind: 'direct_text', text: 'study this' }).success).toBe(true)
  })

  it('rejects identity-less live references and empty direct text', () => {
    expect(bindingSchema.safeParse({ kind: 'project' }).success).toBe(false)
    expect(bindingSchema.safeParse({ kind: 'direct_text', text: '' }).success).toBe(false)
  })
})
