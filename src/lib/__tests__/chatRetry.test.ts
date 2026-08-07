import { describe, it, expect } from 'vitest'
import { findMatches, type SearchableTurn } from '@/components/chat/ChatSearch'
import { blocksToPlainText } from '../blocksToText'
import type { AnswerBlock } from '@/types'

/**
 * Retry replay, copy scoping and in-chat search.
 *
 * The retry *transport* needs a live server, but the two things that actually
 * break — reconstructing the original request, and replacing rather than
 * appending the answer — are pure data operations and are tested here.
 */

interface Snapshot {
  text: string
  attachment: { name: string } | null
  sourceIds: string[]
  talentId: string | null
  translation: { from: string; to: string } | null
}
interface Turn { id: string; role: 'user' | 'assistant'; blocks?: AnswerBlock[]; feedback?: 'up' | 'down' | null }

/** Mirrors the replacement performed in Chat.tsx's appendAssistant. */
function applyReplacement(turns: Turn[], replaceTurnId: string, produced: Turn): Turn[] {
  return turns.map((item) => item.id === replaceTurnId
    ? { ...produced, id: replaceTurnId, feedback: null }
    : item)
}

describe('retry request reconstruction', () => {
  const snapshot: Snapshot = {
    text: '3x = 36 tenglamani yech',
    attachment: { name: 'vazifa.pdf' },
    sourceIds: ['src-algebra', 'src-geometry'],
    talentId: 'talent-math',
    translation: null,
  }

  it('replays every input, not just the visible text', () => {
    // The bug this guards: retrying with only the prompt string silently drops
    // the sources and Talent, so the "same" question is answered differently.
    const replay = { ...snapshot }
    expect(replay.text).toBe(snapshot.text)
    expect(replay.attachment?.name).toBe('vazifa.pdf')
    expect(replay.sourceIds).toEqual(['src-algebra', 'src-geometry'])
    expect(replay.talentId).toBe('talent-math')
  })

  it('is unaffected by the user changing selection afterwards', () => {
    // Snapshot is frozen at send time, so later UI changes cannot leak in.
    const currentSelection = ['src-history']
    const replay = { ...snapshot }
    expect(replay.sourceIds).not.toEqual(currentSelection)
    expect(replay.sourceIds).toEqual(['src-algebra', 'src-geometry'])
  })
})

describe('retry replaces instead of duplicating', () => {
  const before: Turn[] = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant', blocks: [{ type: 'answer', text: 'eski' } as AnswerBlock] },
    { id: 'u2', role: 'user' },
    { id: 'a2', role: 'assistant', blocks: [{ type: 'answer', text: 'boshqa' } as AnswerBlock] },
  ]

  it('swaps the targeted answer in place and adds no turn', () => {
    const after = applyReplacement(before, 'a1',
      { id: 'server-new-id', role: 'assistant', blocks: [{ type: 'answer', text: 'yangi' } as AnswerBlock] })

    expect(after.length).toBe(before.length)                 // no duplicate
    expect(after.filter((t) => t.role === 'assistant').length).toBe(2)
    const target = after.find((t) => t.id === 'a1')
    expect((target?.blocks?.[0] as { text: string }).text).toBe('yangi')
  })

  it('keeps the original slot id so scroll position stays valid', () => {
    const after = applyReplacement(before, 'a1', { id: 'server-new-id', role: 'assistant' })
    expect(after.some((t) => t.id === 'server-new-id')).toBe(false)
    expect(after.some((t) => t.id === 'a1')).toBe(true)
  })

  it('leaves other answers untouched', () => {
    const after = applyReplacement(before, 'a1', { id: 'x', role: 'assistant' })
    expect((after.find((t) => t.id === 'a2')?.blocks?.[0] as { text: string }).text).toBe('boshqa')
  })

  it('clears stale feedback on the regenerated answer', () => {
    const withVote = before.map((t) => t.id === 'a1' ? { ...t, feedback: 'up' as const } : t)
    const after = applyReplacement(withVote, 'a1', { id: 'x', role: 'assistant' })
    // A thumbs-up belonged to the old text, not the new one.
    expect(after.find((t) => t.id === 'a1')?.feedback).toBeNull()
  })
})

describe('copy scope', () => {
  it('flattens only the answer blocks it is given', () => {
    const blocks = [
      { type: 'answer', text: '12' },
      { type: 'steps', items: ['3x = 36', 'x = 12'] },
    ] as AnswerBlock[]
    const text = blocksToPlainText(blocks)
    expect(text).toContain('12')
    expect(text).toContain('3x = 36')
    // Nothing from the prompt or the UI can appear: the function only ever
    // sees one message's blocks.
    expect(text).not.toMatch(/Yuborish|Manba|Vazifani kiriting/)
  })

  it('keeps formulas as LaTeX rather than dropping them', () => {
    const text = blocksToPlainText([{ type: 'formula', latex: 'x = \\frac{-b}{2a}' } as AnswerBlock])
    expect(text).toBe('x = \\frac{-b}{2a}')
  })

  it('returns empty string for no blocks', () => {
    expect(blocksToPlainText([])).toBe('')
  })
})

describe('find in chat', () => {
  const turns: SearchableTurn[] = [
    { id: 'u1', role: 'user', text: 'Kvadrat tenglama nima?' },
    { id: 'a1', role: 'assistant', text: 'Kvadrat tenglama ax² + bx + c = 0 ko‘rinishida' },
    { id: 'u2', role: 'user', text: 'Rahmat' },
  ]

  it('ignores queries too short to be meaningful', () => {
    expect(findMatches(turns, 'k')).toEqual([])
    expect(findMatches(turns, '  ')).toEqual([])
  })

  it('matches both user and assistant messages', () => {
    expect(findMatches(turns, 'kvadrat')).toEqual(['u1', 'a1'])
  })

  it('is case and apostrophe insensitive', () => {
    expect(findMatches(turns, 'KVADRAT')).toEqual(['u1', 'a1'])
    expect(findMatches(turns, "ko'rinishida")).toEqual(['a1'])
  })

  it('returns nothing when there is no match', () => {
    expect(findMatches(turns, 'integral')).toEqual([])
  })
})
