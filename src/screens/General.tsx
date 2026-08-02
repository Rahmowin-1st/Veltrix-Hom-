import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUp, Plus, Sparkles } from 'lucide-react'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { AttachSheet, type Attachment } from '@/components/chat/AttachSheet'
import { MODES } from '@/lib/modes'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useSkillStore } from '@/store/skillStore'
import { tap } from '@/lib/native'

/**
 * General — the landing surface and the main place to ask.
 *
 * It is deliberately a launcher, not a chat: one hero composer that opens
 * a real conversation, plus the eight modes. Once a message is sent the
 * user moves into the chat screen, which owns the conversation.
 */
export default function General() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const setDraftForNew = useUIStore((s) => s.setHandoffText)
  const setAttachment = useUIStore((s) => s.setHandoffAttachment)
  const activeSkill = useSkillStore((s) => s.byId(s.activeId))

  const [text, setText] = useState('')
  const [attach, setAttach] = useState<Attachment | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`
  }, [text])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 5) return 'Xayrli tun'
    if (h < 12) return 'Xayrli tong'
    if (h < 18) return 'Xayrli kun'
    return 'Xayrli kech'
  }, [])

  const first = (profile?.preferred_name ?? profile?.full_name ?? '').split(' ')[0]
  const canSend = text.trim().length > 0 || attach !== null

  const send = () => {
    if (!canSend || sending) return
    void tap('medium')
    setSending(true)

    // Hand the draft to the chat screen, which creates the conversation.
    setDraftForNew(text.trim())
    setAttachment(attach)

    // Let the border sweep play before the route changes.
    window.setTimeout(() => navigate('/chat'), 260)
  }

  return (
    <div
      data-scroll-root
      className="hide-sb"
      style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{
        flex: 1,
        width: '100%',
        maxWidth: 'var(--content-max)',
        margin: '0 auto',
        padding: 'var(--s-4)',
        paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--s-8))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-5)',
      }}>
        {/* ------------------------ hero ------------------------ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'grid', justifyItems: 'center', gap: 'var(--s-3)',
            paddingTop: 'clamp(20px, 6vh, 56px)', textAlign: 'center',
          }}
        >
          <motion.div
            initial={{ scale: .82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: .06, duration: .5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <VeltrixMark size={52} />
          </motion.div>

          <h1 style={{ fontSize: 'var(--fs-hero)', letterSpacing: '-0.03em' }}>
            {greeting}{first ? `, ${first}` : ''}
          </h1>
          <p className="muted" style={{ fontSize: 'var(--fs-lead)' }}>
            Bugun qaysi vazifani bajaramiz?
          </p>
        </motion.div>

        {/* ---------------------- composer ---------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: .1, duration: .42, ease: [0.16, 1, 0.3, 1] }}
        >
          {activeSkill && (
            <div className="row" style={{ gap: 6, paddingBottom: 8 }}>
              <span className="chip chip-strong">
                <span data-emoji>{activeSkill.emoji}</span> {activeSkill.name}
              </span>
            </div>
          )}

          <div
            className={[
              'floating', 'composer',
              focused ? 'composer-focused' : '',
              sending ? 'composer-sending' : '',
            ].filter(Boolean).join(' ')}
            style={{ padding: 10 }}
          >
            {attach && (
              <div className="row" style={{ gap: 10, padding: '2px 4px 10px' }}>
                {attach.kind === 'image' ? (
                  <img
                    src={`data:${attach.mimeType};base64,${attach.data}`}
                    alt="" width={44} height={44}
                    style={{ borderRadius: 'var(--r-xs)', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{
                    width: 44, height: 44, display: 'grid', placeItems: 'center',
                    borderRadius: 'var(--r-xs)', background: 'var(--brand-soft)',
                    color: 'var(--brand)', fontSize: 11, fontWeight: 700,
                  }}>{attach.ext}</span>
                )}
                <span className="col" style={{ minWidth: 0, gap: 1, flex: 1 }}>
                  <span className="truncate" style={{ fontSize: 'var(--fs-label)' }}>{attach.name}</span>
                  <span className="micro">{(attach.size / 1024).toFixed(0)} KB</span>
                </span>
                <button className="btn btn-ghost btn-icon" style={{ width: 34, height: 34 }}
                  onClick={() => setAttach(null)} aria-label="Olib tashlash">×</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <button
                className="btn btn-ghost btn-icon"
                style={{ width: 42, height: 42 }}
                onClick={() => setSheetOpen(true)}
                aria-label="Biriktirish"
              >
                <Plus size={22} />
              </button>

              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
                    e.preventDefault(); send()
                  }
                }}
                rows={1}
                aria-label="Savol yozish"
                placeholder="Savol yoki vazifani yuboring…"
                style={{
                  flex: 1, resize: 'none', maxHeight: 150, minHeight: 42,
                  padding: '11px 4px', background: 'transparent', border: 'none',
                  outline: 'none', color: 'var(--text)',
                  fontSize: 'var(--fs-lead)', fontFamily: 'var(--font)', lineHeight: 1.5,
                }}
              />

              <motion.button
                onClick={send}
                disabled={!canSend}
                aria-label="Yuborish"
                whileTap={{ scale: 0.88 }}
                animate={canSend ? { scale: 1, opacity: 1 } : { scale: .9, opacity: .45 }}
                transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                style={{
                  width: 42, height: 42, flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  borderRadius: 'var(--r-sm)', border: 'none',
                  background: canSend ? 'var(--brand-gradient)' : 'var(--bg-hover)',
                  color: canSend ? '#fff' : 'var(--text-3)',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                  boxShadow: canSend ? '0 4px 14px rgba(10,108,255,.34)' : 'none',
                }}
              >
                <ArrowUp size={20} strokeWidth={2.6} />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ------------------------ modes ------------------------ */}
        <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
          <div className="row" style={{ gap: 7, paddingInline: 2 }}>
            <Sparkles size={15} style={{ color: 'var(--brand)' }} />
            <span style={{ fontSize: 'var(--fs-label)', fontWeight: 640, color: 'var(--text-2)' }}>
              Rejimlar
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))',
            gap: 'var(--s-3)',
          }}>
            {MODES.map(({ id, title, subtitle, Icon, color }, i) => (
              <motion.button
                key={id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 + i * 0.035, duration: .38, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.965 }}
                onClick={() => { void tap(); navigate(`/rejim/${id}`) }}
                className="surface pressable"
                style={{
                  padding: 'var(--s-4)', display: 'grid', gap: 9,
                  textAlign: 'left', border: '1px solid var(--border)',
                  color: 'var(--text)', fontFamily: 'var(--font)',
                  minHeight: 116,
                }}
              >
                <span style={{
                  width: 38, height: 38, display: 'grid', placeItems: 'center',
                  borderRadius: 'var(--r-sm)',
                  background: `color-mix(in srgb, ${color} 15%, transparent)`,
                  color,
                }}>
                  <Icon size={19} strokeWidth={2.1} />
                </span>
                <span className="col" style={{ gap: 3 }}>
                  <span className="wrap-label" style={{ fontSize: 'var(--fs-sm)', fontWeight: 640 }}>
                    {title}
                  </span>
                  <span className="micro wrap-label clamp-2">{subtitle}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <AttachSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(a) => { setAttach(a); setSheetOpen(false) }}
        allow={['image', 'camera', 'file', 'audio']}
      />
    </div>
  )
}
