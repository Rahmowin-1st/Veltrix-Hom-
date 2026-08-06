import { describe, it, expect } from 'vitest'
import { stripAnswerLabel, wrapBareLatex, normalizeBlocks } from '../../services/answerNormalize.js'

/**
 * Server-side answer repair (spec §9).
 *
 * Fixing this on the server matters because the answer is persisted: a
 * client-only fix would leave the bad text in the database forever.
 */
describe('answer label repair', () => {
  it('removes the reported doubled label', () => {
    expect(stripAnswerLabel('Javob: Javob: 1,25 (C varianti)')).toBe('1,25 (C varianti)')
  })

  it('leaves a label that carries meaning mid-sentence', () => {
    expect(stripAnswerLabel('Tenglamaning Javob: qismi')).toBe('Tenglamaning Javob: qismi')
  })
})

describe('bare LaTeX wrapping', () => {
  it('wraps the reported unwrapped fraction', () => {
    const out = wrapBareLatex('\\frac{\\sqrt[5]{17}}{\\sqrt[5]{544}}')
    expect(out.startsWith('$')).toBe(true)
    expect(out.endsWith('$')).toBe(true)
  })

  it('does not touch text that already uses delimiters', () => {
    const already = 'natija $\\frac{1}{2}$ ga teng'
    expect(wrapBareLatex(already)).toBe(already)
  })

  it('leaves ordinary prose untouched', () => {
    expect(wrapBareLatex('Oddiy javob 42')).toBe('Oddiy javob 42')
  })
})

describe('block normalization', () => {
  it('keeps only the first answer block', () => {
    const blocks = normalizeBlocks([
      { type: 'steps', items: ['3x = 36'] },
      { type: 'answer', text: 'Javob: 12' },
      { type: 'answer', text: 'Javob: 12' },
    ])
    expect(blocks.filter((b) => b.type === 'answer').length).toBe(1)
    expect(blocks.find((b) => b.type === 'answer')?.text).toBe('12')
  })

  it('drops an answer block that becomes empty after cleanup', () => {
    const blocks = normalizeBlocks([{ type: 'answer', text: 'Javob:' }])
    expect(blocks.length).toBe(0)
  })

  it('normalizes step items too', () => {
    const blocks = normalizeBlocks([{ type: 'steps', items: ['\\frac{1}{2} ni hisoblaymiz'] }])
    const items = blocks[0]?.items as string[]
    expect(items[0]).toContain('$')
  })

  it('survives malformed input without throwing', () => {
    expect(normalizeBlocks(null)).toEqual([])
    expect(normalizeBlocks('nonsense')).toEqual([])
    expect(normalizeBlocks([null, 42, { type: 'note', text: 'ok' }]).length).toBe(1)
  })
})
