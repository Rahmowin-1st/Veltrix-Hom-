import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Send, Square, Camera, Image as ImageIcon, BookOpen, Languages, X, Search,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { capturePhoto, isNative, tap } from '@/lib/native'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useOnline } from '@/hooks/useOnline'
import type { Skill, Source } from '@/types'

export interface Attachment { mimeType: string; data: string }

export interface ComposerContext {
  subject?: string | null
  sources: Source[]
  translation: { from: string; to: string } | null
  projectName?: string | null
  skill?: Skill | null
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
  onClearSkill?: () => void
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
  const navigate = useNavigate()
  const online = useOnline()
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

  const canSend = (p.value.trim().length > 0 || p.attachment !== null) && !p.busy && online

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
                <span
                  key={c.key}
                  className={c.pill ? 'source-pill source-pill-activating' : 'chip chip-strong'}
                  title={c.label}
                >
                  {c.icon}
                  <span className="truncate" style={{ maxWidth: 190 }}>{c.label}</span>
                  {c.onRemove && (
                    <button
                      onClick={c.onRemove}
                      aria-label={`${c.label} — olib tashlash`}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'inherit', padding: 4, margin: -2, display: 'grid',
                      }}
                    >
                      <X size={13} />
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
              title={!online ? 'Internet aloqasi yo\u02bcq' : p.busy ? "To'xtatish" : 'Yuborish'}
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

        </div>
      </div>

      <AnimatePresence>
        {plusOpen && (
          <BottomSheet key="attach" title="Biriktirish" onClose={() => setPlusOpen(false)} desktopWidth={380}>
            <div style={{ display: 'grid', gap: 2 }}>
              {isNative && (
                <SheetItem icon={<Camera size={18} />} label="Kamera"
                  hint="Vazifani rasmga oling" onClick={() => void pick('camera')} />
              )}
              <SheetItem icon={<ImageIcon size={18} />} label="Rasm tanlash"
                hint="Galereyadan rasm" onClick={() => void pick('gallery')} />
              <SheetItem icon={<BookOpen size={18} />} label="Manbalardan tanlash"
                hint="Yuklangan kitobdan javob"
                onClick={() => { setPlusOpen(false); setPickerOpen(true) }} />
              <SheetItem icon={<Plus size={18} />} label="Yangi manba qo'shish"
                hint="PDF darslik yuklash"
                onClick={() => { setPlusOpen(false); navigate('/manbalar') }} />
              <SheetItem icon={<Languages size={18} />} label="Tarjima rejimi"
                hint="Javobni tarjima qiladi"
                onClick={() => { setPlusOpen(false); p.onToggleTranslation() }} />
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

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

interface Chip {
  key: string
  label: string
  icon?: React.ReactNode
  pill?: boolean
  onRemove?: () => void
}

function buildChips(p: Props): Chip[] {
  const chips: Chip[] = []

  if (p.context.projectName) {
    chips.push({ key: 'proj', label: p.context.projectName, icon: <span aria-hidden>📁</span> })
  }

  if (p.context.skill) {
    chips.push({
      key: 'skill',
      label: p.context.skill.name,
      icon: <span aria-hidden>{p.context.skill.emoji}</span>,
      onRemove: p.onClearSkill,
    })
  }

  if (p.context.subject) chips.push({ key: 'subj', label: p.context.subject })

  // Attached sources render as pills with the one-time activation sweep.
  for (const s of p.context.sources) {
    chips.push({
      key: s.id,
      label: s.title,
      icon: <BookOpen size={14} />,
      pill: true,
      onRemove: () => p.onRemoveSource(s.id),
    })
  }

  if (p.context.sources.length === 0) {
    chips.push({ key: 'auto', label: 'Avtomatik manba', icon: <BookOpen size={13} /> })
  }

  if (p.context.translation) {
    chips.push({
      key: 'tr',
      label: `${p.context.translation.from} → ${p.context.translation.to}`,
      icon: <Languages size={13} />,
      onRemove: p.onClearTranslation,
    })
  }
  return chips
}

function SheetItem({ icon, label, hint, onClick }: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '12px 10px', minHeight: 56, borderRadius: 'var(--r-md)',
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', color: 'var(--text)', fontFamily: 'var(--font)',
      }}
    >
      <span style={{
        width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center',
        borderRadius: 'var(--r-sm)', background: 'var(--brand-soft)', color: 'var(--brand)',
      }}>{icon}</span>
      <span className="col" style={{ gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 550 }}>{label}</span>
        <span className="micro truncate">{hint}</span>
      </span>
    </button>
  )
}

/** Reuses the shared sheet so every modal in the app behaves identically. */
function SourcePicker({ sources, selected, onPick, onClose }: {
  sources: Source[]
  selected: string[]
  onPick: (s: Source) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const ready = sources.filter((s) => s.status === 'ready')
  const term = q.trim().toLowerCase()
  const list = term ? ready.filter((s) => s.title.toLowerCase().includes(term)) : ready

  return (
    <BottomSheet title="Manba tanlash" onClose={onClose} desktopWidth={430}>
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        <div className="row surface-quiet" style={{ padding: '0 10px', height: 42 }}>
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

        {list.length === 0 && (
          <p className="micro" style={{ padding: '18px 4px', textAlign: 'center', lineHeight: 1.6 }}>
            {ready.length === 0
              ? "Tayyor manba yo'q. Manbalar bo'limidan kitob yuklang."
              : 'Hech narsa topilmadi.'}
          </p>
        )}

        {list.map((s) => {
          const on = selected.includes(s.id)
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              aria-pressed={on}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 12px', minHeight: 52, borderRadius: 'var(--r-md)',
                background: on ? 'var(--bg-active)' : 'transparent',
                border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font)',
                textAlign: 'left',
              }}
            >
              <span aria-hidden style={{ fontSize: 18 }}>{s.emoji}</span>
              <span className="col" style={{ minWidth: 0, gap: 1, flex: 1 }}>
                <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 530 }}>
                  {s.title}
                </span>
                <span className="micro truncate">
                  {[s.grade ? `${s.grade}-sinf` : null, s.page_count ? `${s.page_count} bet` : null]
                    .filter(Boolean).join(' · ') || 'Tayyor'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
