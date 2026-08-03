/**
 * Speech layer.
 *
 * Two jobs: pick a voice that genuinely matches the requested language,
 * and normalise text so symbols are spoken the way a reader would say
 * them. Nothing here claims a capability the device does not have — if
 * no matching voice exists, `pickVoice` returns null and the caller
 * shows a real message instead of speaking in the wrong language.
 */

export const speechSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window

let cachedVoices: SpeechSynthesisVoice[] = []

export function loadVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported) return []
  cachedVoices = window.speechSynthesis.getVoices()
  return cachedVoices
}

if (speechSupported) {
  loadVoices()
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
}

/**
 * Exact locale first, then the base language, then nothing.
 * Never falls back to a different language pretending to match.
 */
export function pickVoice(bcp47: string, preferredName?: string): SpeechSynthesisVoice | null {
  const voices = cachedVoices.length ? cachedVoices : loadVoices()
  if (!voices.length) return null

  if (preferredName) {
    const named = voices.find((v) => v.name === preferredName)
    if (named) return named
  }

  const target = bcp47.toLowerCase()
  const base = target.split('-')[0] ?? target

  return (
    voices.find((v) => v.lang.toLowerCase() === target) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === target) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`)) ??
    voices.find((v) => v.lang.toLowerCase() === base) ??
    null
  )
}

/** Voices that really exist for a language — used to populate settings. */
export function voicesFor(bcp47: string): SpeechSynthesisVoice[] {
  const voices = cachedVoices.length ? cachedVoices : loadVoices()
  const base = bcp47.toLowerCase().split('-')[0] ?? bcp47
  return voices.filter((v) => v.lang.toLowerCase().startsWith(base))
}

interface SpeakOptions {
  voice?: SpeechSynthesisVoice | null
  lang?: string
  rate?: number
  onEnd?: () => void
  onError?: () => void
}

export function speak(text: string, opts: SpeakOptions = {}) {
  if (!speechSupported) { opts.onError?.(); return }
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(normaliseForSpeech(text, opts.lang))
  if (opts.voice) utterance.voice = opts.voice
  if (opts.lang) utterance.lang = opts.lang
  utterance.rate = clamp(opts.rate ?? 1, 0.5, 2)

  utterance.onend = () => opts.onEnd?.()
  utterance.onerror = () => { opts.onError?.(); opts.onEnd?.() }

  window.speechSynthesis.speak(utterance)
}

export function cancelSpeech() {
  if (speechSupported) window.speechSynthesis.cancel()
}

export function pauseSpeech() {
  if (speechSupported) window.speechSynthesis.pause()
}

export function resumeSpeech() {
  if (speechSupported) window.speechSynthesis.resume()
}

/**
 * Symbols read aloud the way a person would say them.
 *
 * Punctuation is preserved, not stripped — full stops and commas are what
 * give synthesised speech its rhythm. Only genuinely ambiguous symbols are
 * expanded, and only when the surrounding characters make the maths reading
 * the right one: "3 + 4" becomes "3 plus 4", while "Covid-19" and "2026-08-02"
 * are left alone.
 */
export function normaliseForSpeech(text: string, lang = 'uz'): string {
  const base = lang.split('-')[0] ?? 'uz'
  const words = SPOKEN[base] ?? SPOKEN.uz!

  return text
    // Maths operators: only between numbers/variables, with spaces around them.
    .replace(/(\d|\))\s*\+\s*(?=[\d(a-zA-Z])/g, `$1 ${words.plus} `)
    .replace(/(\d|\))\s+-\s+(?=[\d(a-zA-Z])/g, `$1 ${words.minus} `)
    .replace(/(\d|\))\s*[×x*]\s*(?=[\d(a-zA-Z])/g, `$1 ${words.times} `)
    .replace(/(\d|\))\s*[÷/]\s*(?=\d)/g, `$1 ${words.divide} `)
    .replace(/(\d|\))\s*=\s*(?=[\d(a-zA-Z-])/g, `$1 ${words.equals} `)
    .replace(/(\d)\s*%/g, `$1 ${words.percent}`)
    // Ratios like 3:4 are read as a ratio; a colon in prose stays a pause.
    .replace(/(\d)\s*:\s*(?=\d)/g, `$1 ${words.ratio} `)
    // Degrees and common units.
    .replace(/(\d)\s*°C/g, `$1 ${words.celsius}`)
    .replace(/(\d)\s*°/g, `$1 ${words.degree}`)
    // Collapse whitespace without touching sentence punctuation.
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

interface SpokenWords {
  plus: string; minus: string; times: string; divide: string
  equals: string; percent: string; ratio: string; degree: string; celsius: string
}

const SPOKEN: Record<string, SpokenWords> = {
  uz: {
    plus: "qo'shuv", minus: 'ayirish', times: "ko'paytiruv", divide: "bo'linish",
    equals: 'teng', percent: 'foiz', ratio: 'ga', degree: 'gradus', celsius: 'gradus Selsiy',
  },
  en: {
    plus: 'plus', minus: 'minus', times: 'times', divide: 'divided by',
    equals: 'equals', percent: 'percent', ratio: 'to', degree: 'degrees', celsius: 'degrees Celsius',
  },
  ru: {
    plus: 'плюс', minus: 'минус', times: 'умножить на', divide: 'разделить на',
    equals: 'равно', percent: 'процентов', ratio: 'к', degree: 'градусов', celsius: 'градусов Цельсия',
  },
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}
