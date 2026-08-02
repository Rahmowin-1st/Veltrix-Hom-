import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Image as ImageIcon, Plus, Send } from 'lucide-react'
import { AnswerBlocks } from '@/components/chat/AnswerBlocks'
import { EmptyState } from '@/components/ui/EmptyState'
import { api, type ChatResponse } from '@/lib/api'
import { capturePhoto, isNative, tap } from '@/lib/native'
import type { AnswerBlock } from '@/types'

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text?: string
  blocks?: AnswerBlock[]
  meta?: ChatResponse
}

const LOADING_STEPS = [
  '🧠 Fan aniqlanmoqda…',
  '📚 Source ochilmoqda…',
  "📄 Matn o'qilmoqda…",
  '✍️ Javob tayyorlanmoqda…',
]

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ mimeType: string; data: string } | null>(null)
  const [sheet, setSheet] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])

  // Advance the caption so the wait reads as progress rather than a hang.
  useEffect(() => {
    if (!busy) { setStep(0); return }
    const t = window.setInterval(
      () => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)),
      1400
    )
    return () => window.clearInterval(t)
  }, [busy])

  const send = async () => {
    const text = input.trim()
    if ((!text && !photo) || busy) return

    void tap()
    setError(null)
    setBusy(true)
    setInput('')

    // Optimistic: the user's message appears immediately.
    setTurns((t) => [...t, { id: crypto.randomUUID(), role: 'user', text: text || '📷 Rasm' }])

    const sentPhoto = photo
    setPhoto(null)

    try {
      const res = await api.sendMessage({
        chatId,
        text: text || 'Ushbu rasmdagi vazifani bajar.',
        image: sentPhoto,
      })
      setChatId(res.chatId)
      setTurns((t) => [
        ...t,
        {
          id: res.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          blocks: res.blocks,
          meta: res,
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xatolik yuz berdi.')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (source: 'camera' | 'gallery') => {
    setSheet(false)
    try {
      setPhoto(await capturePhoto(source))
    } catch {
      setError('📷 Rasm olinmadi. Ruxsatni tekshiring.')
    }
  }

  const last = turns.length > 0 ? turns[turns.length - 1] : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {last && <ContextBar turn={last} />}

      <div style={{ flex: 1, display: 'grid', gap: 16, paddingBottom: 96 }}>
        {turns.length === 0 && !busy && (
          <EmptyState
            emoji="✦"
            title="Savolingizni yozing"
            body="Masala, mashq yoki mavzu — fanni o'zim aniqlayman va bet raqami bilan javob beraman."
          />
        )}

        {turns.map((t) =>
          t.role === 'user' ? (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              style={{ alignSelf: 'flex-end', maxWidth: '85%' }}
            >
              <div
                className="solid-raised"
                style={{
                  padding: '10px 14px',
                  borderRadius: 18,
                  borderBottomRightRadius: 6,
                  fontSize: 'var(--fs-body-sm)',
                  lineHeight: 1.5,
                }}
              >
                {t.text}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              {t.meta?.subject && (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 'var(--fs-citation)',
                    letterSpacing: '0.06em',
                    color: 'var(--text-2)',
                    textTransform: 'uppercase',
                  }}
                >
                  {t.meta.subject}
                  {t.meta.topic ? ` • ${t.meta.topic}` : ''}
                  {t.meta.pagesUsed?.length ? ` • ${t.meta.pagesUsed.join(', ')}-bet` : ''}
                </div>
              )}
              <AnswerBlocks blocks={t.blocks ?? []} />
              {t.meta && <AnswerFooter meta={t.meta} onFollowup={setInput} />}
            </motion.div>
          )
        )}

        {busy && (
          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>
              {LOADING_STEPS[step]}
            </span>
            <div className="skeleton" style={{ height: 76 }} />
            <div className="skeleton" style={{ height: 108, opacity: 0.6 }} />
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="solid"
            style={{
              padding: '11px 14px',
              fontSize: 'var(--fs-body-sm)',
              borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer floats above the keyboard, never under it. */}
      <div
        className="glass"
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom:
            'calc(var(--nav-h) + 16px + var(--safe-bottom) + var(--keyboard-h, 0px))',
          padding: 8,
          display: 'grid',
          gap: 8,
          zIndex: 35,
          borderRadius: 22,
        }}
      >
        {photo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInline: 4 }}>
            <img
              src={`data:${photo.mimeType};base64,${photo.data}`}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: 8, objectFit: 'cover' }}
            />
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>
              Rasm biriktirildi
            </span>
            <button onClick={() => setPhoto(null)} style={iconBtn} aria-label="Rasmni olib tashlash">
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <button onClick={() => setSheet((s) => !s)} style={iconBtn} aria-label="Qo'shish">
            <Plus size={20} />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder="Savol yoki vazifani yuboring…"
            style={{
              flex: 1,
              resize: 'none',
              maxHeight: 120,
              padding: '10px 4px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 'var(--fs-body)',
              fontFamily: 'var(--font)',
              lineHeight: 1.45,
            }}
          />

          <button
            onClick={() => void send()}
            disabled={busy || (!input.trim() && !photo)}
            className="grad-cta press"
            aria-label="Yuborish"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              opacity: busy || (!input.trim() && !photo) ? 0.4 : 1,
              cursor: 'pointer',
            }}
          >
            <Send size={17} />
          </button>
        </div>

        <AnimatePresence>
          {sheet && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', gap: 8, overflow: 'hidden', paddingTop: 4 }}
            >
              {isNative && (
                <SheetBtn onClick={() => void pick('camera')} icon={<Camera size={16} />} label="Rasmga olish" />
              )}
              <SheetBtn onClick={() => void pick('gallery')} icon={<ImageIcon size={16} />} label="Galereya" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** The 5 facts the spec says must never hide inside a menu. */
function ContextBar({ turn }: { turn: Turn }) {
  const m = turn.meta
  if (!m) return null

  const mode = {
    locked: '🔒 Faqat source',
    auto: '📚 Auto source',
    none: "🔓 Source'siz",
    not_found: '⚠️ Kitob topilmadi',
  }[m.sourceMode ?? 'none']

  return (
    <div
      className="hide-scrollbar"
      style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}
    >
      {m.subject && (
        <motion.span
          className="pill pill-active"
          initial={{ scale: 0.8 }}
          animate={{ scale: [0.8, 1.05, 1] }}
          transition={{ duration: 0.22 }}
        >
          🧠 {m.subject}
        </motion.span>
      )}
      <span className="pill">{mode}</span>
      {m.cached && <span className="pill">⚡ Keshdan</span>}
      {typeof m.quotaPercent === 'number' && m.quotaPercent >= 85 && (
        <span className="pill" style={{ color: 'var(--warning)' }}>
          ⚡ Limit {m.quotaPercent}%
        </span>
      )}
    </div>
  )
}

function AnswerFooter({
  meta,
  onFollowup,
}: {
  meta: ChatResponse
  onFollowup: (s: string) => void
}) {
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      {!!meta.citations?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {meta.citations.map((c, i) => (
            <span key={i} className="pill">
              📄 {c.page}-bet{c.ref ? ` · ${c.ref}` : ''}
            </span>
          ))}
        </div>
      )}
      {!!meta.followups?.length && (
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {meta.followups.map((f, i) => (
            <button
              key={i}
              className="pill press"
              onClick={() => onFollowup(f)}
              style={{ cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SheetBtn({
  onClick,
  icon,
  label,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className="press"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border)',
        background: 'var(--surface-raised)',
        color: 'var(--text)',
        fontSize: 'var(--fs-label)',
        fontFamily: 'var(--font)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

const iconBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  fontSize: 15,
}
