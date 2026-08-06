import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { Project, Subject } from '@/types'

const EMOJIS = ['📘', '➗', '🧪', '🌍', '📖', '🇬🇧', '💻', '📐', '⚗️', '🌱', '🎯', '📚']
const COLORS = ['#0176D4', '#00A2EF', '#01438D', '#12B981', '#E8A33D', '#8B5CF6']

/** Compact modal on desktop, bottom sheet on mobile. Only essentials asked. */
export function ProjectDialog({ existing, subjects, onClose }: {
  existing?: Project
  subjects: Subject[]
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const create = useProjectStore((s) => s.create)
  const update = useProjectStore((s) => s.update)

  const [name, setName] = useState(existing?.name ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '📘')
  const [color, setColor] = useState(existing?.color ?? COLORS[0]!)
  const [subjectId, setSubjectId] = useState(existing?.subject_id ?? '')
  const [grade, setGrade] = useState<number | ''>(existing?.grade ?? '')
  const [instructions, setInstructions] = useState(existing?.instructions ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const body = {
      name: name.trim(), emoji, color,
      subject_id: subjectId || null,
      grade: grade === '' ? null : Number(grade),
      instructions: instructions.trim() || null,
    }
    try {
      if (existing) await update(existing.id, body)
      else await create(body)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Loyihani saqlab bo‘lmadi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(1,12,38,0.55)', zIndex: 69 }} />
      <motion.div
        role="dialog" aria-modal="true" data-veltrix-modal="true" aria-label={existing ? 'Loyihani tahrirlash' : 'Yangi loyiha'}
        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.97 }}
        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="glass"
        style={{
          position: 'fixed', zIndex: 70,
          ...(isMobile
            ? { left: 0, right: 0, bottom: 0, maxHeight: '86dvh', borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }
            : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 460, maxHeight: '84dvh' }),
          padding: 'var(--s-5)', display: 'grid', gap: 'var(--s-4)', overflowY: 'auto',
        }}
      >
        <div className="row">
          <strong style={{ fontSize: 'var(--fs-section)' }}>
            {existing ? 'Loyihani tahrirlash' : 'Yangi loyiha'}
          </strong>
          <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }}
            onClick={onClose} aria-label="Yopish"><X size={18} /></button>
        </div>

        <Field label="Nomi">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="8-sinf Matematika" style={inputCss} />
        </Field>

        <Field label="Belgi">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e}
                style={{
                  width: 40, height: 40, borderRadius: 'var(--r-sm)', fontSize: 19, cursor: 'pointer',
                  background: emoji === e ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${emoji === e ? 'var(--accent)' : 'transparent'}`,
                }}>{e}</button>
            ))}
          </div>
        </Field>

        <Field label="Rang">
          <div className="row" style={{ gap: 8 }}>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Rang ${c}`}
                aria-pressed={color === c}
                style={{
                  width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                }} />
            ))}
          </div>
        </Field>

        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <Field label="Fan" style={{ flex: 1 }}>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={inputCss}>
              <option value="">Tanlanmagan</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Sinf" style={{ width: 110 }}>
            <select value={grade} onChange={(e) => setGrade(e.target.value === '' ? '' : Number(e.target.value))}
              style={inputCss}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((g) =>
                <option key={g} value={g}>{g}-sinf</option>)}
            </select>
          </Field>
        </div>

        <Field label="Maxsus ko'rsatma" hint="Bu loyihadagi chatlarga qo'shiladi">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
            rows={3} placeholder="Masalan: har doim bosqichma-bosqich yech"
            style={{ ...inputCss, height: 'auto', paddingTop: 10, resize: 'vertical' }} />
        </Field>

        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 'var(--r-md)',
            color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            fontSize: 'var(--fs-label)', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <div className="row" style={{ gap: 8, paddingTop: 4 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            disabled={!name.trim() || saving} onClick={() => void save()}>
            {saving ? 'Saqlanmoqda…' : existing ? 'Saqlash' : 'Yaratish'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

function Field({ label, hint, children, style }: {
  label: string; hint?: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <label style={{ display: 'grid', gap: 6, ...style }}>
      <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)', fontWeight: 520 }}>
        {label}{hint && <span className="micro" style={{ marginLeft: 6 }}>{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputCss: React.CSSProperties = {
  height: 42, padding: '0 12px', width: '100%',
  borderRadius: 'var(--r-md)', background: 'var(--bg-input)',
  border: '1px solid var(--border)', color: 'var(--text)',
  fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
}
