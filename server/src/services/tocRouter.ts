import { admin } from './supabase.js'
import { locatePrintedPage } from './pageLocator.js'

/**
 * Table-of-contents routing.
 *
 * For a scanned book we cannot text-search pages that have not been OCR'd
 * yet, and OCR-ing a 1,400-page book before answering anything is neither
 * fast nor free. The table of contents solves the cold-start problem: it is a
 * handful of pages that tell us *where* a topic lives, so we can OCR that
 * small range on demand instead of the whole book.
 *
 * A TOC entry is a ROUTING CLUE, never evidence. Nothing here is ever cited;
 * it only decides which pages are worth reading. The answer must still come
 * from text or an image we actually read.
 */

export interface TocCandidate {
  topic: string
  printedPage: number | null
  printedPageEnd: number | null
  confidence: number
}

/**
 * Persists a parsed table of contents atomically: the previous parse is
 * replaced and the source's TOC state is stamped in one RPC, so the stage
 * cannot half-apply or run twice.
 */
export async function saveTocEntries(
  userId: string,
  sourceId: string,
  entries: TocCandidate[],
  evidencePdfPage: number | null,
): Promise<number> {
  const payload = entries
    .filter((e) => e.topic.trim().length > 1)
    .slice(0, 500)
    .map((e) => ({
      topic: e.topic.trim().slice(0, 300),
      printed_page: e.printedPage,
      printed_page_end: e.printedPageEnd,
      depth: 0,
      confidence: e.confidence,
    }))

  const { data, error } = await admin.rpc('replace_toc_entries', {
    p_user_id: userId,
    p_source_id: sourceId,
    p_entries: payload,
    p_evidence_pdf_page: evidencePdfPage,
  })
  if (error) { console.error('[toc:save]', error.message); return 0 }
  const count = typeof data === 'number' ? data : 0
  return count < 0 ? 0 : count
}

/**
 * A table-of-contents line looks like "Chapter title .......... 127".
 * We deliberately parse text rather than call a model here: TOC lines are
 * highly regular, and routing is only a hint — spending a model call (and a
 * quota unit) on a hint that is later verified against real pages is not
 * worth it.
 */
const TOC_LINE = /^\s*(.{3,120}?)[\s.·•\-–—_]{2,}(\d{1,4})\s*$/
/** A page that looks like a table of contents rather than prose. */
const TOC_HEADING = /\b(mundarija|contents|table of contents|ichak|bo['`’]?limlar)\b/i

export function parseTocPage(text: string): TocCandidate[] {
  const out: TocCandidate[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.length > 200) continue
    const match = TOC_LINE.exec(line)
    if (!match) continue
    const topic = (match[1] ?? '').replace(/[\s.·•\-–—_]+$/, '').trim()
    const page = Number.parseInt(match[2] ?? '', 10)
    if (topic.length < 3 || !Number.isFinite(page) || page < 1 || page > 5000) continue
    // A line that is mostly digits is a page-number band, not a topic.
    if (/^[\d\s.,:;·•\-–—]+$/.test(topic)) continue
    out.push({ topic, printedPage: page, printedPageEnd: null, confidence: 0.7 })
  }
  return out
}

/** True when a page reads like a table of contents worth parsing. */
export function looksLikeToc(text: string): boolean {
  if (TOC_HEADING.test(text.slice(0, 400))) return true
  // Otherwise require several dotted-leader lines — one or two could be
  // ordinary prose that happens to end in a number.
  let hits = 0
  for (const line of text.split(/\r?\n/)) {
    if (TOC_LINE.test(line.trim())) hits++
    if (hits >= 4) return true
  }
  return false
}

export interface RoutedRange {
  /** 1-based PDF page indices worth reading for this query. */
  fromPdfPage: number
  toPdfPage: number
  topic: string
  confidence: number
}

/**
 * Finds candidate PDF page ranges for a free-text question by matching it
 * against the stored TOC, then translating each hit's printed page into a
 * real PDF index through the page locator.
 */
export async function routeQuery(
  sourceId: string,
  query: string,
  maxRanges = 2
): Promise<RoutedRange[]> {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .slice(0, 6)
  if (!terms.length) return []

  // Trigram-indexed ILIKE over the topic column; cheap and typo-tolerant enough
  // for chapter titles.
  const { data, error } = await admin
    .from('source_toc_entries')
    .select('topic,printed_page,printed_page_end,confidence')
    .eq('source_id', sourceId)
    .or(terms.map((t) => `topic.ilike.%${t}%`).join(','))
    .order('confidence', { ascending: false })
    .limit(maxRanges * 3)
  if (error || !data?.length) return []

  const ranges: RoutedRange[] = []
  for (const entry of data) {
    if (entry.printed_page == null) continue
    const start = await locatePrintedPage(sourceId, entry.printed_page)
    if (!start) continue
    const endPrinted = entry.printed_page_end ?? entry.printed_page + 4
    const end = await locatePrintedPage(sourceId, endPrinted)
    ranges.push({
      fromPdfPage: start.pdfIndex,
      // Cap the span: an unresolved end must not turn into "read 300 pages".
      toPdfPage: Math.min(end?.pdfIndex ?? start.pdfIndex + 4, start.pdfIndex + 12),
      topic: entry.topic,
      confidence: entry.confidence,
    })
    if (ranges.length >= maxRanges) break
  }
  return ranges
}

/**
 * Honest coverage summary for a source, so the UI and the model can both say
 * "I have read 120 of 1,467 pages" instead of implying the whole book is
 * searchable.
 */
export interface Coverage {
  totalPages: number
  searchablePages: number
  ocrDone: number
  ocrTotal: number
  printedMapConfidence: number
  complete: boolean
}

export async function sourceCoverage(sourceId: string): Promise<Coverage | null> {
  const { data } = await admin
    .from('sources')
    .select('page_count,indexed_pages,ocr_pages_done,ocr_pages_total,printed_map_confidence')
    .eq('id', sourceId)
    .maybeSingle()
  if (!data) return null
  const totalPages = data.page_count ?? 0
  const searchablePages = data.indexed_pages ?? 0
  return {
    totalPages,
    searchablePages,
    ocrDone: data.ocr_pages_done ?? 0,
    ocrTotal: data.ocr_pages_total ?? 0,
    printedMapConfidence: data.printed_map_confidence ?? 0,
    complete: totalPages > 0 && searchablePages >= totalPages,
  }
}
