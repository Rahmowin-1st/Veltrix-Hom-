/**
 * Page-addressable PDF text extraction via pdf.js.  (V9)
 *
 * The durable worker needs to read ONE page at a time from a checkpoint,
 * without re-parsing the whole document. pdf-parse only exposes a
 * whole-document pass, which is exactly what forced V8 to re-parse a book
 * every 12 pages. pdf.js gives random `getPage(n)` access instead, so a
 * resumed job continues from `checkpoint_page` at O(1) cost per page.
 *
 * Text extraction needs no canvas (that is only for rendering), so this
 * module has no native dependency — image rendering stays in pdfVision.ts.
 */

// The legacy build is the one meant for Node / non-bundled environments.
import {
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfHandle {
  numPages: number
  doc: PDFDocumentProxy
  destroy: () => Promise<void>
}

/** Opens a PDF once. Throws on an unreadable/encrypted document so the
 *  caller can fall back to visual-only handling. */
export async function openPdf(buf: Buffer): Promise<PdfHandle> {
  // A fresh copy: pdf.js takes ownership of the underlying ArrayBuffer.
  const data = new Uint8Array(buf)
  const doc = await getDocument({
    data,
    // Node has no DOM; keep pdf.js from reaching for browser-only features.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise

  return {
    numPages: doc.numPages,
    doc,
    destroy: async () => {
      try { await doc.cleanup() } catch { /* best effort */ }
      try { await doc.destroy() } catch { /* best effort */ }
    },
  }
}

/**
 * Extracts one page's text, reconstructing line breaks from the vertical
 * position of each text run — the same heuristic the V8 pdf-parse path used,
 * so the stored text (and therefore chunking and printed-page detection)
 * stays identical. Frees the page's operator list afterwards to bound memory.
 */
export async function extractPageText(pdf: PdfHandle, pageNumber: number): Promise<string> {
  const page = await pdf.doc.getPage(pageNumber)
  try {
    const content = await page.getTextContent()
    const lines: string[] = []
    let lastY: number | null = null
    let line = ''
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const text = item.str ?? ''
      const y = item.transform?.[5] ?? null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2.5) {
        if (line.trim()) lines.push(line.trim())
        line = text
      } else {
        line += `${line ? ' ' : ''}${text}`
      }
      lastY = y
    }
    if (line.trim()) lines.push(line.trim())
    return lines.join('\n').trim()
  } finally {
    // Release the page's resources so a long book does not accumulate them.
    page.cleanup()
  }
}
