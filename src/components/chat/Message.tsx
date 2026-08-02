import { memo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, Volume2, Square, RotateCcw, ChevronDown } from 'lucide-react'
import { AnswerBlocks } from './AnswerBlocks'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import type { AnswerBlock, Citation, SourceMode } from '@/types'

export interface Turn {
  id: string
  role: 'user' | 'assistant'
  text?: string
  image?: { mimeType: string; data: string } | null
  blocks?: AnswerBlock[]
  subject?: string | null
  topic?: string
  citations?: Citation[]
  followups?: string[]
  sourceMode?: SourceMode
  pagesUsed?: number[]
  cached?: boolean
  error?: string
}

/* ------------------------------ user -------------------------------- */

export const UserMessage = memo(function UserMessage({ turn }: { turn: Turn }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', justifyContent: 'flex-end' }}
    >
      <div style={{ maxWidth: '76%', display: 'grid', gap: 6, justifyItems: 'end' }}>
        {turn.image && (
          <img
            src={`data:${turn.image.mimeType};base64,${turn.image.data}`}
            alt="Yuborilgan rasm"
            style={{
              maxWidth: 200, borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
            }}
          />
        )}
        {turn.text && (
          <div
            style={{
              background: 'var(--bubble-user)',
              border: '1px solid var(--bubble-user-border)',
              borderRadius: 'var(--r-lg)',
              borderBottomRightRadius: 'var(--r-xs)',
              padding: '10px 14px',
              fontSize: 'var(--fs-body)',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {turn.text}
          </div>
        )}
      </div>
    </motion.div>
  )
})

/* --------------------------- assistant ------------------------------ */

export const AssistantMessage = memo(function AssistantMessage({
  turn,
  onFollowup,
  onRetry,
}: {
  turn: Turn
  onFollowup: (text: string) => void
  onRetry?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="ai-turn"
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
    >
      <VeltrixMark size={22} alt="Veltrix" />

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 10 }}>
        {(turn.subject || turn.pagesUsed?.length) && (
          <div className="row hide-sb" style={{ gap: 6, overflowX: 'auto' }}>
            {turn.subject && <span className="chip chip-strong">{turn.subject}</span>}
            {turn.topic && <span className="chip">{turn.topic}</span>}
            {turn.pagesUsed?.length ? (
              <span className="chip">{turn.pagesUsed.join(', ')}-bet</span>
            ) : null}
            {turn.sourceMode === 'auto' && <span className="chip">Avtomatik tanlandi</span>}
            {turn.cached && <span className="chip">Keshdan</span>}
          </div>
        )}

        {turn.error ? (
          <ErrorTurn message={turn.error} onRetry={onRetry} />
        ) : (
          <AnswerBlocks blocks={turn.blocks ?? []} />
        )}

        {!!turn.citations?.length && <Citations citations={turn.citations} />}

        {!turn.error && <MessageActions turn={turn} />}

        {!!turn.followups?.length && (
          <div className="row hide-sb" style={{ gap: 6, overflowX: 'auto', paddingTop: 2 }}>
            {turn.followups.map((f, i) => (
              <button key={i} className="chip chip-btn" onClick={() => onFollowup(f)}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
})

function ErrorTurn({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="surface"
      style={{
        padding: '12px 14px',
        borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)',
        display: 'grid', gap: 10,
      }}
    >
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{message}</span>
      {onRetry && (
        <button className="btn btn-outline" style={{ height: 34, justifySelf: 'start' }} onClick={onRetry}>
          <RotateCcw size={15} /> Qayta urinish
        </button>
      )}
    </div>
  )
}

/** Citations are rendered only from backend-returned metadata. */
function Citations({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="surface" style={{ padding: '8px 10px', borderRadius: 'var(--r-md)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-2)', fontSize: 'var(--fs-label)',
          fontFamily: 'var(--font)', padding: 2,
        }}
      >
        <ChevronDown
          size={14}
          style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
        />
        Manba · {citations.length} ta iqtibos
      </button>

      {open && (
        <div style={{ display: 'grid', gap: 8, paddingTop: 8 }}>
          {citations.map((c, i) => (
            <div key={i} style={{ display: 'grid', gap: 2 }}>
              <span className="micro">{c.page}-bet{c.ref ? ` · ${c.ref}` : ''}</span>
              {c.quote && (
                <blockquote
                  style={{
                    margin: 0, paddingLeft: 10,
                    borderLeft: '2px solid var(--border-strong)',
                    fontSize: 'var(--fs-label)', color: 'var(--text-2)',
                    lineHeight: 1.5,
                  }}
                >
                  {c.quote}
                </blockquote>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Copy + read aloud. Read aloud only appears when the device has voices. */
function MessageActions({ turn }: { turn: Turn }) {
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [canSpeak, setCanSpeak] = useState(false)

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const check = () => setCanSpeak(window.speechSynthesis.getVoices().length > 0)
    check()
    window.speechSynthesis.addEventListener('voiceschanged', check)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', check)
      window.speechSynthesis.cancel()
    }
  }, [])

  const plain = blocksToText(turn.blocks ?? [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked — silent */ }
  }

  const speak = () => {
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const u = new SpeechSynthesisUtterance(plain)
    u.lang = 'uz-UZ'
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    height: 30, padding: '0 9px', borderRadius: 'var(--r-xs)',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--text-3)', fontSize: 'var(--fs-micro)',
    fontFamily: 'var(--font)',
  }

  return (
    <div className="msg-actions row" style={{ gap: 2 }}>
      <button style={btn} onClick={copy} aria-label="Javobni nusxalash" title="Nusxalash">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Nusxalandi' : 'Nusxalash'}
      </button>

      {canSpeak && (
        <button style={btn} onClick={speak} aria-label={speaking ? "To'xtatish" : 'Ovoz bilan o\'qish'}>
          {speaking ? <Square size={14} /> : <Volume2 size={14} />}
          {speaking ? "To'xtatish" : "O'qib berish"}
        </button>
      )}
    </div>
  )
}

/** Flattens blocks into speakable / copyable plain text. */
function blocksToText(blocks: AnswerBlock[]): string {
  const out: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'answer': out.push(`Javob: ${b.text}`); break
      case 'steps': out.push(b.items.map((s, i) => `${i + 1}. ${s}`).join('\n')); break
      case 'formula': out.push(b.latex); break
      case 'rule': out.push(b.text); break
      case 'note': out.push(b.text); break
      case 'warning': out.push(b.text); break
      case 'code': out.push(b.code); break
      case 'translation': out.push(`${b.original}\n${b.translated}`); break
      case 'given': out.push(b.items.map((g) => `${g.symbol} = ${g.value}`).join(', ')); break
      case 'table': out.push([b.headers.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n')); break
      case 'timeline': out.push(b.items.map((i) => `${i.date}: ${i.event}`).join('\n')); break
      case 'compare': out.push(`To'g'ri: ${b.correct.join(', ')}. Noto'g'ri: ${b.wrong.join(', ')}`); break
      case 'chips': out.push(b.items.join(', ')); break
      case 'quiz': out.push(`${b.question}\n${b.options.join('\n')}`); break
      default: break
    }
  }
  return out.join('\n\n')
}
