import { describe, it, expect } from 'vitest'
import { segmentMath, hasMath, stripAnswerLabel, normalizeAnswerText } from '../mathNormalize'

/**
 * The exact defect reported: correct mathematics reaching the user as raw
 * LaTeX source, and a doubled answer label.
 */
describe('undelimited LaTeX rescue', () => {
  it('rescues the reported real-world answer', () => {
    const raw = '\\frac{\\sqrt[5]{17}}{\\sqrt[5]{544}} = 1,25'
    const segs = segmentMath(raw)
    expect(segs.length).toBe(1)
    expect(segs[0]?.kind).toBe('inline')
    // The whole equation, including "= 1,25", is one expression.
    expect(segs[0]?.value).toContain('\\frac')
    expect(segs[0]?.value).toContain('1,25')
    expect(hasMath(raw)).toBe(true)
  })

  it('rescues \\frac, \\sqrt and indexed roots', () => {
    for (const raw of ['\\frac{1}{2}', '\\sqrt{16}', '\\sqrt[3]{27}']) {
      const segs = segmentMath(raw)
      expect(segs[0]?.kind).toBe('inline')
      expect(segs[0]?.value).toBe(raw)
    }
  })

  it('keeps surrounding prose as text', () => {
    const segs = segmentMath('Bu yerda \\frac{1}{2} qiymati bor.')
    expect(segs[0]?.kind).toBe('text')
    expect(segs[0]?.value).toBe('Bu yerda ')
    expect(segs[1]?.kind).toBe('inline')
    expect(segs[segs.length - 1]?.kind).toBe('text')
  })

  it('still honours explicit $ and $$ delimiters', () => {
    const inline = segmentMath('narx $x^2$ ga teng')
    expect(inline.some((s) => s.kind === 'inline' && s.value === 'x^2')).toBe(true)
    const block = segmentMath('$$a+b$$')
    expect(block[0]?.kind).toBe('block')
    expect(block[0]?.value).toBe('a+b')
  })

  it('handles nested braces without truncating', () => {
    const raw = '\\frac{\\sqrt{2}}{3}'
    expect(segmentMath(raw)[0]?.value).toBe(raw)
  })

  it('does NOT convert ordinary backslashes or unknown commands', () => {
    // A Windows path and an unknown command must stay literal text — turning
    // these into math would corrupt legitimate content.
    for (const raw of ['C:\\Users\\file', 'kod \\n bilan', '\\unknowncmd{x}']) {
      expect(hasMath(raw)).toBe(false)
      expect(segmentMath(raw).every((s) => s.kind === 'text')).toBe(true)
    }
  })

  it('refuses to rescue unbalanced braces', () => {
    // Better plain text than a KaTeX throw inside a message list.
    expect(segmentMath('\\frac{1}{2').every((s) => s.kind === 'text')).toBe(true)
  })

  it('returns nothing for empty input and never throws', () => {
    expect(segmentMath('')).toEqual([])
    expect(() => segmentMath('$')).not.toThrow()
    expect(() => segmentMath('\\')).not.toThrow()
  })
})

describe('answer label cleanup', () => {
  it('removes the reported duplicate label', () => {
    expect(stripAnswerLabel('Javob: Javob: 1,25 (C varianti)')).toBe('1,25 (C varianti)')
  })

  it('removes a single label in any casing or language', () => {
    expect(stripAnswerLabel('Javob: 42')).toBe('42')
    expect(stripAnswerLabel('JAVOB: 42')).toBe('42')
    expect(stripAnswerLabel('Answer: 42')).toBe('42')
  })

  it('keeps a label that is meaningful mid-sentence', () => {
    const s = 'Tenglamaning Javob: qismi muhim'
    expect(stripAnswerLabel(s)).toBe(s)
  })

  it('does not strip content that merely starts with similar words', () => {
    expect(stripAnswerLabel('Javobni tekshiramiz')).toBe('Javobni tekshiramiz')
  })

  it('collapses runaway blank lines', () => {
    expect(normalizeAnswerText('Javob:\n\n\n\n1,25')).toBe('1,25')
  })

  it('is safe on empty input', () => {
    expect(normalizeAnswerText('')).toBe('')
  })
})
