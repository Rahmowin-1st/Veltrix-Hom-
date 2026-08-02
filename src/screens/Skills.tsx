import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Play, Pencil, Copy, Trash2, MoreVertical,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSkillStore } from '@/store/skillStore'
import { useProjectStore } from '@/store/projectStore'
import { sourceApi } from '@/lib/api'
import type { Skill, Subject } from '@/types'

const EMOJIS = ['✨', '➗', '🧪', '📖', '🇬🇧', '💻', '📐', '🔬', '🎯', '📝', '🧠', '⚡']

/**
 * Skills library. A Skill is a reusable instruction profile that is sent
 * with the prompt — it never overrides source authorisation or safety.
 */
export default function Skills() {
  const navigate = useNavigate()
  const { skills, loading, load, remove, duplicate } = useSkillStore()
  const loadProjects = useProjectStore((s) => s.load)
  const projects = useProjectStore((s) => s.projects)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Skill | 'new' | null>(null)
  const [menuFor, setMenuFor] = useState<Skill | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Skill | null>(null)

  useEffect(() => {
    void load()
    void loadProjects()
    sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {})
  }, [load, loadProjects])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return skills
    return skills.filter((s) =>
      s.name.toLowerCase().includes(term) ||
      (s.description ?? '').toLowerCase().includes(term))
  }, [skills, q])

  const useSkill = (s: Skill) => {
    useSkillStore.getState().setActive(s.id)
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
        <header style={{ display: 'grid', gap: 3 }}>
          <h1 style={{ fontSize: 'var(--fs-title)' }}>Skills</h1>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Qayta ishlatiladigan AI yo'riqnomalari
          </p>
        </header>

        <div className="row" style={{ gap: 8 }}>
          <div className="row surface-quiet" style={{ padding: '0 10px', height: 42, flex: 1 }}>
            <Search size={16} style={{ color: 'var(--text-3)' }} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Skill qidirish…" aria-label="Skill qidirish"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
              }}
            />
          </div>
          <button className="btn btn-primary" style={{ height: 42 }} onClick={() => setEditing('new')}>
            <Plus size={17} /> Yangi
          </button>
        </div>

        {loading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 86 }} />)}

        {!loading && list.length === 0 && (
          <EmptyState
            emoji="✨"
            title={q ? 'Hech narsa topilmadi' : "Skill yo'q"}
            body={q
              ? 'Boshqa so\u02bcz bilan qidiring.'
              : "Masalan: \u201cAlgebra yechuvchi\u201d \u2014 har doim bosqichma-bosqich yechadi."}
            action={!q ? (
              <button className="btn btn-primary" onClick={() => setEditing('new')}>
                <Plus size={16} /> Birinchi skill yaratish
              </button>
            ) : undefined}
          />
        )}

        {list.map((s) => (
          <article key={s.id} className="surface"
            style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}>
            <div className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
              <span aria-hidden style={{
                width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center',
                borderRadius: 'var(--r-md)', fontSize: 20,
                background: `color-mix(in srgb, ${s.color} 14%, transparent)`,
              }}>{s.emoji}</span>

              <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <strong className="truncate" style={{ fontSize: 'var(--fs-sm)' }}>{s.name}</strong>
                {s.description && <span className="micro clamp-2">{s.description}</span>}
                <span className="micro">{scopeLabel(s, projects, subjects)}</span>
              </div>

              <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }}
                onClick={() => setMenuFor(s)} aria-label={`${s.name} amallari`}>
                <MoreVertical size={17} />
              </button>
            </div>

            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-primary" style={{ height: 34, flex: 1 }} onClick={() => useSkill(s)}>
                <Play size={14} /> Ishlatish
              </button>
              <button className="btn btn-outline" style={{ height: 34 }} onClick={() => setEditing(s)}>
                <Pencil size={14} /> Tahrir
              </button>
            </div>
          </article>
        ))}
      </div>

      <AnimatePresence>
        {menuFor && (
          <BottomSheet key="menu" title={menuFor.name} onClose={() => setMenuFor(null)} desktopWidth={360}>
            <div style={{ display: 'grid', gap: 2 }}>
              <SheetAction icon={<Play size={17} />} label="Chatda ishlatish"
                onClick={() => { useSkill(menuFor); setMenuFor(null) }} />
              <SheetAction icon={<Pencil size={17} />} label="Tahrirlash"
                onClick={() => { setEditing(menuFor); setMenuFor(null) }} />
              <SheetAction icon={<Copy size={17} />} label="Nusxalash"
                onClick={() => { void duplicate(menuFor.id); setMenuFor(null) }} />
              <SheetAction icon={<Trash2 size={17} />} label="O'chirish" danger
                onClick={() => { setConfirmDelete(menuFor); setMenuFor(null) }} />
            </div>
          </BottomSheet>
        )}

        {confirmDelete && (
          <BottomSheet key="confirm" title="O'chirilsinmi?" onClose={() => setConfirmDelete(null)} desktopWidth={380}>
            <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
              <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
                <strong>{confirmDelete.name}</strong> butunlay o'chiriladi. Buni qaytarib bo'lmaydi.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setConfirmDelete(null)}>Bekor</button>
                <button className="btn btn-danger" style={{ flex: 1 }}
                  onClick={() => { void remove(confirmDelete.id); setConfirmDelete(null) }}>
                  O'chirish
                </button>
              </div>
            </div>
          </BottomSheet>
        )}

        {editing && (
          <SkillEditor
            key="editor"
            skill={editing === 'new' ? undefined : editing}
            subjects={subjects}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ----------------------------- editor ------------------------------ */

function SkillEditor({ skill, subjects, onClose }: {
  skill?: Skill; subjects: Subject[]; onClose: () => void
}) {
  const create = useSkillStore((s) => s.create)
  const update = useSkillStore((s) => s.update)
  const projects = useProjectStore((s) => s.projects)

  const [name, setName] = useState(skill?.name ?? '')
  const [emoji, setEmoji] = useState(skill?.emoji ?? '✨')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [instructions, setInstructions] = useState(skill?.instructions ?? '')
  const [scope, setScope] = useState<Skill['scope']>(skill?.scope ?? 'global')
  const [projectId, setProjectId] = useState(skill?.project_id ?? '')
  const [subjectId, setSubjectId] = useState(skill?.subject_id ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const body = {
      name: name.trim(), emoji,
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      scope,
      project_id: scope === 'project' ? (projectId || null) : null,
      subject_id: scope === 'subject' ? (subjectId || null) : null,
    }
    if (skill) await update(skill.id, body)
    else await create(body)
    setSaving(false)
    onClose()
  }

  return (
    <BottomSheet title={skill ? 'Skillni tahrirlash' : 'Yangi skill'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <Field label="Nomi">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Algebra yechuvchi" maxLength={60} />
        </Field>

        <Field label="Belgi">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e}
                style={{
                  width: 42, height: 42, borderRadius: 'var(--r-md)', fontSize: 19, cursor: 'pointer',
                  background: emoji === e ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${emoji === e ? 'var(--brand)' : 'transparent'}`,
                }}>{e}</button>
            ))}
          </div>
        </Field>

        <Field label="Tavsif" hint="ro'yxatda ko'rinadi">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Masalalarni qadam-baqadam yechadi" maxLength={300} />
        </Field>

        <Field label="Ko'rsatmalar" hint="AI shu qoidaga amal qiladi">
          <textarea className="input" rows={4} value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Har doim yechimni bosqichma-bosqich ko'rsat. Formulaga havola ber."
            maxLength={2000} />
        </Field>

        <Field label="Qo'llash doirasi">
          <div className="row" style={{
            gap: 4, background: 'var(--bg-hover)', padding: 3, borderRadius: 'var(--r-md)',
          }}>
            {([['global', 'Hamma joyda'], ['project', 'Loyiha'], ['subject', 'Fan']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setScope(v)} aria-pressed={scope === v}
                style={{
                  flex: 1, minHeight: 36, borderRadius: 'var(--r-sm)', cursor: 'pointer', border: 'none',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-label)',
                  background: scope === v ? 'var(--surface)' : 'transparent',
                  color: scope === v ? 'var(--text)' : 'var(--text-2)',
                  fontWeight: scope === v ? 580 : 480,
                  boxShadow: scope === v ? 'var(--shadow-sm)' : 'none',
                }}>{l}</button>
            ))}
          </div>
        </Field>

        {scope === 'project' && (
          <Field label="Qaysi loyiha">
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Tanlang</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </Field>
        )}

        {scope === 'subject' && (
          <Field label="Qaysi fan">
            <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Tanlang</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}

        <div className="row" style={{ gap: 8, paddingTop: 4 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            disabled={!name.trim() || saving} onClick={() => void save()}>
            {saving ? 'Saqlanmoqda…' : skill ? 'Saqlash' : 'Yaratish'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ---------------------------- helpers ------------------------------ */

function scopeLabel(s: Skill, projects: { id: string; name: string }[], subjects: Subject[]): string {
  if (s.scope === 'project') {
    const p = projects.find((x) => x.id === s.project_id)
    return p ? `Loyiha: ${p.name}` : 'Loyiha skilli'
  }
  if (s.scope === 'subject') {
    const sub = subjects.find((x) => x.id === s.subject_id)
    return sub ? `Fan: ${sub.name}` : 'Fan skilli'
  }
  return 'Hamma joyda'
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)', fontWeight: 540 }}>
        {label}{hint && <span className="micro" style={{ marginLeft: 6 }}>{hint}</span>}
      </span>
      {children}
    </label>
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
