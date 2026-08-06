import { pdf as loadPdfImages } from 'pdf-to-img'

/**
 * Scanned PDFs have no text layer, so a text search can never find "page
 * 127". The only reliable way to answer a page-specific question is to show
 * the model the actual page — but sending an entire 1000+ page book inline
 * is slow, expensive, and in practice unreliable: the model tends to give up
 * and report "not found" rather than hunt through hundreds of page images.
 *
 * Instead we rasterize a small, targeted window of pages around the page the
 * user mentioned and send only those. This is fast (a few hundred ms per
 * page via direct random access, not a full-document decode) and dramatically
 * more accurate, because the model only ever looks at a handful of pages.
 */

export interface RenderedPage {
  mimeType: 'image/png'
  data: string
  /** 1-based index within the PDF, i.e. the raw PDF page — not the printed
   *  page number, which may be offset by a cover or table of contents. */
  pdfPage: number
}

const SCALE = 1.6
/** Hard ceiling on images sent in one request — keeps payload and token
 *  usage bounded no matter how wide a window is requested. */
const MAX_IMAGES = 10

/**
 * Renders a window of pages around `centerPage` (a 1-based PDF page index).
 * The window is asymmetric — a little before, more after — because a wrong
 * guess about cover-page offset is more often "the real page is a few pages
 * later than expected" than earlier.
 */
export async function renderPageWindow(
  pdfBytes: Buffer,
  centerPage: number,
  pageCount: number | null,
  before = 3,
  after = 6
): Promise<RenderedPage[]> {
  const total = pageCount && pageCount > 0 ? pageCount : centerPage + after
  const from = Math.max(1, centerPage - before)
  const to = Math.min(total, centerPage + after, from + MAX_IMAGES - 1)
  if (from > total) return []

  const doc = await loadPdfImages(pdfBytes, { scale: SCALE })
  try {
    const pages: RenderedPage[] = []
    for (let p = from; p <= to; p++) {
      try {
        const buf = await doc.getPage(p)
        pages.push({ mimeType: 'image/png', data: buf.toString('base64'), pdfPage: p })
      } catch {
        // A single unreadable page (corrupt stream, etc.) should not sink
        // the whole window — skip it and keep the neighbours.
      }
    }
    return pages
  } finally {
    await doc.destroy()
  }
}

/**
 * When the user asks a general question with no page number, we cannot
 * search a scanned book by text. As a best-effort substitute we sample a
 * handful of pages spread across the document, so the model has *some*
 * visual grounding and can at least point the user to the right area
 * ("look around page 340") instead of failing outright.
 */
export async function renderSkimSample(
  pdfBytes: Buffer,
  pageCount: number | null,
  sampleSize = 6
): Promise<RenderedPage[]> {
  const total = pageCount && pageCount > 0 ? pageCount : sampleSize
  if (total <= sampleSize) {
    // Small enough to just show every page.
    const doc = await loadPdfImages(pdfBytes, { scale: SCALE })
    try {
      const pages: RenderedPage[] = []
      for (let p = 1; p <= total; p++) {
        try {
          const buf = await doc.getPage(p)
          pages.push({ mimeType: 'image/png', data: buf.toString('base64'), pdfPage: p })
        } catch { /* skip unreadable page */ }
      }
      return pages
    } finally {
      await doc.destroy()
    }
  }

  const indices = new Set<number>()
  for (let i = 0; i < sampleSize; i++) {
    const p = Math.max(1, Math.min(total, Math.round((i / (sampleSize - 1)) * (total - 1)) + 1))
    indices.add(p)
  }

  const doc = await loadPdfImages(pdfBytes, { scale: SCALE })
  try {
    const pages: RenderedPage[] = []
    for (const p of [...indices].sort((a, b) => a - b)) {
      try {
        const buf = await doc.getPage(p)
        pages.push({ mimeType: 'image/png', data: buf.toString('base64'), pdfPage: p })
      } catch { /* skip unreadable page */ }
    }
    return pages
  } finally {
    await doc.destroy()
  }
}

/**
 * Rasterizes exactly one page. Used by the OCR stage, which works page by
 * page under a lease and must not pay for decoding a window it will not use.
 */
export async function renderSinglePage(
  pdfBytes: Buffer,
  pdfPage: number,
  scale = SCALE
): Promise<RenderedPage | null> {
  const doc = await loadPdfImages(pdfBytes, { scale })
  try {
    const buf = await doc.getPage(pdfPage)
    return { mimeType: 'image/png', data: buf.toString('base64'), pdfPage }
  } catch {
    return null
  } finally {
    await doc.destroy()
  }
}
