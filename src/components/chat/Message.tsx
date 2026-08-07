import { memo, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Copy, FileAudio, FileText, RotateCcw, Square, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react'
import { AnswerBlocks } from './AnswerBlocks'
import { useAuthStore } from '@/store/authStore'
import type { AnswerBlock, Citation, SourceMode } from '@/types'
// Shared with find-in-chat so Copy and search see identical content.
import { blocksToPlainText as blocksToText } from '@/lib/blocksToText'

export interface TurnAttachment { mimeType: string; data: string; kind?: 'image'|'audio'|'file'; name?: string; size?: number; ext?: string }
export interface Turn {
  id: string
  role: 'user' | 'assistant'
  text?: string
  image?: TurnAttachment | null
  blocks?: AnswerBlock[]
  subject?: string | null
  topic?: string
  citations?: Citation[]
  followups?: string[]
  sourceMode?: SourceMode
  pagesUsed?: number[]
  cached?: boolean
  error?: string
  /** True while a regenerate is replacing this turn's content in place. */
  regenerating?: boolean
  /** Per-message feedback. Mutually exclusive, toggleable. */
  feedback?: 'up' | 'down' | null
}

/**
 * A user turn is a right-aligned bubble and nothing else.
 *
 * The avatar was removed: in a two-party conversation the alignment already
 * says who is speaking, so the avatar column only cost horizontal space that
 * the message could use — the same reasoning ChatGPT and iMessage apply.
 */
export const UserMessage = memo(function UserMessage({ turn }: { turn: Turn }) {
  return <motion.div className="v5-user-row" initial={{ opacity: 0, y: 9, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .24, ease: [0.16,1,0.3,1] }}>
    <div style={{ maxWidth: 'min(84%,620px)', display: 'grid', gap: 7, justifyItems: 'end' }}>
      {turn.image && <UserAttachment attachment={turn.image}/>}
      {turn.text && <div className="v5-user-bubble">{turn.text}</div>}
    </div>
  </motion.div>
})

function UserAttachment({ attachment }: { attachment: TurnAttachment }) {
  const kind = attachment.kind ?? (attachment.mimeType.startsWith('image/') ? 'image' : attachment.mimeType.startsWith('audio/') ? 'audio' : 'file')
  if (kind === 'image') return <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="Yuborilgan rasm" style={{ maxWidth: 230, maxHeight: 260, borderRadius: 22, objectFit: 'cover', border: '1px solid rgba(255,255,255,.6)', boxShadow: '0 13px 32px rgba(10,108,255,.18)' }}/>
  const Icon = kind === 'audio' ? FileAudio : FileText
  return <div className="v5-user-bubble row" style={{ gap: 9, padding: '10px 13px' }}><Icon size={19}/><span className="truncate" style={{ maxWidth: 210 }}>{attachment.name || (kind === 'audio' ? 'Audio' : 'Fayl')}</span></div>
}

export const AssistantMessage = memo(function AssistantMessage({ turn, onFollowup, onRetry, onRegenerate, onFeedback, searchHit }: {
  turn: Turn
  onFollowup: (text:string)=>void
  onRetry?:()=>void
  /** Re-runs the original request and replaces THIS turn's content. */
  onRegenerate?: (turnId: string) => void
  onFeedback?: (turnId: string, value: 'up' | 'down' | null) => void
  searchHit?: boolean
}) {
  return <motion.div className="v5-ai-row" id={`turn-${turn.id}`} data-search-hit={searchHit ? '' : undefined}
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [0.16,1,0.3,1] }}>
    {/*
      The assistant answer sits directly on the page. The old outer card wrapped
      every response in a giant rounded container, which meant a warning card or
      an answer card inside it became a card-inside-a-card. Semantic blocks keep
      their own boundaries; the message itself no longer has one.

      The avatar and the subject/identity chip ("Ta'lim") are gone too: in a
      two-party chat they repeat what the layout already conveys.
    */}
    <div className="v5-ai-body" data-regenerating={turn.regenerating ? '' : undefined}>
      {turn.error
        ? <ErrorTurn message={turn.error} onRetry={onRetry}/>
        : <AnswerBlocks blocks={turn.blocks ?? []}/>}

      {/* Page grounding is real information, not identity, so it stays. */}
      {!!turn.pagesUsed?.length && (
        <div className="v5-ai-meta">{turn.pagesUsed.join(', ')}-bet</div>
      )}

      {!!turn.citations?.length && <Citations citations={turn.citations}/>}
      {!turn.error && !turn.regenerating && (
        <MessageActions turn={turn} onRegenerate={onRegenerate} onFeedback={onFeedback}/>
      )}

      {!!turn.followups?.length && <div className="row hide-sb" style={{ gap: 7, overflowX: 'auto', paddingTop: 2 }}>
        {turn.followups.map((followup, index) => <button key={`${followup}-${index}`} className="v5-action-chip" onClick={() => onFollowup(followup)}>{followup}</button>)}
      </div>}
    </div>
  </motion.div>
})

function ErrorTurn({ message, onRetry }: { message:string; onRetry?:()=>void }) {
  return <div role="alert" style={{ display: 'grid', gap: 10, color: 'var(--danger)' }}><span>{message}</span>{onRetry && <button className="v5-action-chip" style={{ justifySelf: 'start' }} onClick={onRetry}><RotateCcw size={15}/> Qayta urinish</button>}</div>
}

