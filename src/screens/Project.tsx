import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  Plus, Settings2, MessageSquare, Library, Check, Trash2,
  Pin, PinOff, ArrowLeft,
} from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectDialog } from '@/components/project/ProjectDialog'
import { projectApi, sourceApi } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import { useChatStore } from '@/store/chatStore'
import { useSkillStore } from '@/store/skillStore'
import { useUIStore } from '@/store/uiStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { Source, Subject } from '@/types'

/**
 * A project is an isolated workspace. Its sources and instructions apply
 * to chats inside it and nowhere else — the isolation is enforced by the
 * chat's `project_id`, not by anything this screen keeps in memory.
 */
export default function Project() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)
  const updateProject = useProjectStore((s) => s.update)
  const removeProject = useProjectStore((s) => s.remove)

  const chats = useChatStore((s) => s.chats)
  const skills = useSkillStore((s) => s.skills)
  const loadSkills = useSkillStore((s) => s.load)
  const setActiveSkill = useSkillStore((s) => s.setActive)
  const setNavHidden = useUIStore((s) => s.setNavHidden)

  const [sources, setSources] = useState<Source[]>([])
  const [allSources, setAllSources] = useState<Source[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(true)

  const project = projects.find((p) => p.id === projectId)

  useEffect(() => { void loadProjects(); void loadSkills() }, [loadProjects, loadSkills])
  useEffect(() => {
    setNavHidden(Boolean(isMobile))
    return () => setNavHidden(false)
  }, [isMobile, setNavHidden])

  const refreshSources = useCallback(async () => {
    if (!projectId) return
    try {
      const [mine, all] = await Promise.all([
        projectApi.sources(projectId),
        sourceApi.list(),
      ])
      setSources(mine.sources)
      setAllSources(all.sources)
    } catch { /* leave the last known list in place */ }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    Promise.all([refreshSources(), sourceApi.subjects().then((r) => setSubjects(r.subjects))])
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [refreshSources])

  // Only chats that belong to this project — nothing leaks in.
  const projectChats = useMemo(
    () => chats.filter((c) => c.project_id === projectId),
    [chats, projectId]
  )

  // Skills scoped to this project, plus every global one.
  const projectSkills = useMemo(
    () => skills.filter((s) => s.scope === 'global' || s.project_id === projectId),
    [skills, projectId]
  )

  if (!project) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 'var(--s-6)' }}>
        {loading
          ? <div className="skeleton" style={{ height: 120, width: '100%', maxWidth: 420 }} />
          : <EmptyState emoji="📁" title="Loyiha topilmadi"
              body="Bu loyiha o'chirilgan bo'lishi mumkin."
              action={<button className="btn btn-primary" onClick={() => navigate('/chat')}>
                Chatga qaytish
              </button>} />}
      </div>
    )
  }

  const startChat = () => {
    // The new chat is tagged with this project the moment it is created.
    useUIStore.getState().setPendingProject(project.id)
    navigate('/chat')
  }

  return (
    <div data-scroll-root className="hide-sb" style={{ flex: 1, overflowY: 'auto' }}>
      {isMobile && (
        <div className="row" style={{
          position: 'sticky', top: 0, zIndex: 5, gap: 4,
          height: 'var(--header-h)', paddingTop: 'var(--safe-top)', paddingInline: 6,
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)} aria-label="Orqaga">
            <ArrowLeft size={21} />
          </button>
          <span className="truncate" style={{ fontSize: 'var(--fs-lead)', fontWeight: 640 }}>
            {project.emoji} {project.name}
          </span>
        </div>
      )}

      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto',
        padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-4)',
        paddingBottom: 'calc(var(--safe-bottom) + var(--s-9))',
      }}>
        {/* ---------------- project header ---------------- */}
        <header className="glass" style={{
          padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)',
          borderColor: `color-mix(in srgb, ${project.color} 30%, var(--border))`,
        }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span aria-hidden style={{
              width: 50, height: 50, flexShrink: 0, display: 'grid', placeItems: 'center',
              borderRadius: 'var(--r-md)', fontSize: 25,
              background: `color-mix(in srgb, ${project.color} 16%, transparent)`,
            }}>{project.emoji}</span>

            <div className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
              <h1 className="truncate" style={{ fontSize: 'var(--fs-section)' }}>{project.name}</h1>
              <span className="micro truncate">
                {[subjects.find((s) => s.id === project.subject_id)?.name,
                  project.grade ? `${project.grade}-sinf` : null]
                  .filter(Boolean).join(' · ') || 'Fan tanlanmagan'}
              </span>
            </div>

            <button
              className="btn btn-ghost btn-icon"
              onClick={() => void updateProject(project.id, { pinned: !project.pinned })}
              aria-label={project.pinned ? 'Mahkamdan olish' : 'Mahkamlash'}
              style={{ width: 38, height: 38 }}
            >
              {project.pinned ? <PinOff size={17} /> : <Pin size={17} />}
            </button>
          </div>

          <div className="row" style={{ gap: 14 }}>
            <Stat icon={<MessageSquare size={14} />} n={projectChats.length} label="chat" />
            <Stat icon={<Library size={14} />} n={sources.length} label="manba" />
          </div>

          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ height: 38, flex: 1, minWidth: 130 }}
              onClick={startChat}>
              <Plus size={16} /> Yangi chat
            </button>
            <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setManaging(true)}>
              <Library size={15} /> Manbalar
            </button>
            <button className="btn btn-ghost btn-icon" style={{ width: 38, height: 38 }}
              onClick={() => setEditing(true)} aria-label="Loyiha sozlamalari">
              <Settings2 size={17} />
            </button>
          </div>
        </header>

        {/* ---------------- project sources ---------------- */}
        <Section title="Loyiha manbalari" count={sources.length}>
          {sources.length === 0 ? (
            <p className="micro" style={{ lineHeight: 1.6 }}>
              Manba biriktirilmagan — bu loyihadagi chatlar umumiy bilimdan javob oladi.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {sources.map((s) => (
                <div key={s.id} className="surface-quiet"
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span aria-hidden style={{
                    width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center',
                    borderRadius: 'var(--r-sm)', fontSize: 16,
                    background: `color-mix(in srgb, ${s.color} 15%, transparent)`,
                  }}>{s.emoji}</span>
                  <span className="col" style={{ gap: 1, minWidth: 0, flex: 1 }}>
                    <span className="truncate" style={{ fontSize: 'var(--fs-label)', fontWeight: 530 }}>
                      {s.title}
                    </span>
                    <span className="micro">
                      {s.page_count ? `${s.page_count} bet` : 'PDF'}
                    </span>
                  </span>
                  {s.status === 'ready' && <Check size={15} style={{ color: 'var(--success)' }} />}
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-outline" style={{ height: 36, justifySelf: 'start' }}
            onClick={() => setManaging(true)}>
            <Plus size={15} /> Manba biriktirish
          </button>
        </Section>

        {/* ---------------- active skills ---------------- */}
        <Section title="Faol Talentlar" count={projectSkills.length}>
          {projectSkills.length === 0 ? (
            <p className="micro">Skill yo'q.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {projectSkills.map((s) => (
                <button key={s.id} className="chip chip-btn" style={{ height: 34 }}
                  onClick={() => { setActiveSkill(s.id); startChat() }}>
                  <span aria-hidden>{s.emoji}</span> {s.name}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* ---------------- project chats ---------------- */}
        <Section title="Chatlar" count={projectChats.length}>
          {projectChats.length === 0 ? (
            <p className="micro" style={{ lineHeight: 1.6 }}>
              Hali chat yo'q. Yangi chat boshlang — u avtomatik shu loyihaga tegishli bo'ladi.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 2 }}>
              {projectChats.map((c) => (
                <button key={c.id} onClick={() => navigate(`/chat/${c.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '10px 10px', minHeight: 46, borderRadius: 'var(--r-md)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left', color: 'var(--text)', fontFamily: 'var(--font)',
                  }}>
                  {c.pinned
                    ? <Pin size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                    : <MessageSquare size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                  <span className="truncate" style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>
                    {c.title ?? 'Nomsiz chat'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <button className="btn btn-ghost" style={{ color: 'var(--danger)', justifySelf: 'start' }}
          onClick={() => setConfirmDelete(true)}>
          <Trash2 size={15} /> Loyihani o'chirish
        </button>
      </div>

      <AnimatePresence>
        {managing && (
          <SourceManager
            key="manage"
            all={allSources}
            attached={sources.map((s) => s.id)}
            onClose={() => setManaging(false)}
            onSave={async (ids) => {
              await projectApi.setSources(project.id, ids)
              await refreshSources()
              setManaging(false)
            }}
          />
        )}

        {editing && (
          <ProjectDialog key="edit" existing={project} subjects={subjects}
            onClose={() => setEditing(false)} />
        )}

        {confirmDelete && (
          <BottomSheet key="del" title="Loyiha o'chirilsinmi?"
            onClose={() => setConfirmDelete(false)} desktopWidth={400}>
            <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
              <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
                <strong>{project.name}</strong> o'chiriladi. Chatlar va manbalar
                saqlanadi — ular shunchaki loyihadan chiqadi.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setConfirmDelete(false)}>Bekor</button>
                <button className="btn btn-danger" style={{ flex: 1 }}
                  onClick={async () => { await removeProject(project.id); navigate('/chat') }}>
                  O'chirish
                </button>
              </div>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------- pieces ------------------------------- */

function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <span className="row" style={{ gap: 5, color: 'var(--text-2)', fontSize: 'var(--fs-label)' }}>
      {icon}<strong style={{ color: 'var(--text)' }}>{n}</strong> {label}
    </span>
  )
}

function Section({ title, count, children }: {
  title: string; count?: number; children: React.ReactNode
}) {
  return (
    <section className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--fs-h3)' }}>{title}</h2>
        {count !== undefined && <span className="micro">{count}</span>}
      </div>
      {children}
    </section>
  )
}

/** Attach or detach sources. Saves once, so a slow list never half-applies. */
function SourceManager({ all, attached, onClose, onSave }: {
  all: Source[]
  attached: string[]
  onClose: () => void
  onSave: (ids: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>(attached)
  const [saving, setSaving] = useState(false)
  const ready = all.filter((s) => s.status === 'ready')

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <BottomSheet title="Loyiha manbalari" onClose={onClose}>
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        {ready.length === 0 && (
          <p className="micro" style={{ padding: '18px 4px', textAlign: 'center', lineHeight: 1.6 }}>
            Tayyor manba yo'q. Manbalar bo'limidan kitob yuklang.
          </p>
        )}

        {ready.map((s) => {
          const on = selected.includes(s.id)
          return (
            <button key={s.id} onClick={() => toggle(s.id)} aria-pressed={on}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 12px', minHeight: 52, borderRadius: 'var(--r-md)',
                background: on ? 'var(--bg-active)' : 'transparent',
                border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                fontFamily: 'var(--font)',
              }}>
              <span aria-hidden style={{ fontSize: 18 }}>{s.emoji}</span>
              <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 530 }}>
                  {s.title}
                </span>
                <span className="micro">{s.page_count ? `${s.page_count} bet` : 'PDF'}</span>
              </span>
              {on && <Check size={17} style={{ color: 'var(--brand)' }} />}
            </button>
          )
        })}

        <div className="row" style={{ gap: 8, paddingTop: 4 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}
            onClick={async () => { setSaving(true); await onSave(selected); setSaving(false) }}>
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
