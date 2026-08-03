import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, X, MessageSquare, Pin } from 'lucide-react'
import { api } from '@/lib/api'
import { useChatStore } from '@/store/chatStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { ChatSearchHit } from '@/types'

/**
 * Search runs locally over already-loaded titles for instant feedback,
 * then a debounced server call adds message-body matches.
 */
export function SearchDialog({ onClose, onNavigate }: { onClose: () => void; onNavigate: (to: string) => void }) {
  const isMobile = useIsMobile()
  const chats = useChatStore((s) => s.chats)
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<ChatSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounced server search — message bodies live only on the server.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setRemote([]); setLoading(false); return }
    setLoading(true)
    const t = window.setTimeout(() => {
      api.searchChats(term)
        .then((r) => setRemote(r.results))
        .catch(() => setRemote([]))
        .finally(() => setLoading(false))
    }, 260)
    return () => window.clearTimeout(t)
  }, [q])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    const local: ChatSearchHit[] = term
      ? chats
          .filter((c) => (c.title ?? '').toLowerCase().includes(term))
          .map((c) => ({
            id: c.id, title: c.title, updated_at: c.updated_at,
            pinned: c.pinned, project_id: c.project_id, snippet: null,
          }))
      : chats.slice(0, 8).map((c) => ({
          id: c.id, title: c.title, updated_at: c.updated_at,
          pinned: c.pinned, project_id: c.project_id, snippet: null,
        }))

    const seen = new Set(local.map((r) => r.id))
    return [...local, ...remote.filter((r) => !seen.has(r.id))].slice(0, 24)
  }, [q, chats, remote])

  useEffect(() => { setCursor(0) }, [q])

  const open = (id: string) => onNavigate(`/chat/${id}`)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); open(results[cursor]!.id) }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(1,12,38,0.55)', zIndex: 69 }}
      />
      <motion.div
        role="dialog" aria-modal="true" aria-label="Chatlardan qidirish"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="glass"
        onKeyDown={onKeyDown}
        style={{
          position: 'fixed', zIndex: 70,
          left: '50%', transform: 'translateX(-50%)',
          top: isMobile ? 'calc(12px + var(--safe-top))' : '12vh',
          width: isMobile ? 'calc(100% - 20px)' : 560,
          maxHeight: '70dvh',
          display: 'grid', gridTemplateRows: 'auto 1fr',
          overflow: 'hidden', padding: 0,
        }}
      >
        <div className="row" style={{ padding: '0 12px', height: 52, borderBottom: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--text-3)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chat nomi yoki xabar matni…"
            aria-label="Qidiruv so'zi"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 'var(--fs-body)', fontFamily: 'var(--font)',
            }}
          />
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Yopish">
            <X size={17} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {loading && results.length === 0 && (
            <div style={{ display: 'grid', gap: 6, padding: 6 }}>
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}
            </div>
          )}

          {!loading && results.length === 0 && (
            <p className="micro" style={{ padding: '26px 12px', textAlign: 'center', lineHeight: 1.6 }}>
              {q.trim().length < 2 ? 'Kamida 2 ta harf yozing.' : 'Hech narsa topilmadi.'}
            </p>
          )}

          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => open(r.id)}
              onMouseEnter={() => setCursor(i)}
              aria-selected={i === cursor}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%',
                padding: '9px 10px', minHeight: 44, borderRadius: 'var(--r-sm)',
                background: i === cursor ? 'var(--bg-hover)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                color: 'var(--text)', fontFamily: 'var(--font)',
              }}
            >
              {r.pinned
                ? <Pin size={14} style={{ color: 'var(--accent)', marginTop: 3, flexShrink: 0 }} />
                : <MessageSquare size={14} style={{ color: 'var(--text-3)', marginTop: 3, flexShrink: 0 }} />}
              <span className="col" style={{ minWidth: 0, gap: 2 }}>
                <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>
                  {r.title ?? 'Nomsiz chat'}
                </span>
                {r.snippet && (
                  <span className="micro" style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', lineHeight: 1.45,
                  }}>
                    {r.snippet}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  )
}
