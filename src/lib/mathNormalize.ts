/**
 * Answer text normalization.
 *
 * Two real defects motivate this file:
 *
 *  1. A model sometimes emits LaTeX without the `$` delimiters, so a correct
 *     answer reached the user as literal `\frac{\sqrt[5]{17}}{\sqrt[5]{544}}`.
 *     The mathematics was right; the presentation was unusable.
 *  2. The server and the model could each prepend an answer label, producing
 *     `Javob: Javob: 1,25 (C varianti)`.
 *
 * Both are fixed at the source (server schema + prompt), but the client must
 * never depend on a model behaving. These functions are the last line of
 * defence and are deliberately conservative: it is far better to show plain
 * text than to mangle prose that merely contained a backslash.
 */

/** A segment of an answer string: literal prose, or math to hand to KaTeX. */
export type MathSegment =
  | { kind: 'text'; value: string }
  | { kind: 'inline'; value: string }
  | { kind: 'block'; value: string }

/**
 * LaTeX commands we are willing to rescue when they appear undelimited.
 * Kept narrow on purpose — these are unambiguous in ordinary Uzbek/English
 * prose, unlike `\n` or a Windows path.
 */
const RESCUABLE = [
  'frac', 'dfrac', 'tfrac', 'sqrt', 'sum', 'int', 'lim', 'binom',
  'cdot', 'times', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx',
  'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'lambda', 'mu', 'sigma', 'omega',
  'infty', 'log', 'ln', 'sin', 'cos', 'tan', 'cot', 'left', 'right',
]
const RESCUABLE_SET = new Set(RESCUABLE)

/**
 * Walks from the start of a `\command` and returns the end index of the whole
 * expression, consuming its `{...}` / `[...]` arguments (brace-balanced) and
 * any immediately following `^{...}` / `_{...}`.
 *
 * Returns -1 when this is not a command we rescue.
 */
function scanCommand(text: string, start: number): number {
  let i = start + 1 // skip the backslash
  let name = ''
  while (i < text.length && /[a-zA-Z]/.test(text[i]!)) { name += text[i]!; i++ }
  if (!RESCUABLE_SET.has(name)) return -1

  // Consume arguments and their nested braces.
  for (;;) {
    // `\sqrt[3]{x}` — optional bracket argument.
    if (text[i] === '[') {
      const close = text.indexOf(']', i)
      if (close === -1) return -1 // truncated optional argument
      i = close + 1
      continue
    }
    if (text[i] === '{') {
      let depth = 0
      let j = i
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') { depth--; if (depth === 0) { j++; break } }
      }
      // Unbalanced braces mean truncated LaTeX. Rescuing a fragment would
      // hand KaTeX something it cannot parse, so abandon the whole command
      // and let it render as plain text.
      if (depth !== 0) return -1
      i = j
      continue
    }
    if (text[i] === '^' || text[i] === '_') {
      i++
      if (text[i] === '{') { continue } // handled by the brace branch next loop
      if (i < text.length) i++          // single-character super/subscript
      continue
    }
    break
  }
  return i
}

/**
 * Widens a rescued command to include the surrounding arithmetic it belongs
 * to, so `\frac{a}{b} = 1,25` renders as one expression rather than a fraction
 * followed by loose text. Only simple operator/number runs are absorbed.
 */
const TRAILING_MATH = /^\s*(?:[=+\-*/^_<>]|\\cdot|\\times|\\div|\\pm|\\leq|\\geq|\\neq|\\approx)\s*[-\d.,\s]*/

/**
 * Splits an answer string into renderable segments.
 *
 * Explicit `$...$` / `$$...$$` always win. Outside them, an undelimited
 * rescuable command is promoted to inline math. Everything else stays text.
 */
export function segmentMath(input: string): MathSegment[] {
  const out: MathSegment[] = []
  if (!input) return out

  const pushText = (value: string) => {
    if (!value) return
    const last = out[out.length - 1]
    if (last?.kind === 'text') last.value += value
    else out.push({ kind: 'text', value })
  }

  let i = 0
  while (i < input.length) {
    // ---- explicit block math ----
    if (input.startsWith('$$', i)) {
      const end = input.indexOf('$$', i + 2)
      if (end !== -1) {
        out.push({ kind: 'block', value: input.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    // ---- explicit inline math ----
    if (input[i] === '$') {
      const end = input.indexOf('$', i + 1)
      if (end !== -1 && end > i + 1) {
        out.push({ kind: 'inline', value: input.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // ---- undelimited LaTeX we are willing to rescue ----
    if (input[i] === '\\') {
      const end = scanCommand(input, i)
      if (end > i) {
        let expr = input.slice(i, end)
        const rest = input.slice(end)
        const tail = TRAILING_MATH.exec(rest)
        // Absorb a trailing `= 1,25` so the equation reads as one unit.
        if (tail && tail[0].trim()) {
          expr += tail[0]
          out.push({ kind: 'inline', value: expr.trim() })
          i = end + tail[0].length
          continue
        }
        out.push({ kind: 'inline', value: expr })
        i = end
        continue
      }
    }
    pushText(input[i]!)
    i++
  }
  return out
}

/** True when the string contains math worth handing to KaTeX. */
export function hasMath(input: string): boolean {
  return segmentMath(input).some((s) => s.kind !== 'text')
}

const ANSWER_LABEL = /^\s*(javob|answer|otvet|javobi)\s*[:：]\s*/i

/**
 * Removes redundant leading answer labels — including the doubled
 * `Javob: Javob:` case — without touching the answer content itself.
 *
 * Deliberately only strips from the START of the string: "Javob:" appearing
 * mid-sentence is meaningful prose and must survive.
 */
export function stripAnswerLabel(input: string): string {
  let out = (input ?? '').trim()
  // Loop, because the duplication can be more than two deep.
  for (let guard = 0; guard < 4; guard++) {
    const next = out.replace(ANSWER_LABEL, '')
    if (next === out) break
    out = next.trim()
  }
  return out
}

/**
 * Normalizes a whole answer-block string: strips a duplicated label and
 * collapses the runaway blank lines some models emit.
 */
export function normalizeAnswerText(input: string): string {
  return stripAnswerLabel(input).replace(/\n{3,}/g, '\n\n').trim()
}
