import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Search, Trash2, Check, AlertCircle } from 'lucide-react'
import { sourceApi } from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Source, Subject } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Navbatda', extracting: 'Matn ajratilmoqda', ocr: 'OCR',
  embedding: 'Indekslanmoqda', ready: 'Tayyor', failed: 'Xato',
}

export default function Sources() {
  const [sources, setSources] = useState<Source[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'ready' | 'processing'>('all')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([sourceApi.list(), sourceApi.subjects()])
      .then(([a, b]) => { setSources(a.sources); setSubjects(b.subjects) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const list = useMemo(() => {
    let l = sources
    if (filter === 'ready') l = l.filter((s) => s.status === 'ready')
    if (filter === 'processing') l = l.filter((s) => s.status !== 'ready' && s.status !== 'failed')
    if (q.trim()) l = l.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()))
    return l
  }, [sources, filter, q])

  const remove = async (id: string) => {
    const prev = sources
    setSources((s) => s.filter((x) => x.id !== id))
    setConfirmId(null)
    try { await sourceApi.remove(id) } catch { setSources(prev) }
  }

  const rename = async (s: Source) => {
    const next = window.prompt('Yangi nom:', s.title)
    if (!next?.trim()) return
    setSources((list) => list.map((x) => (x.id === s.id ? { ...x, title: next.trim() } : x)))
    try { await sourceApi.update(s.id, { title: next.trim() }) } catch { /* revert on next load */ }
  }

  return (
    <div className="hide-sb" style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-5)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 'var(--s-4)' }}>
        <h1 style={{ fontSize: 'var(--fs-title)' }}>Manbalar</h1>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="row surface-quiet" style={{ padding: '0 10px', height: 40, flex: 1, minWidth: 180 }}>
            <Search size={16} style={{ color: 'var(--text-3)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kitob nomi…"
              aria-label="Manbani qidirish"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)' }} />
          </div>
          {([['all', 'Hammasi'], ['ready', 'Tayyor'], ['processing', 'Jarayonda']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={filter === v ? 'chip chip-strong chip-btn' : 'chip chip-btn'}
              style={{ height: 40 }}>{l}</button>
          ))}
        </div>

        {loading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}

        {!loading && list.length === 0 && (
          <EmptyState emoji="📚" title="Manba yo'q"
            body="Kitob yuklash imkoniyati keyingi bosqichda qo'shiladi. Hozircha AI umumiy bilimidan javob beradi." />
        )}

        {list.map((s) => (
          <article key={s.id} className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 10 }}>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <BookOpen size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div className="col" style={{ minWidth: 0, gap: 3, flex: 1 }}>
                <strong className="truncate" style={{ fontSize: 'var(--fs-sm)' }}>{s.title}</strong>
                <span className="micro">
                  {[s.grade ? `${s.grade}-sinf` : null, s.page_count ? `${s.page_count} bet` : null]
                    .filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
              <StatusPill status={s.status} progress={s.progress} />
            </div>

            {s.status === 'failed' && s.error_message && (
              <p className="micro" style={{ margin: 0, color: 'var(--danger)' }}>
                <AlertCircle size={12} style={{ verticalAlign: -2 }} /> {s.error_message}
              </p>
            )}

            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-outline" style={{ height: 34 }} onClick={() => void rename(s)}>
                Nomini o'zgartirish
              </button>
              <select
                value={s.subject_id ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null
                  setSources((l) => l.map((x) => (x.id === s.id ? { ...x, subject_id: v } : x)))
                  void sourceApi.update(s.id, { subject_id: v })
                }}
                aria-label="Fan tayinlash"
                style={{
                  height: 34, borderRadius: 'var(--r-sm)', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)', color: 'var(--text)',
                  fontSize: 'var(--fs-label)', fontFamily: 'var(--font)', padding: '0 8px',
                }}>
                <option value="">Fan tanlanmagan</option>
                {subjects.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>

              {confirmId === s.id ? (
                <>
                  <button className="btn" style={{ height: 34, background: 'var(--danger)', color: '#fff' }}
                    onClick={() => void remove(s.id)}>Ha, o'chir</button>
                  <button className="btn btn-ghost" style={{ height: 34 }}
                    onClick={() => setConfirmId(null)}>Bekor</button>
                </>
              ) : (
                <button className="btn btn-ghost" style={{ height: 34, color: 'var(--danger)', marginLeft: 'auto' }}
                  onClick={() => setConfirmId(s.id)} aria-label={`${s.title} — o'chirish`}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function StatusPill({ status, progress }: { status: string; progress: number }) {
  const ready = status === 'ready'
  const failed = status === 'failed'
  return (
    <span className="chip" style={{
      flexShrink: 0,
      color: failed ? 'var(--danger)' : ready ? 'var(--success)' : 'var(--text-2)',
      borderColor: ready ? 'color-mix(in srgb, var(--success) 35%, transparent)' : undefined,
    }}>
      {ready && <Check size={12} />}
      {STATUS_LABEL[status] ?? status}
      {!ready && !failed && progress > 0 ? ` ${progress}%` : ''}
    </span>
  )
}
