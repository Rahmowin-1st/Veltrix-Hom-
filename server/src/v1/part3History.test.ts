import { describe, expect, it } from 'vitest'
import {
  archiveInputSchema,
  attachTagInputSchema,
  createTagInputSchema,
  deterministicConversationTitle,
  historyQuerySchema,
  pinInputSchema,
  sanitizeGeneratedConversationTitle,
  searchQuerySchema,
  titleInputSchema,
} from './part3History.js'

describe('Part 3 Stage 60 history metadata and exact search contracts', () => {
  it('creates a deterministic non-blocking fallback title from meaningful first-turn context', () => {
    expect(deterministicConversationTitle('  Explain   Newton’s second law!!! ', 'Force equals mass times acceleration.'))
      .toBe('Explain Newton’s second law Force equals mass times')
    expect(deterministicConversationTitle('https://example.com', '')).toBe('New Conversation')
    expect(deterministicConversationTitle('A '.repeat(100), '').length).toBeLessThanOrEqual(72)
  })

  it('sanitizes AI title output into one bounded title rather than trusting presentation text', () => {
    expect(sanitizeGeneratedConversationTitle('Title: "Newtonian Motion"\nExplanation: ignored')).toBe('Newtonian Motion')
    expect(sanitizeGeneratedConversationTitle('```\nunsafe\n```')).toBeNull()
    expect(sanitizeGeneratedConversationTitle('<Physics> foundations')).toBe('Physics foundations')
    expect(sanitizeGeneratedConversationTitle('word '.repeat(40))?.length).toBeLessThanOrEqual(72)
  })

  it('keeps manual title/tag mutation inputs strict and bounded', () => {
    expect(titleInputSchema.parse({ title: 'My title' })).toEqual({ title: 'My title' })
    expect(createTagInputSchema.parse({ name: 'Exam review' })).toEqual({ name: 'Exam review' })
    expect(attachTagInputSchema.parse({ tagId: '11111111-1111-4111-8111-111111111111' }).tagId).toBeTruthy()
    expect(() => titleInputSchema.parse({ title: 'x', titleSource: 'AUTO' })).toThrow()
    expect(() => createTagInputSchema.parse({ name: 'x', aiGenerated: true })).toThrow()
  })

  it('requires explicit pin/archive state and prevents stale pin order on unpin', () => {
    expect(pinInputSchema.parse({ pinned: true, pinOrder: 3 })).toEqual({ pinned: true, pinOrder: 3 })
    expect(pinInputSchema.parse({ pinned: false })).toEqual({ pinned: false })
    expect(() => pinInputSchema.parse({ pinned: false, pinOrder: 3 })).toThrow()
    expect(archiveInputSchema.parse({ archived: true })).toEqual({ archived: true })
  })

  it('parses active/archived history and multiple manual tag filters', () => {
    const query = historyQuerySchema.parse({
      view: 'archived',
      tagId: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      limit: '25',
    })
    expect(query.view).toBe('archived')
    expect(query.tagIds).toHaveLength(2)
    expect(query.limit).toBe(25)
  })

  it('keeps exact lexical search explicit and bounded with archived opt-in', () => {
    expect(searchQuerySchema.parse({ q: 'energy conservation' })).toEqual({
      q: 'energy conservation', includeArchived: false, limit: 50,
    })
    expect(searchQuerySchema.parse({ q: 'project', includeArchived: 'true', limit: '100' }).includeArchived).toBe(true)
    expect(() => searchQuerySchema.parse({ q: '' })).toThrow()
  })
})
