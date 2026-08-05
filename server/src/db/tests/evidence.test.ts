import { describe, it, expect } from 'vitest'
import { buildEvidence, validateEvidence, type EvidenceItem } from '../../services/evidence.js'

/**
 * Evidence-locked answers (spec §10, §18.5).
 *
 * The property under test: a page number can only ever come from the server's
 * own record. A model that invents "page 412" — or cites an evidence ID that
 * was never issued — must produce no citation at all.
 */
function item(over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'chunk:11111111-1111-1111-1111-111111111111',
    kind: 'chunk',
    sourceId: 'src-1',
    sourceTitle: 'Algebra',
    sourcePageId: null,
    chunkId: '11111111-1111-1111-1111-111111111111',
    pdfPageIndex: 12,
    displayPage: 12,
    printedPage: null,
    text: '2 + 2 = 4',
    ...over,
  }
}

describe('evidence locking', () => {
  it('issues opaque IDs and a prompt block the model can cite', () => {
    const { promptBlock, allowed } = buildEvidence([item()])
    expect(allowed.size).toBe(1)
    expect(promptBlock).toContain('EVIDENCE')
    expect(promptBlock).toContain('2 + 2 = 4')
  })

  it('accepts a cited ID and takes the page from the SERVER record', () => {
    const { allowed } = buildEvidence([item({ displayPage: 12 })])
    const parsed = {
      evidenceIds: ['chunk:11111111-1111-1111-1111-111111111111'],
      // The model claims page 999 — it must be ignored in favour of page 12.
      citations: [{ page: 999, quote: '2 + 2 = 4' }],
    }
    const result = validateEvidence(parsed, allowed, true)
    expect(result.citations.length).toBe(1)
    expect(result.citations[0]?.page).toBe(12)
    expect(result.rows.length).toBe(1)
  })

  it('drops an evidence ID that was never issued', () => {
    const { allowed } = buildEvidence([item()])
    const parsed = {
      evidenceIds: ['chunk:deadbeef-0000-0000-0000-000000000000'],
      citations: [{ page: 5 }],
    }
    const result = validateEvidence(parsed, allowed, true)
    // Nothing verifiable was cited, so no citation is shown at all.
    expect(result.citations.length).toBe(0)
    expect(result.rows.length).toBe(0)
  })

  it('shows no citation when the model cites nothing, even with sources present', () => {
    const { allowed } = buildEvidence([item()])
    const result = validateEvidence({ evidenceIds: [], citations: [{ page: 77 }] }, allowed, true)
    expect(result.citations.length).toBe(0)
  })

  it('de-duplicates a repeated evidence ID', () => {
    const id = 'chunk:11111111-1111-1111-1111-111111111111'
    const { allowed } = buildEvidence([item()])
    const result = validateEvidence({ evidenceIds: [id, id, id], citations: [] }, allowed, true)
    expect(result.citations.length).toBe(1)
  })

  it('locks a structured exercise item to its real page', () => {
    const exercise = item({
      id: 'exercise:22222222-2222-2222-2222-222222222222',
      kind: 'exercise',
      chunkId: null,
      pdfPageIndex: 127,
      displayPage: 127,
      text: '[4] Tenglamani yeching',
    })
    const { allowed } = buildEvidence([exercise])
    const result = validateEvidence(
      { evidenceIds: ['exercise:22222222-2222-2222-2222-222222222222'], citations: [] },
      allowed, true,
    )
    expect(result.citations[0]?.page).toBe(127)
    expect(result.usedPages).toContain(127)
  })

  it('passes model citations through when there is genuinely no source', () => {
    // A general-knowledge answer has nothing to lock against; suppressing its
    // citations would be wrong, so passthrough is the correct behaviour.
    const result = validateEvidence({ citations: [{ page: 3 }] }, new Map(), false)
    expect(result.citations.length).toBe(1)
  })
})
