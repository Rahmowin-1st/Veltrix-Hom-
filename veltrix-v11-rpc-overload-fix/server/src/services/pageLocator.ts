import { admin } from './supabase.js'

/**
 * Printed-page → real PDF-index resolver.  (V9)
 *
 * A textbook's printed page 127 is almost never PDF page 127: a cover, a
 * title page and a table of contents shift the numbering, and Roman front
 * matter shifts it again. V8 rendered a window centred on the printed
 * number itself and hoped the model would cope. This resolves the printed
 * number to the actual PDF index using the confirmed anchors and validated
 * segments the worker recorded during extraction, so the rendered window is
 * centred on the RIGHT page.
 *
 * Resolution order (highest confidence first):
 *   1. an exact confirmed anchor for that printed number;
 *   2. a validated mapping segment (printed = pdf + offset);
 *   3. nothing → caller keeps the printed number as a best-effort centre and
 *      tells the model the offset is unverified.
 */

export interface LocatedPage {
  pdfIndex: number
  confidence: number
  method: 'anchor' | 'segment'
}

export async function locatePrintedPage(
  sourceId: string, printedNumber: number
): Promise<LocatedPage | null> {
  // 1) Exact confirmed anchor.
  const { data: anchor } = await admin.from('source_page_map')
    .select('pdf_page_index,confidence')
    .eq('source_id', sourceId).eq('printed_number', printedNumber)
    .order('confidence', { ascending: false }).limit(1).maybeSingle()
  if (anchor?.pdf_page_index) {
    return { pdfIndex: anchor.pdf_page_index, confidence: Math.max(0.9, anchor.confidence ?? 0.9), method: 'anchor' }
  }

  // 2) Validated segment. printed = pdf + offset  ⇒  pdf = printed - offset.
  const { data: segments } = await admin.from('source_page_segments')
    .select('pdf_start,pdf_end,offset_value,confidence,printed_kind')
    .eq('source_id', sourceId).eq('printed_kind', 'arabic')
    .order('confidence', { ascending: false })
  for (const seg of segments ?? []) {
    const pdf = printedNumber - (seg.offset_value as number)
    if (pdf >= (seg.pdf_start as number) && pdf <= (seg.pdf_end as number)) {
      return { pdfIndex: pdf, confidence: seg.confidence as number, method: 'segment' }
    }
  }
  return null
}

/**
 * Given the resolver result, returns the PDF page the render window should
 * centre on and a human note about how sure we are. When resolution fails
 * we fall back to the printed number itself but say so, so the model knows
 * the offset is unverified rather than trusting it.
 */
export async function resolveRenderCenter(
  sourceId: string, printedNumber: number
): Promise<{ center: number; note: string }> {
  const located = await locatePrintedPage(sourceId, printedNumber)
  if (located) {
    return {
      center: located.pdfIndex,
      note: located.method === 'anchor'
        ? `Bosma ${printedNumber}-bet tasdiqlangan bog'lanish bo'yicha PDF ${located.pdfIndex}-betga to'g'ri keladi.`
        : `Bosma ${printedNumber}-bet tekshirilgan segment bo'yicha taxminan PDF ${located.pdfIndex}-bet (ishonch ${(located.confidence * 100).toFixed(0)}%). Yaqin betlarni ham ko'r.`,
    }
  }
  return {
    center: printedNumber,
    note: `Bosma ${printedNumber}-bet uchun tasdiqlangan bog'lanish yo'q. PDF indeksi ${printedNumber} atrofidagi oynani ko'r; muqova sabab bosma raqam siljigan bo'lishi mumkin — betdagi bosma raqamni ko'zdan kechirib to'g'ri betni tanla.`,
  }
}
