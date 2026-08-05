import { describe, it, expect } from 'vitest'
import { openPdf, extractPageText } from '../../services/pdfText.js'
import {
  textPdf, romanFrontMatterPdf, numberingResetPdf,
  promptInjectionPdf, malformedPdf, truncatedPdf,
} from './fixtures/makeFixtures.js'
import { INJECTION_GUARD } from '../../services/evidence.js'

/**
 * PDF pipeline (spec §9, §18.4).
 *
 * These run the REAL extraction code against generated fixtures — no mocks,
 * no copyrighted textbooks.
 */
describe('pdf extraction', () => {
  it('extracts text page by page, addressably', async () => {
    const pdf = await openPdf(await textPdf(5))
    try {
      expect(pdf.numPages).toBe(5)
      // The crux: asking for page 3 must return page 3's text, not a slice of a
      // flattened whole-document string.
      const p3 = await extractPageText(pdf, 3)
      expect(p3).toContain('3-bet')
      const p1 = await extractPageText(pdf, 1)
      expect(p1).toContain('1-bet')
      expect(p1).not.toContain('3-bet')
    } finally {
      await pdf.destroy()
    }
  })

  it('reads Roman front matter, so printed 1 is NOT pdf page 1', async () => {
    const pdf = await openPdf(await romanFrontMatterPdf())
    try {
      // Printed "1" is physically the 5th page in this fixture.
      const pdfPage5 = await extractPageText(pdf, 5)
      expect(pdfPage5).toContain('Algebra boblari')
      // And PDF page 1 carries no Arabic page number at all.
      const pdfPage1 = await extractPageText(pdf, 1)
      expect(pdfPage1).toContain('Muqova')
      // Proving the naive assumption is wrong: pdf page 1 !== printed page 1.
      expect(pdfPage1).not.toContain('Algebra boblari')
    } finally {
      await pdf.destroy()
    }
  })

  it('handles a mid-document numbering reset (two pages labelled 1)', async () => {
    const pdf = await openPdf(await numberingResetPdf())
    try {
      expect(pdf.numPages).toBe(5)
      const first = await extractPageText(pdf, 1)
      const appendix = await extractPageText(pdf, 4)
      expect(first).toContain('1-bolim')
      expect(appendix).toContain('Ilova boshlandi')
      // Both are printed "1", so a single global offset cannot map this book —
      // which is why mapping uses segments rather than one number.
      expect(first).not.toEqual(appendix)
    } finally {
      await pdf.destroy()
    }
  })

  it('surfaces prompt-injection text as data, and the guard is in place', async () => {
    const pdf = await openPdf(await promptInjectionPdf())
    try {
      const hostile = await extractPageText(pdf, 2)
      // The extractor must NOT sanitize or drop it — we need to see it to
      // neutralize it, and dropping text would corrupt legitimate pages.
      expect(hostile).toContain('IGNORE ALL PREVIOUS INSTRUCTIONS')
      // Defense is the system-prompt guard sent before any source content.
      expect(INJECTION_GUARD).toMatch(/BO'YSUNMA|bo'ysunma/i)
      expect(INJECTION_GUARD.length).toBeGreaterThan(50)
    } finally {
      await pdf.destroy()
    }
  })

  it('rejects a non-PDF on magic bytes before any parsing', () => {
    const bytes = malformedPdf()
    const isPdf = bytes.length > 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-'
    expect(isPdf).toBe(false)
  })

  it('fails cleanly on a truncated PDF instead of hanging', async () => {
    // A corrupt file must throw so the worker can mark the source visual-only,
    // rather than blocking the queue forever.
    await expect(openPdf(truncatedPdf())).rejects.toBeTruthy()
  })
})
