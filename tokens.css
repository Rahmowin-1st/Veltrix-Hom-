import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Send, Square, Camera, Image as ImageIcon, BookOpen, Languages, X, Search,
} from 'lucide-react'
import { capturePhoto, isNative, tap } from '@/lib/native'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { Source } from '@/types'

export interface Attachment { mimeType: string; data: string }

export interface ComposerContext {
  subject?: string | null
  sources: Source[]
  translation: { from: string; to: string } | null
  projectName?: string | null
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  attachment: Attachment | null
  setAttachment: (a: Attachment | null) => void
  allSources: Source[]
  context: ComposerContext
  onRemoveSource: (id: string) => void
  onAddSource: (s: Source) => void
  onClearTranslation: () => void
  onToggleTranslation: () => void
}

const SLASH_COMMANDS = [
  { cmd: '/fan ', label: 'Fan tanlash', hint: '/fan fizika' },
  { cmd: '/kitob ', label: 'Kitobni ko\'rsatish', hint: '/kitob Algebra 8' },
  { cmd: '/bet ', label: 'Bet raqami', hint: '/bet 54' },
  { cmd: '/qisqa', label: 'Qisqa javob', hint: 'faqat natija' },
  { cmd: '/toliq', label: 'To\'liq javob', hint: 'batafsil yechim' },
  { cmd: '/daftar', label: 'Daftar formati', hint: 'ko\'chirishga tayyor' },
  { cmd: '/test ', label: 'Test yaratish', hint: '/test 5' },
  { cmd: '/tarjima ', label: 'Tarjima', hint: '/tarjima en uz' },
] as const

