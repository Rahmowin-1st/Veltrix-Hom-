export interface VoiceInputController {
  supported: boolean
  listening: boolean
  start: () => void
  stop: () => void
}

interface RecognitionEventLike extends Event {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
}
interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
interface RecognitionConstructor { new(): RecognitionLike }

export function createVoiceInput(opts: {
  lang?: string
  onText: (text: string) => void
  onState: (listening: boolean) => void
}): VoiceInputController {
  const w = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return { supported: false, listening: false, start: () => {}, stop: () => {} }

  const recognition = new Ctor()
  recognition.lang = opts.lang ?? 'uz-UZ'
  recognition.interimResults = true
  recognition.continuous = false
  let listening = false
  let finalText = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      if (!result) continue
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) finalText += `${transcript} `
      else interim += transcript
    }
    opts.onText(`${finalText}${interim}`.trim())
  }
  recognition.onend = () => { listening = false; opts.onState(false) }
  recognition.onerror = () => { listening = false; opts.onState(false) }

  return {
    supported: true,
    get listening() { return listening },
    start: () => {
      finalText = ''
      listening = true
      opts.onState(true)
      try { recognition.start() } catch { listening = false; opts.onState(false) }
    },
    stop: () => { listening = false; recognition.stop(); opts.onState(false) },
  }
}