function Citations({ citations }: { citations:Citation[] }) {
  const [open,setOpen] = useState(false)
  return <div className="surface-2" style={{ marginTop: 12, padding: '9px 10px', borderRadius: 17 }}>
    <button className="row" onClick={() => setOpen((value) => !value)} aria-expanded={open} style={{ width:'100%', border:0, background:'transparent', color:'var(--text-2)', cursor:'pointer', font:'inherit', padding:0 }}>
      <ChevronDown size={15} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition:'transform 180ms var(--ease)' }}/><strong style={{ fontSize:12 }}>Manba · {citations.length} ta dalil</strong>
    </button>
    {open && <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} style={{ display:'grid', gap:8, paddingTop:9 }}>
      {citations.map((citation,index) => <div key={`${citation.page}-${index}`}><span className="micro">{citation.page}-bet{citation.ref ? ` · ${citation.ref}` : ''}</span>{citation.quote && <blockquote style={{ margin:'4px 0 0', paddingLeft:10, borderLeft:'2px solid var(--brand)', color:'var(--text-2)', fontSize:12, lineHeight:1.55 }}>{citation.quote}</blockquote>}</div>)}
    </motion.div>}
  </div>
}

/**
 * A single global speech controller.
 *
 * Browsers expose ONE `speechSynthesis` queue, so without a shared owner,
 * starting playback on a second message layers two voices over each other and
 * the first message's button is left showing "stop" for speech that already
 * ended. Tracking the speaking turn id in a module-level store makes handoff
 * between messages correct by construction.
 */
const speechListeners = new Set<(id: string | null) => void>()
let speakingTurnId: string | null = null

function setSpeaking(id: string | null) {
  speakingTurnId = id
  for (const listener of speechListeners) listener(id)
}

function useSpeakingTurn(): string | null {
  const [id, setId] = useState(speakingTurnId)
  useEffect(() => {
    speechListeners.add(setId)
    return () => { speechListeners.delete(setId) }
  }, [])
  return id
}

function MessageActions({ turn, onRegenerate, onFeedback }: {
  turn: Turn
  onRegenerate?: (turnId: string) => void
  onFeedback?: (turnId: string, value: 'up' | 'down' | null) => void
}) {
  const [copied, setCopied] = useState(false)
  const settings = useAuthStore((s) => s.settings)
  const profile = useAuthStore((s) => s.profile)
  const speakingId = useSpeakingTurn()
  const speaking = speakingId === turn.id

  // Only this message's answer blocks — never the prompt, never a neighbour.
  const plain = useMemo(() => blocksToText(turn.blocks ?? []), [turn.blocks])
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => () => {
    // Unmounting the message that is speaking must not leave audio orphaned.
    if (canSpeak && speakingTurnId === turn.id) { window.speechSynthesis.cancel(); setSpeaking(null) }
  }, [canSpeak, turn.id])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked by the browser */ }
  }

  const speak = () => {
    if (!canSpeak) return
    // Always cancel first: this both stops a re-tap and cleanly takes over
    // from whichever message was speaking before.
    window.speechSynthesis.cancel()
    if (speaking) { setSpeaking(null); return }

    const utterance = new SpeechSynthesisUtterance(plain)
    utterance.lang = profile?.school_language === 'en' ? 'en-US'
      : profile?.school_language === 'ru' ? 'ru-RU' : 'uz-UZ'
    utterance.rate = settings?.voice_rate ?? 1
    utterance.volume = settings?.voice_volume ?? 1
    const voices = window.speechSynthesis.getVoices()
    const selected = settings?.voice_name ? voices.find((voice) => voice.name === settings.voice_name) : undefined
    if (selected) utterance.voice = selected
    utterance.onend = () => setSpeaking(null)
    utterance.onerror = () => setSpeaking(null)
    setSpeaking(turn.id)
    window.speechSynthesis.speak(utterance)
  }

  // Tapping the active choice clears it, so feedback is retractable.
  const vote = (value: 'up' | 'down') =>
    onFeedback?.(turn.id, turn.feedback === value ? null : value)

  return <div className="v5-msg-actions">
    <button type="button" className="v5-msg-action" onClick={copy}
      aria-label={copied ? 'Nusxalandi' : 'Nusxalash'} title={copied ? 'Nusxalandi' : 'Nusxalash'}>
      {copied ? <Check size={16}/> : <Copy size={16}/>}
    </button>

    {onFeedback && <>
      <button type="button" className="v5-msg-action" onClick={() => vote('up')}
        data-active={turn.feedback === 'up' ? '' : undefined}
        aria-pressed={turn.feedback === 'up'} aria-label="Foydali" title="Foydali">
        <ThumbsUp size={16}/>
      </button>
      <button type="button" className="v5-msg-action" onClick={() => vote('down')}
        data-active={turn.feedback === 'down' ? '' : undefined}
        aria-pressed={turn.feedback === 'down'} aria-label="Foydali emas" title="Foydali emas">
        <ThumbsDown size={16}/>
      </button>
    </>}

    {canSpeak && <button type="button" className="v5-msg-action" onClick={speak}
      data-active={speaking ? '' : undefined}
      aria-label={speaking ? 'To‘xtatish' : 'O‘qib berish'} title={speaking ? 'To‘xtatish' : 'O‘qib berish'}>
      {speaking ? <Square size={15}/> : <Volume2 size={16}/>}
    </button>}

    {onRegenerate && <button type="button" className="v5-msg-action" onClick={() => onRegenerate(turn.id)}
      aria-label="Qayta yaratish" title="Qayta yaratish">
      <RotateCcw size={16}/>
    </button>}
  </div>
}
