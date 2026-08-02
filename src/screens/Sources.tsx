import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Trash2, Check, AlertCircle, MoreVertical, MessageSquare,
  Pencil, RefreshCw, Loader2,
} from 'lucide-react'
import { AddSourceFlow } from '@/components/source/AddSourceFlow'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { sourceApi } from '@/lib/api'
import { useUIStore } from '@/store/uiStore'
import type { Source, Subject } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Navbatda', extracting: 'Matn ajratilmoqda', ocr: 'OCR',
  embedding: 'Indekslanmoqda', ready: 'Tayyor', failed: 'Xato',
}

/** Very low opacity subject motifs — decoration that never costs readability. */
const PATTERNS: Record<string, string> = {
  matematika: '+ − × ÷ π ∑ √ ∞ ≠ ≤',
  fizika: '⚡ ∿ ⚛ N S F=ma',
  kimyo: 'H₂O CO₂ Na Cl ⚗',
  biologiya: '🌿 ⬡ ADN ◍',
  informatika: '{ } < / > [ ] ( )',
  geografiya: '◍ ▲ ~ ° N S',
  tarix: '⌛ ⚔ ◫ ✦',
}

type Filter = 'all' | 'ready' | 'processing' | 'failed'

export default function Sources() {
  const navigate = useNavigate()
  const setActiveSource = useUIStore((s) => s.setActiveSource)

  const [sources, setSources] = useState<Source[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [menuFor, setMenuFor] = useState<Source | null>(null)
  const [editing, setEditing] = useState<Source | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Source | null>(null)

  const refresh = () =>
    sourceApi.list().then((r) => setSources(r.sources)).catch(() => {})

  useEffect(() => {
    Promise.all([sourceApi.list(), sourceApi.subjects()])
      .then(([a, b]) => { setSources(a.sources); setSubjects(b.subjects) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // While anything is still processing, poll so the card reflects reality.
  const hasProcessing = sources.some((s) => s.status !== 'ready' && s.status !== 'failed')
  useEffect(() => {
    if (!hasProcessing) return
    const t = window.setInterval(refresh, 3000)
    return () => window.clearInterval(t)
  }, [hasProcessing])

  const list = useMemo(() => {
    let l = sources
    if (filter === 'ready') l = l.filter((s) => s.status === 'ready')
    if (filter === 'processing') l = l.filter((s) => s.status !== 'ready' && s.status !== 'failed')
    if (filter === 'failed') l = l.filter((s) => s.status === 'failed')

    const term = q.trim().toLowerCase()
    if (term) l = l.filter((s) => s.title.toLowerCase().includes(term))
    return l
  }, [sources, filter, q])

  const remove = async (id: string) => {
    const prev = sources
    setSources((s) => s.filter((x) => x.id !== id))
    setConfirmDelete(null)
    try { await sourceApi.remove(id) } catch { setSources(prev) }
  }

  const useInChat = (s: Source) => {
    setActiveSource(s.id)
    navigate('/chat')
  }

  return (
    <div data-scroll-root className="hide-sb"
      style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4)' }}>
      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto',
        display: 'grid', gap: 'var(--s-4)',
        paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--s-8))',
      }}>
        <header className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <h1 style={{ fontSize: 'var(--fs-title)' }}>Manbalar</h1>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {sources.length ? `Jami ${sources.length} ta manba` : 'Darslik va qo\u02bcllanmalar'}
            </p>
          </div>
          <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => setAdding(true)}>
            <Plus size={17} /> Qo'shish
          </button>
        </header>

        <div className="row surface-quiet" style={{ padding: '0 12px', height: 44 }}>
          <Search size={17} style={{ color: 'var(--text-3)' }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Kitob nomi…" aria-label="Manbani qidirish"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
            }}
          />
        </div>

        <div className="row hide-sb" style={{ gap: 6, overflowX: 'auto' }}>
          {([['all', 'Barchasi'], ['ready', 'Tayyor'],
             ['processing', 'Jarayonda'], ['failed', 'Xato']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
              className={filter === v ? 'chip chip-strong chip-btn' : 'chip chip-btn'}
              style={{ height: 34 }}>{l}</button>
          ))}
        </div>

        {loading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 108 }} />)}

        {!loading && list.length === 0 && (
          <EmptyState
            emoji="📚"
            title={q || filter !== 'all' ? 'Hech narsa topilmadi' : "Manba yo'q"}
            body={q || filter !== 'all'
              ? 'Filtrni o\u02bczgartiring yoki boshqa so\u02bcz bilan qidiring.'
              : 'Darslik PDF yuklang — AI javoblarni aynan shu kitobdan beradi.'}
            action={!q && filter === 'all' ? (
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Birinchi manbani qo'shish
              </button>
            ) : undefined}
          />
        )}

        {list.map((s) => {
          const subject = subjects.find((x) => x.id === s.subject_id)
          const motif = subject ? PATTERNS[subject.slug ?? ''] : undefined
          const ready = s.status === 'ready'

          return (
            <article key={s.id} className="surface"
              style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)', position: 'relative', overflow: 'hidden' }}>
              {motif && (
                <span aria-hidden style={{
                  position: 'absolute', inset: 0, padding: 14, fontSize: 13,
                  color: s.color, opacity: 0.05, letterSpacing: 6, lineHeight: 2.2,
                  wordBreak: 'break-all', pointerEvents: 'none', userSelect: 'none',
                }}>{motif.repeat(14)}</span>
              )}

              <div className="row" style={{ gap: 11, alignItems: 'flex-start', position: 'relative' }}>
                <span aria-hidden style={{
                  width: 46, height: 46, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: 'var(--r-md)', fontSize: 22,
                  background: `color-mix(in srgb, ${s.color} 15%, transparent)`,
                }}>{s.emoji}</span>

                <div className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                  <strong className="truncate" style={{ fontSize: 'var(--fs-sm)' }}>{s.title}</strong>
                  <span className="micro truncate">
                    {[subject?.name, s.grade ? `${s.grade}-sinf` : null,
                      s.page_count ? `${s.page_count} bet` : null,
                      s.file_size ? `${(s.file_size / 1024 / 1024).toFixed(1)} MB` : null]
                      .filter(Boolean).join(' · ') || 'PDF'}
                  </span>
                </div>

                <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }}
                  onClick={() => setMenuFor(s)} aria-label={`${s.title} amallari`}>
                  <MoreVertical size={17} />
                </button>
              </div>

              {!ready && s.status !== 'failed' && (
                <div style={{ display: 'grid', gap: 5, position: 'relative' }}>
                  <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${s.progress}%`, borderRadius: 99,
                      background: 'var(--brand-gradient)', transition: 'width 500ms var(--ease)',
                    }} />
                  </div>
                  <span className="micro">
                    <Loader2 size={11} className="spin" style={{ verticalAlign: -1, marginRight: 4 }} />
                    {STATUS_LABEL[s.status] ?? s.status} · {s.progress}%
                  </span>
                </div>
              )}

              {s.status === 'failed' && (
                <p role="alert" className="micro" style={{ color: 'var(--danger)', position: 'relative' }}>
                  <AlertCircle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {s.error_message ?? 'Qayta ishlashda xato.'}
                </p>
              )}

              {ready && (
                <div className="row" style={{ gap: 6, position: 'relative' }}>
                  <button className="btn btn-primary" style={{ height: 34, flex: 1 }}
                    onClick={() => useInChat(s)}>
                    <MessageSquare size={14} /> Chatda ishlatish
                  </button>
                  <span className="chip" style={{
                    color: 'var(--success)',
                    borderColor: 'color-mix(in srgb, var(--success) 32%, transparent)',
                  }}>
                    <Check size={12} /> Tayyor
                  </span>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <AnimatePresence>
        {adding && (
          <AddSourceFlow
            key="add" subjects={subjects}
            onClose={() => setAdding(false)}
            onCreated={(s) => setSources((prev) => [s, ...prev.filter((x) => x.id !== s.id)])}
          />
        )}

        {menuFor && (
          <BottomSheet key="menu" title={menuFor.title} onClose={() => setMenuFor(null)} desktopWidth={360}>
            <div style={{ display: 'grid', gap: 2 }}>
              {menuFor.status === 'ready' && (
                <SheetAction icon={<MessageSquare size={17} />} label="Chatda ishlatish"
                  onClick={() => { useInChat(menuFor); setMenuFor(null) }} />
              )}
              <SheetAction icon={<Pencil size={17} />} label="Tahrirlash"
                onClick={() => { setEditing(menuFor); setMenuFor(null) }} />
              <SheetAction icon={<RefreshCw size={17} />} label="Yangilash"
                onClick={() => { void refresh(); setMenuFor(null) }} />
              <SheetAction icon={<Trash2 size={17} />} label="O'chirish" danger
                onClick={() => { setConfirmDelete(menuFor); setMenuFor(null) }} />
            </div>
          </BottomSheet>
        )}

        {editing && (
          <SourceEditor
            key="edit" source={editing} subjects={subjects}
            onClose={() => setEditing(null)}
            onSaved={(s) => setSources((prev) => prev.map((x) => (x.id === s.id ? s : x)))}
          />
        )}

        {confirmDelete && (
          <BottomSheet key="confirm" title="O'chirilsinmi?" onClose={() => setConfirmDelete(null)} desktopWidth={380}>
            <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
              <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
                <strong>{confirmDelete.title}</strong> va undan olingan barcha matn o'chiriladi.
                Buni qaytarib bo'lmaydi.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setConfirmDelete(null)}>Bekor</button>
                <button className="btn btn-danger" style={{ flex: 1 }}
                  onClick={() => void remove(confirmDelete.id)}>O'chirish</button>
              </div>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------- editor ------------------------------- */

function SourceEditor({ source, subjects, onClose, onSaved }: {
  source: Source; subjects: Subject[]; onClose: () => void; onSaved: (s: Source) => void
}) {
  const [title, setTitle] = useState(source.title)
  const [grade, setGrade] = useState<number | ''>(source.grade ?? '')
  const [subjectId, setSubjectId] = useState(source.subject_id ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const { source: updated } = await sourceApi.update(source.id, {
        title: title.trim(),
        grade: grade === '' ? null : grade,
        subject_id: subjectId || null,
      })
      onSaved(updated)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <BottomSheet title="Manbani tahrirlash" onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>Nomi</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>Sinf</span>
          <select className="input" value={grade}
            onChange={(e) => setGrade(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Tanlanmagan</option>
            {Array.from({ length: 11 }, (_, i) => i + 1).map((g) =>
              <option key={g} value={g}>{g}-sinf</option>)}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>Fan</span>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Tanlanmagan</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            disabled={!title.trim() || saving} onClick={() => void save()}>
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

function SheetAction({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        padding: '12px 10px', minHeight: 50, borderRadius: 'var(--r-md)',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        color: danger ? 'var(--danger)' : 'var(--text)',
        fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
      }}>
      {icon}{label}
    </button>
  )
}
