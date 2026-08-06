/**
 * Server-side repair of model answer output.
 *
 * The model is instructed to emit clean blocks, but instructions are not a
 * guarantee. Repairing here — before anything is persisted — means a stored
 * answer is already correct, so every future read (history, another device,
 * an export) gets the clean version rather than depending on client-side
 * rescue. The client normalizer remains as a second line of defence.
 */

export interface RawBlock { type?: unknown; text?: unknown; [key: string]: unknown }

const ANSWER_LABEL = /^\s*(javob|answer|javobi)\s*[:：]\s*/i

/** Strips repeated `Javob:` prefixes without touching mid-sentence usage. */
export function stripAnswerLabel(text: string): string {
  let out = (text ?? '').trim()
  for (let guard = 0; guard < 4; guard++) {
    const next = out.replace(ANSWER_LABEL, '')
    if (next === out) break
    out = next.trim()
  }
  return out
}

/** LaTeX commands that are unambiguous enough to auto-wrap in `$…$`. */
const BARE_LATEX = /(\\(?:d|t)?frac\s*\{|\\sqrt\s*(?:\[[^\]]*\])?\s*\{|\\binom\s*\{|\\sum|\\int|\\infty)/

/**
 * Wraps undelimited LaTeX in a text block so the client renders mathematics
 * instead of source. Text already containing `$` is left alone: it is either
 * correct already, or mixing delimiters would corrupt it.
 */
export function wrapBareLatex(text: string): string {
  if (!text || text.includes('$')) return text
  if (!BARE_LATEX.test(text)) return text

  // Wrap each maximal run of LaTeX-ish characters that starts at a command.
  return text.replace(
    /\\[a-zA-Z]+(?:\s*(?:\[[^\]]*\]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}))*(?:\s*[=+\-*/^_]\s*[\w.,]+)*/g,
    (match) => (BARE_LATEX.test(match) ? `$${match.trim()}$` : match),
  )
}

/**
 * Normalizes a parsed answer: cleans every text-bearing block, removes a
 * duplicated final answer, and guarantees at most one `answer` block.
 */
export function normalizeBlocks(blocks: unknown): RawBlock[] {
  if (!Array.isArray(blocks)) return []
  const out: RawBlock[] = []
  let answerSeen = false

  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const block = { ...(raw as RawBlock) }

    if (block.type === 'answer') {
      const text = stripAnswerLabel(String(block.text ?? ''))
      if (!text) continue
      if (answerSeen) {
        // A second answer block is the model repeating itself; the first one
        // is the one the steps led to, so the duplicate is dropped.
        continue
      }
      answerSeen = true
      block.text = wrapBareLatex(text)
      out.push(block)
      continue
    }

    if (typeof block.text === 'string') block.text = wrapBareLatex(block.text)
    if (Array.isArray(block.items)) {
      block.items = block.items.map((item) =>
        typeof item === 'string' ? wrapBareLatex(item) : item)
    }
    out.push(block)
  }
  return out
}
