import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Pin, MessageSquare, FolderOpen, MoreVertical, X,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectDialog } from '@/components/project/ProjectDialog'
import { ChatMenu } from '@/components/chat/ChatMenu'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { api, sourceApi } from '@/lib/api'
import { tap } from '@/lib/native'
import type { ChatSearchHit, ChatSummary, Subject } from '@/types'

type Tab = 'all' | 'starred' | 'projects'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Barchasi' },
  { id: 'starred', label: 'Mahkamlangan' },
  { id: 'projects', label: 'Loyihalar' },
]

/**
 * Chats owns everything historical: conversations, pinned items and
 * projects. Nothing here is duplicated in the settings drawer.
 */
export default function Chats() {
  const navigate = useNavigate()
  const { chats, loading, load } = useChatStore()
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)

  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<ChatSearchHit[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [projectOpen, setProjectOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<ChatSummary | null>(null)

  useEffect(() => {
    void load()
    void loadProjects()
    sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {})
  }, [load, loadProjects])

  // Message bodies live only on the server, so search reaches out for them.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setRemote([]); return }
    const t = window.setTimeout(() => {
      api.searchChats(term).then((r) => setRemote(r.results)).catch(() => setRemote([]))
    }, 280)
    return () => window.clearTimeout(t)
  }, [q])

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = tab === 'starred' ? chats.filter((c) => c.pinned) : chats

    if (term) {
      const local = list.filter((c) => (c.title ?? '').toLowerCase().includes(term))
      const seen = new Set(local.map((c) => c.id))
      const extra = remote
        .filter((r) => !seen.has(r.id))
        .map((r) => chats.find((c) => c.id === r.id))
        .filter((c): c is ChatSummary => Boolean(c))
      return [...local, ...extra]
    }
    return list
  }, [chats, tab, q, remote])

  const groups = useMemo(() => groupByDate(visible), [visible])

  return (
    <div data-scroll-root className="hide-sb" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto',
        padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-4)',
        paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--s-8))',
      }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 'var(--fs-display)' }}>Chatlar</h1>
          <button className="btn btn-primary" style={{ height: 42 }}
            onClick={() => { void tap(); navigate('/general') }}>
            <Plus size={17} /> Yangi
          </button>
        </div>

        {/* --------------------- search --------------------- */}
        <div className="surface-2 row" style={{ padding: '0 14px', height: 48 }}>
          <Search size={18} style={{ color: 'var(--text-3)' }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Chat yoki xabar matni…" aria-label="Qidirish"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
            }}
          />
          {q && (
            <button className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }}
              onClick={() => setQ('')} aria-label="Tozalash"><X size={15} /></button>
          )}
        </div>

        {/* ---------------------- tabs ---------------------- */}
        <div className="row" style={{
          gap: 4, background: 'var(--surface-2)', padding: 4,
          borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
        }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => { void tap(); setTab(id) }}
              aria-pressed={tab === id}
              style={{
                position: 'relative', flex: 1, minHeight: 40,
                borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                background: 'transparent', fontFamily: 'var(--font)',
                fontSize: 'var(--fs-label)',
                fontWeight: tab === id ? 650 : 520,
                color: tab === id ? 'var(--brand)' : 'var(--text-2)',
                transition: 'color var(--t-hover) var(--ease)',
              }}>
              {tab === id && (
                <motion.span
                  layoutId="chats-tab"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 'var(--r-sm)',
                    background: 'var(--surface)', boxShadow: 'var(--shadow-sm)',
                    zIndex: -1,
                  }}
                />
              )}
              {label}
            </button>
          ))}
        </div>

        {/* --------------------- content --------------------- */}
        {loading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 62 }} />)}

        {tab === 'projects' ? (
          <ProjectList
            projects={projects}
            onOpen={(id) => navigate(`/loyiha/${id}`)}
            onCreate={() => setProjectOpen(true)}
          />
        ) : (
          <>
            {!loading && visible.length === 0 && (
              <EmptyState
                emoji={tab === 'starred' ? '📌' : '💬'}
                title={q ? 'Hech narsa topilmadi'
                  : tab === 'starred' ? "Mahkamlangan chat yo'q" : "Chat yo'q"}
                body={q ? 'Boshqa so\u02bcz bilan qidiring.'
                  : tab === 'starred'
                    ? 'Muhim chatni mahkamlab qo\u02bcying — u shu yerda turadi.'
                    : 'General bo\u02bclimidan birinchi savolingizni yuboring.'}
                action={!q && tab === 'all' ? (
                  <button className="btn btn-primary" onClick={() => navigate('/general')}>
                    <Plus size={16} /> Yangi chat
                  </button>
                ) : undefined}
              />
            )}

            {groups.map(({ label, items }) => (
              <section key={label} style={{ display: 'grid', gap: 6 }}>
                <span className="micro" style={{
                  paddingInline: 4, fontWeight: 650, letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}>{label}</span>

                <div className="surface" style={{ padding: 5, display: 'grid', gap: 2 }}>
                  {items.map((c) => (
                    <ChatRow
                      key={c.id}
                      chat={c}
                      projectName={projects.find((p) => p.id === c.project_id)?.name}
                      onOpen={() => { void tap(); navigate(`/chat/${c.id}`) }}
                      onMenu={() => setMenuFor(c)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <AnimatePresence>
        {projectOpen && (
          <ProjectDialog key="proj" subjects={subjects} onClose={() => setProjectOpen(false)} />
        )}
        {menuFor && (
          <ChatMenu key="menu" chat={menuFor} onClose={() => setMenuFor(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------- rows -------------------------------- */

function ChatRow({ chat, projectName, onOpen, onMenu }: {
  chat: ChatSummary; projectName?: string; onOpen: () => void; onMenu: () => void
}) {
  return (
    <div className="row" style={{ gap: 0 }}>
      <button
        onClick={onOpen}
        className="pressable"
        style={{
          display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0,
          padding: '11px 10px', minHeight: 56, borderRadius: 'var(--r-sm)',
          background: 'transparent', border: 'none', textAlign: 'left',
          color: 'var(--text)', fontFamily: 'var(--font)',
        }}
      >
        <span style={{
          width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center',
          borderRadius: 'var(--r-xs)',
          background: chat.pinned ? 'var(--brand-soft)' : 'var(--bg-hover)',
          color: chat.pinned ? 'var(--brand)' : 'var(--text-3)',
        }}>
          {chat.pinned ? <Pin size={17} /> : <MessageSquare size={17} />}
        </span>

        <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 580 }}>
            {chat.title ?? 'Nomsiz chat'}
          </span>
          <span className="micro truncate">
            {[projectName, timeLabel(chat.updated_at)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>

      <button className="btn btn-ghost btn-icon" style={{ width: 40, height: 40 }}
        onClick={onMenu} aria-label={`${chat.title ?? 'Chat'} amallari`}>
        <MoreVertical size={17} />
      </button>
    </div>
  )
}

function ProjectList({ projects, onOpen, onCreate }: {
  projects: { id: string; name: string; emoji: string; color: string
    chat_count: number; source_count: number; pinned: boolean }[]
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  if (projects.length === 0) {
    return (
      <EmptyState emoji="📁" title="Loyiha yo'q"
        body="Fan bo'yicha ish maydoni yarating — chatlar va manbalar bir joyda turadi."
        action={<button className="btn btn-primary" onClick={onCreate}>
          <Plus size={16} /> Loyiha yaratish
        </button>} />
    )
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
      <button className="btn btn-outline" style={{ height: 46 }} onClick={onCreate}>
        <Plus size={17} /> Yangi loyiha
      </button>

      {projects.map((p) => (
        <button key={p.id} onClick={() => onOpen(p.id)} className="surface pressable"
          style={{
            display: 'flex', alignItems: 'center', gap: 13, width: '100%',
            padding: 'var(--s-4)', textAlign: 'left',
            border: '1px solid var(--border)', color: 'var(--text)',
            fontFamily: 'var(--font)',
          }}>
          <span data-emoji style={{
            width: 46, height: 46, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-sm)', fontSize: 23,
            background: `color-mix(in srgb, ${p.color} 15%, transparent)`,
          }}>{p.emoji}</span>

          <span className="col" style={{ gap: 3, minWidth: 0, flex: 1 }}>
            <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 640 }}>
              {p.name}
            </span>
            <span className="micro">
              {p.chat_count} chat · {p.source_count} manba
            </span>
          </span>

          {p.pinned && <Pin size={15} style={{ color: 'var(--brand)' }} />}
          <FolderOpen size={17} style={{ color: 'var(--text-3)' }} />
        </button>
      ))}
    </div>
  )
}

/* --------------------------- grouping ----------------------------- */

function groupByDate(chats: ChatSummary[]): { label: string; items: ChatSummary[] }[] {
  const pinned = chats.filter((c) => c.pinned)
  const rest = chats.filter((c) => !c.pinned)

  const now = Date.now()
  const day = 86_400_000
  const buckets: Record<string, ChatSummary[]> = {
    Bugun: [], Kecha: [], "Oxirgi 7 kun": [], "Oxirgi 30 kun": [], Eskiroq: [],
  }

  for (const c of rest) {
    const age = now - new Date(c.updated_at).getTime()
    if (age < day) buckets.Bugun!.push(c)
    else if (age < 2 * day) buckets.Kecha!.push(c)
    else if (age < 7 * day) buckets['Oxirgi 7 kun']!.push(c)
    else if (age < 30 * day) buckets['Oxirgi 30 kun']!.push(c)
    else buckets.Eskiroq!.push(c)
  }

  const out: { label: string; items: ChatSummary[] }[] = []
  if (pinned.length) out.push({ label: 'Mahkamlangan', items: pinned })
  for (const [label, items] of Object.entries(buckets)) {
    if (items.length) out.push({ label, items })
  }
  return out
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const age = Date.now() - d.getTime()
  if (age < 86_400_000) {
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })
}
