import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, FolderKanban, MessageSquare, Pin, Search, X } from 'lucide-react'
import { api, sourceApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { ChatSearchHit, Source } from '@/types'

type FlatResult =
  | { key: string; kind: 'chat'; id: string; title: string; subtitle?: string | null; pinned?: boolean }
  | { key: string; kind: 'project'; id: string; title: string; subtitle?: string | null }
  | { key: string; kind: 'source'; id: string; title: string; subtitle?: string | null }

let sourceCache: { ownerId: string | null; at: number; items: Source[] } = {
  ownerId: null, at: 0, items: [],
}

/** Instant grouped search over cached chats/projects, plus a softly refreshed
 * source cache and debounced server-side message-body search. */
export function SearchDialog({ onClose, onNavigate }: {
  onClose: () => void
  onNavigate: (to: string) => void
}) {
  const isMobile = useIsMobile()
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const chats = useChatStore((state) => state.chats)
  const projects = useProjectStore((state) => state.projects)
  const loadProjects = useProjectStore((state) => state.load)

  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<ChatSearchHit[]>([])
  const [sources, setSources] = useState<Source[]>(() => sourceCache.ownerId === userId ? sourceCache.items : [])
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeq = useRef(0)

  useEffect(() => { inputRef.current?.focus(); void loadProjects() }, [loadProjects])

  useEffect(() => {
    let cancelled = false
    const fresh = sourceCache.ownerId === userId && Date.now() - sourceCache.at < 60_000
    if (fresh) { setSources(sourceCache.items); return }
    if (!userId) { setSources([]); return }

    sourceApi.list().then(({ sources: next }) => {
      if (cancelled) return
      sourceCache = { ownerId: userId, at: Date.now(), items: next }
      setSources(next)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    const term = q.trim()
    const seq = ++searchSeq.current
    if (term.length < 2) { setRemote([]); setLoadingRemote(false); return }
    setLoadingRemote(true)
    const timer = window.setTimeout(() => {
      api.searchChats(term)
        .then((result) => { if (searchSeq.current === seq) setRemote(result.results) })
        .catch(() => { if (searchSeq.current === seq) setRemote([]) })
        .finally(() => { if (searchSeq.current === seq) setLoadingRemote(false) })
    }, 240)
    return () => window.clearTimeout(timer)
  }, [q])

  const term = q.trim().toLowerCase()
  const chatResults = useMemo(() => {
    const local: ChatSearchHit[] = term
      ? chats.filter((chat) => (chat.title ?? '').toLowerCase().includes(term)).map((chat) => ({
          id: chat.id, title: chat.title, updated_at: chat.updated_at,
          pinned: chat.pinned, project_id: chat.project_id, snippet: null,
        }))
      : chats.slice(0, 8).map((chat) => ({
          id: chat.id, title: chat.title, updated_at: chat.updated_at,
          pinned: chat.pinned, project_id: chat.project_id, snippet: null,
        }))
    const seen = new Set(local.map((item) => item.id))
    return [...local, ...remote.filter((item) => !seen.has(item.id))].slice(0, 20)
  }, [chats, remote, term])

  const projectResults = useMemo(() => {
    if (!term) return projects.slice(0, 5)
    return projects.filter((project) => project.name.toLowerCase().includes(term)).slice(0, 8)
  }, [projects, term])

  const sourceResults = useMemo(() => {
    if (!term) return sources.slice(0, 5)
    return sources.filter((source) => source.title.toLowerCase().includes(term)).slice(0, 8)
  }, [sources, term])

  const flat = useMemo<FlatResult[]>(() => [
    ...chatResults.map((item) => ({
      key: `chat:${item.id}`, kind: 'chat' as const, id: item.id,
      title: item.title ?? 'Nomsiz chat', subtitle: item.snippet, pinned: item.pinned,
    })),
    ...projectResults.map((item) => ({
      key: `project:${item.id}`, kind: 'project' as const, id: item.id,
      title: item.name, subtitle: `${item.chat_count ?? 0} chat · ${item.source_count ?? 0} manba`,
    })),
    ...sourceResults.map((item) => ({
      key: `source:${item.id}`, kind: 'source' as const, id: item.id,
      title: item.title, subtitle: item.status === 'ready' ? 'Tayyor manba' : 'Qayta ishlanmoqda',
    })),
  ], [chatResults, projectResults, sourceResults])

  useEffect(() => { setCursor(0) }, [q])

  const openResult = (result: FlatResult) => {
    if (result.kind === 'chat') onNavigate(`/chat/${result.id}`)
    else if (result.kind === 'project') onNavigate(`/loyiha/${result.id}`)
    else onNavigate(`/manbalar?source=${encodeURIComponent(result.id)}`)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((value) => Math.min(value + 1, Math.max(0, flat.length - 1))) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)) }
    if (event.key === 'Enter' && flat[cursor]) { event.preventDefault(); openResult(flat[cursor]!) }
  }

  const noResults = !loadingRemote && flat.length === 0

  return (
    <>
      <motion.button type="button" aria-label="Qidiruvni yopish"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="v12-search-backdrop" />
      <motion.div
        role="dialog" aria-modal="true" aria-label="Veltrix qidiruvi"
        initial={{ opacity: 0, y: -10, scale: .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: .98 }}
        transition={{ duration: .17, ease: [0.16, 1, 0.3, 1] }}
        className="v12-search-dialog"
        onKeyDown={onKeyDown}
        style={{
          top: isMobile ? 'calc(10px + var(--safe-top))' : '10vh',
          left: isMobile ? 10 : '50%',
          marginLeft: isMobile ? 0 : -295,
          width: isMobile ? 'calc(100% - 20px)' : 590,
        }}
      >
        <div className="v12-search-field">
          <Search size={20} />
          <input ref={inputRef} value={q} onChange={(event) => setQ(event.target.value)}
            placeholder="Chat, loyiha yoki manba…" aria-label="Qidiruv so‘zi" />
          <button type="button" onClick={onClose} aria-label="Yopish"><X size={18} /></button>
        </div>

        <div className="v12-search-results hide-sb">
          {loadingRemote && term.length >= 2 && <div className="v12-search-status">Xabarlar ham tekshirilmoqda…</div>}
          {noResults && <div className="v12-search-empty">Hech narsa topilmadi.</div>}

          <ResultGroup title="Chatlar" hidden={chatResults.length === 0}>
            {chatResults.map((item) => {
              const index = flat.findIndex((result) => result.key === `chat:${item.id}`)
              return <ResultRow key={item.id} selected={index === cursor}
                icon={item.pinned ? <Pin size={17} /> : <MessageSquare size={17} />}
                title={item.title ?? 'Nomsiz chat'} subtitle={item.snippet}
                onHover={() => setCursor(index)} onClick={() => openResult(flat[index]!)} />
            })}
          </ResultGroup>

          <ResultGroup title="Loyihalar" hidden={projectResults.length === 0}>
            {projectResults.map((item) => {
              const index = flat.findIndex((result) => result.key === `project:${item.id}`)
              return <ResultRow key={item.id} selected={index === cursor}
                icon={<FolderKanban size={17} />} title={item.name}
                subtitle={`${item.chat_count ?? 0} chat · ${item.source_count ?? 0} manba`}
                onHover={() => setCursor(index)} onClick={() => openResult(flat[index]!)} />
            })}
          </ResultGroup>

          <ResultGroup title="Manbalar" hidden={sourceResults.length === 0}>
            {sourceResults.map((item) => {
              const index = flat.findIndex((result) => result.key === `source:${item.id}`)
              return <ResultRow key={item.id} selected={index === cursor}
                icon={<BookOpen size={17} />} title={item.title}
                subtitle={item.status === 'ready' ? 'Tayyor manba' : 'Qayta ishlanmoqda'}
                onHover={() => setCursor(index)} onClick={() => openResult(flat[index]!)} />
            })}
          </ResultGroup>
        </div>
      </motion.div>
    </>
  )
}

function ResultGroup({ title, hidden, children }: { title: string; hidden: boolean; children: React.ReactNode }) {
  if (hidden) return null
  return <section className="v12-search-group"><h2>{title}</h2>{children}</section>
}

function ResultRow({ icon, title, subtitle, selected, onClick, onHover }: {
  icon: React.ReactNode
  title: string
  subtitle?: string | null
  selected: boolean
  onClick: () => void
  onHover: () => void
}) {
  return (
    <button type="button" className="v12-search-row" data-selected={selected ? '' : undefined}
      onClick={onClick} onMouseEnter={onHover}>
      <span aria-hidden>{icon}</span>
      <span className="v12-search-copy">
        <strong className="truncate">{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </button>
  )
}