export function ChatComposer(p: Props) {
  const isMobile = useIsMobile()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [plusOpen, setPlusOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [slashQuery, setSlashQuery] = useState<string | null>(null)

  // Auto-grow, capped so the composer can never eat the conversation.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [p.value])

  // Slash menu opens only when "/" starts the message.
  useEffect(() => {
    const m = p.value.match(/^\/(\w*)$/)
    setSlashQuery(m ? (m[1] ?? '') : null)
  }, [p.value])

  const slashMatches = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.toLowerCase()
    return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(q))
  }, [slashQuery])

  const canSend = (p.value.trim().length > 0 || p.attachment !== null) && !p.busy

  const pick = async (source: 'camera' | 'gallery') => {
    setPlusOpen(false)
    try { p.setAttachment(await capturePhoto(source)) } catch { /* user cancelled */ }
  }

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 8 * 1024 * 1024) return
    const r = new FileReader()
    r.onload = () => {
      const res = r.result
      if (typeof res !== 'string') return
      p.setAttachment({ mimeType: file.type, data: res.split(',')[1] ?? '' })
    }
    r.readAsDataURL(file)
  }

  const chips = buildChips(p)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) readFile(f)
      }}
      style={{
        position: 'sticky',
        bottom: 0,
        paddingBottom: isMobile
          ? 'calc(var(--nav-h) + 18px + var(--safe-bottom) + var(--keyboard-h, 0px))'
          : 'var(--s-4)',
        paddingTop: 'var(--s-2)',
        // A soft fade so messages scroll under the composer without a hard cut.
        background: 'linear-gradient(to top, var(--bg) 62%, transparent)',
        zIndex: 'var(--z-composer)' as unknown as number,
      }}
    >
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', width: '100%' }}>
        {/* --- context chips --- */}
        <AnimatePresence>
          {chips.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="row hide-sb"
              style={{ gap: 6, overflowX: 'auto', paddingBottom: 8 }}
            >
              {chips.map((c) => (
                <span key={c.key} className="chip chip-strong">
                  {c.label}
                  {c.onRemove && (
                    <button
                      onClick={c.onRemove}
                      aria-label={`${c.label} — olib tashlash`}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'inherit', padding: 0, marginLeft: 2, display: 'grid',
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- slash command menu --- */}
        <AnimatePresence>
          {slashMatches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16 }}
              className="glass"
              role="listbox"
              style={{ marginBottom: 8, padding: 5, maxHeight: 232, overflowY: 'auto' }}
            >
              {slashMatches.map((c) => (
                <button
                  key={c.cmd}
                  role="option"
                  aria-selected={false}
                  onClick={() => { p.onChange(c.cmd); taRef.current?.focus() }}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, width: '100%',
                    padding: '8px 10px', minHeight: 40, borderRadius: 'var(--r-xs)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text)', fontFamily: 'var(--font)', textAlign: 'left',
                  }}
                >
                  <code style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)',
                    color: 'var(--accent)',
                  }}>{c.cmd.trim()}</code>
                  <span style={{ fontSize: 'var(--fs-label)' }}>{c.label}</span>
                  <span className="micro" style={{ marginLeft: 'auto' }}>{c.hint}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- the composer itself --- */}
        <div
          className="glass"
          style={{
            padding: 8,
            display: 'grid',
            gap: 8,
            borderColor: dragging ? 'var(--accent)' : undefined,
            transition: 'border-color 140ms var(--ease)',
          }}
        >
          {p.attachment && (
            <div className="row" style={{ gap: 8, paddingInline: 4 }}>
              <img
                src={`data:${p.attachment.mimeType};base64,${p.attachment.data}`}
                alt="" width={38} height={38}
                style={{ borderRadius: 'var(--r-xs)', objectFit: 'cover' }}
              />
              <span className="micro">Rasm biriktirildi</span>
              <button
                className="btn btn-ghost"
                style={{ height: 28, marginLeft: 'auto', padding: '0 8px' }}
                onClick={() => p.setAttachment(null)}
              >
                <X size={14} /> Olib tashlash
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setPlusOpen((o) => !o)}
              aria-label="Biriktirish"
              aria-expanded={plusOpen}
              title="Biriktirish"
            >
              <Plus size={20} style={{ transform: plusOpen ? 'rotate(45deg)' : 'none', transition: 'transform 160ms var(--ease)' }} />
            </button>

            <textarea
              ref={taRef}
              value={p.value}
              onChange={(e) => p.onChange(e.target.value)}
              onPaste={(e) => {
                const f = e.clipboardData.files[0]
                if (f) readFile(f)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                  e.preventDefault()
                  if (canSend) p.onSend()
                }
              }}
              rows={1}
              aria-label="Savol yozish"
              placeholder="Savol yoki vazifani yuboring…"
              style={{
                flex: 1, resize: 'none', maxHeight: 160, minHeight: 40,
                padding: '10px 4px', background: 'transparent', border: 'none',
                outline: 'none', color: 'var(--text)',
                fontSize: 'var(--fs-body)', fontFamily: 'var(--font)', lineHeight: 1.5,
              }}
            />

            <button
              className="btn btn-icon"
              onClick={() => { void tap(); p.busy ? p.onStop() : p.onSend() }}
              disabled={!p.busy && !canSend}
              aria-label={p.busy ? "To'xtatish" : 'Yuborish'}
              title={p.busy ? "To'xtatish" : 'Yuborish'}
              style={{
                background: p.busy ? 'var(--bg-hover)' : 'var(--brand-600)',
                color: p.busy ? 'var(--text)' : '#fff',
                borderRadius: 'var(--r-md)',
                opacity: !p.busy && !canSend ? 0.4 : 1,
              }}
            >
              {p.busy ? <Square size={16} /> : <Send size={17} />}
            </button>
          </div>

          <AnimatePresence>
            {plusOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="row hide-sb"
                style={{ gap: 6, overflowX: 'auto', paddingTop: 2 }}
              >
                {isNative && (
                  <SmallBtn icon={<Camera size={15} />} label="Rasmga olish" onClick={() => void pick('camera')} />
                )}
                <SmallBtn icon={<ImageIcon size={15} />} label="Rasm yuklash" onClick={() => void pick('gallery')} />
                <SmallBtn icon={<BookOpen size={15} />} label="Manbadan tanlash"
                  onClick={() => { setPlusOpen(false); setPickerOpen(true) }} />
                <SmallBtn icon={<Languages size={15} />} label="Tarjima"
                  onClick={() => { setPlusOpen(false); p.onToggleTranslation() }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {pickerOpen && (
        <SourcePicker
          sources={p.allSources}
          selected={p.context.sources.map((s) => s.id)}
          onPick={(s) => { p.onAddSource(s); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/* --------------------------- helpers -------------------------------- */

interface Chip { key: string; label: string; onRemove?: () => void }

function buildChips(p: Props): Chip[] {
  const chips: Chip[] = []
  if (p.context.projectName) chips.push({ key: 'proj', label: `Loyiha: ${p.context.projectName}` })
  if (p.context.subject) chips.push({ key: 'subj', label: p.context.subject })

  for (const s of p.context.sources) {
    chips.push({ key: s.id, label: s.title, onRemove: () => p.onRemoveSource(s.id) })
  }
  if (p.context.sources.length === 0) {
    chips.push({ key: 'auto', label: 'Avtomatik manba' })
  }
  if (p.context.translation) {
    chips.push({
      key: 'tr',
      label: `Tarjima: ${p.context.translation.from} → ${p.context.translation.to}`,
      onRemove: p.onClearTranslation,
    })
  }
  return chips
}

function SmallBtn({ icon, label, onClick }: {
  icon: React.ReactNode; label: string; onClick: () => void
}) {
  return (
    <button className="btn btn-outline" style={{ height: 34, fontSize: 'var(--fs-label)' }} onClick={onClick}>
      {icon}{label}
    </button>
  )
}

/** Bottom sheet on mobile, centred panel on desktop. Real sources only. */
function SourcePicker({ sources, selected, onPick, onClose }: {
  sources: Source[]
  selected: string[]
  onPick: (s: Source) => void
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ready = sources.filter((s) => s.status === 'ready')
  const list = q
    ? ready.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()))
    : ready

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(1,12,38,0.5)', zIndex: 59 }}
      />
      <motion.div
        role="dialog" aria-modal="true" aria-label="Manba tanlash"
        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.97 }}
        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="glass"
        style={{
          position: 'fixed',
          zIndex: 60,
          ...(isMobile
            ? { left: 0, right: 0, bottom: 0, maxHeight: '72dvh', borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }
            : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, maxHeight: '70dvh' }),
          padding: 'var(--s-4)',
          display: 'grid',
          gap: 'var(--s-3)',
          gridTemplateRows: 'auto auto 1fr',
          overflow: 'hidden',
        }}
      >
        <div className="row">
          <strong style={{ fontSize: 'var(--fs-section)' }}>Manba tanlash</strong>
          <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }}
            onClick={onClose} aria-label="Yopish"><X size={18} /></button>
        </div>

        <div className="row surface-quiet" style={{ padding: '0 10px', height: 40 }}>
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Kitob nomi…" aria-label="Manbani qidirish"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', display: 'grid', gap: 4 }}>
          {list.length === 0 && (
            <p className="micro" style={{ padding: '18px 4px', textAlign: 'center', lineHeight: 1.6 }}>
              {ready.length === 0
                ? "Hali tayyor manba yo'q. Sozlamalar → Manbalar bo'limidan kitob yuklang."
                : 'Hech narsa topilmadi.'}
            </p>
          )}
          {list.map((s) => {
            const on = selected.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 12px', minHeight: 48, borderRadius: 'var(--r-md)',
                  background: on ? 'var(--bg-active)' : 'transparent',
                  border: '1px solid', borderColor: on ? 'var(--border-accent, var(--accent))' : 'transparent',
                  cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font)', textAlign: 'left',
                }}
              >
                <BookOpen size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span className="col" style={{ minWidth: 0, gap: 1 }}>
                  <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>{s.title}</span>
                  <span className="micro truncate">
                    {[s.grade ? `${s.grade}-sinf` : null, s.page_count ? `${s.page_count} bet` : null]
                      .filter(Boolean).join(' · ') || 'Tayyor'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </motion.div>
    </>
  )
}
