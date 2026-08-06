import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquareText, Sparkles, Languages, LibraryBig, FolderKanban,
  Settings, Plus, Search, MoreHorizontal, UserRound, GraduationCap,
  Calculator, ClipboardList, Gamepad2, Star,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { ChatMenu } from '@/components/chat/ChatMenu'
import { tap } from '@/lib/native'

/** Veltrix-specific tools, compact enough to sit in one scrollable rail. */
const QUICK_TOOLS = [
  { to: '/talent', label: 'Talentlar', Icon: GraduationCap },
  { to: '/tarjima', label: 'Tarjima', Icon: Languages },
  { to: '/kalkulyator', label: 'Kalkulyator', Icon: Calculator },
  { to: '/testlar', label: 'Testlar', Icon: ClipboardList },
  { to: '/oyin', label: "Fan o'yini", Icon: Gamepad2 },
] as const

const NAV = [
  { to: '/general', label: 'General', Icon: Sparkles },
  { to: '/personal', label: 'Personal', Icon: UserRound },
  { to: '/tarjima', label: 'Tarjima', Icon: Languages },
  { to: '/manbalar', label: 'Manbalar', Icon: LibraryBig },
  { to: '/talent', label: 'Talentlar', Icon: GraduationCap },
  { to: '/settings', label: 'Sozlamalar', Icon: Settings },
] as const

export function SettingsDrawer({ onClose, onNavigate }: { onClose: () => void; onNavigate: (to: string) => void }) {
  const location = useLocation()
  const profile = useAuthStore((s) => s.profile)
  const chats = useChatStore((s) => s.chats)
  const loadChatsIfStale = useChatStore((s) => s.loadIfStale)
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)
  const [query, setQuery] = useState('')
  const [menuChat, setMenuChat] = useState<string | null>(null)

  // Cache-first: the drawer renders instantly from whatever is already in the
  // stores, and only reaches the network when that data is actually stale.
  // Re-fetching on every open made the drawer wait on a round-trip for a list
  // that had not changed.
  useEffect(() => {
    void loadChatsIfStale()
    void loadProjects()   // already guarded by its own `loaded` flag
  }, [loadChatsIfStale, loadProjects])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => chats.filter((c) => !q || (c.title ?? 'Yangi chat').toLowerCase().includes(q)),
    [chats, q]
  )
  const pinned = filtered.filter((c) => c.pinned)
  const recent = filtered.filter((c) => !c.pinned).slice(0, 14)
  const first = profile?.preferred_name ?? profile?.full_name ?? 'Foydalanuvchi'

  const go = (to: string) => { void tap(); onNavigate(to) }

  return (
    <>
      <motion.div
        className="v5-context-sheet-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: .2 }} onClick={onClose}
        // A flat scrim, not a blur: full-screen backdrop blur is one of the
        // most expensive effects on low-end Android and it washed the sidebar's
        // contrast out.
        style={{ zIndex: 59, background: 'rgba(6,18,38,.42)' }}
      />
      <motion.aside
        role="dialog" aria-modal="true" aria-label="Veltrix menyusi"
        initial={{ x: '-104%', opacity: .75 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '-104%', opacity: .7 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34, mass: .82 }}
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: .25, right: 0 }}
        onDragEnd={(_, info) => { if (info.offset.x < -72 || info.velocity.x < -600) onClose() }}
        className="v12-drawer"
        style={{
          position: 'fixed', inset: '0 auto 0 0', zIndex: 60,
          width: 'min(88vw, 344px)', display: 'flex', flexDirection: 'column',
          paddingTop: 'var(--safe-top)', overflow: 'hidden',
        }}
      >
        {/* Account first: who is signed in, and one tap to their settings. */}
        <button type="button" className="v12-drawer-account" onClick={() => go('/settings')}>
          <span className="v12-drawer-avatar" aria-hidden>
            {(first[0] ?? 'V').toUpperCase()}
          </span>
          <span className="col" style={{ minWidth: 0, gap: 1, alignItems: 'flex-start' }}>
            <span className="truncate" style={{ fontSize: 15, fontWeight: 680 }}>{first}</span>
            <span className="v12-drawer-sub">
              {profile?.grade ? `${profile.grade}-sinf` : 'Profil va sozlamalar'}
            </span>
          </span>
          <Settings size={18} style={{ marginLeft: 'auto', color: 'var(--text-3)', flexShrink: 0 }} />
        </button>

        <label className="v12-drawer-search">
          <Search size={17} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Chat, loyiha yoki manba…" aria-label="Qidirish" />
        </label>

        {/* Compact quick tools — a rail, not one large card per tool. */}
        <div className="v12-tool-rail" role="group" aria-label="Tezkor vositalar">
          {QUICK_TOOLS.map(({ to, label, Icon }) => (
            <button key={to} type="button" className="v12-tool" onClick={() => go(to)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="hide-sb" style={{ flex: 1, overflowY: 'auto', padding: '0 12px 18px' }}>
          <div style={{ display: 'grid', gap: 3, paddingBottom: 12 }}>
            {NAV.map(({ to, label, Icon }) => {
              const active = location.pathname === to || location.pathname.startsWith(`${to}/`)
              return (
                <button key={to} onClick={() => go(to)} style={{
                  minHeight: 50, width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0 12px', borderRadius: 17, border: '1px solid transparent',
                  background: active ? 'var(--brand-soft)' : 'transparent',
                  color: active ? 'var(--brand)' : 'var(--text-2)', cursor: 'pointer',
                  font: '650 15px/1 var(--font)', textAlign: 'left',
                }}>
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.9} /> {label}
                </button>
              )
            })}
          </div>

          <SidebarTitle icon={<Star size={14} />} label="Yulduzlangan" count={pinned.length} />
          {pinned.length === 0 ? <SidebarEmpty text="Yulduzlangan chat yo‘q" /> : (
            <div style={{ display: 'grid', gap: 2, paddingBottom: 14 }}>
              {pinned.map((c) => <ChatRow key={c.id} chatId={c.id} title={c.title ?? 'Yangi chat'}
                active={location.pathname === `/chat/${c.id}`} onOpen={() => go(`/chat/${c.id}`)}
                onMenu={() => setMenuChat(c.id)} />)}
            </div>
          )}

          <SidebarTitle icon={<FolderKanban size={14} />} label="Loyihalar" count={projects.length}
            action={<button className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }} onClick={() => go('/chats')}><Plus size={16} /></button>} />
          <div style={{ display: 'grid', gap: 3, paddingBottom: 14 }}>
            {projects.slice(0, 8).map((p) => (
              <button key={p.id} onClick={() => go(`/loyiha/${p.id}`)} style={{
                width: '100%', minHeight: 48, display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)',
                alignItems: 'center', gap: 9, padding: '6px 9px', border: 0, borderRadius: 16,
                background: 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
              }}>
                <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 11, background: `${p.color}22`, color: p.color }} data-emoji>{p.emoji}</span>
                <span className="col" style={{ minWidth: 0, gap: 1 }}>
                  <span className="truncate" style={{ fontSize: 14, fontWeight: 650 }}>{p.name}</span>
                  <span className="micro">{p.chat_count ?? 0} chat · {p.source_count ?? 0} manba</span>
                </span>
              </button>
            ))}
            {projects.length === 0 && <SidebarEmpty text="Hali loyiha yo‘q" />}
          </div>

          <SidebarTitle icon={<MessageSquareText size={14} />} label="So‘nggi chatlar" count={recent.length} />
          <div style={{ display: 'grid', gap: 2 }}>
            {recent.map((c) => <ChatRow key={c.id} chatId={c.id} title={c.title ?? 'Yangi chat'}
              active={location.pathname === `/chat/${c.id}`} onOpen={() => go(`/chat/${c.id}`)}
              onMenu={() => setMenuChat(c.id)} />)}
          </div>
        </div>

        <button onClick={() => go('/settings')} style={{
          display: 'grid', gridTemplateColumns: '46px minmax(0,1fr) 24px', alignItems: 'center', gap: 10,
          padding: '12px 16px calc(var(--safe-bottom) + 12px)', border: 0, borderTop: '1px solid var(--border)',
          background: 'color-mix(in srgb,var(--surface) 80%,transparent)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
        }}>
          <span className="v5-avatar" style={{ width: 44, height: 44 }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span style={{ fontWeight: 750, color: 'var(--brand)' }}>{first.slice(0,1).toUpperCase()}</span>}
          </span>
          <span className="col" style={{ minWidth: 0, gap: 2 }}>
            <strong className="truncate" style={{ fontSize: 15 }}>{first}</strong>
            <span className="micro">{profile?.grade ? `${profile.grade}-sinf` : 'Profilni sozlang'}</span>
          </span>
          <Settings size={18} style={{ color: 'var(--text-3)' }} />
        </button>
      </motion.aside>

      <AnimatePresence>
        {menuChat && (() => {
          const selected = chats.find((c) => c.id === menuChat)
          return selected ? <ChatMenu chat={selected} onClose={() => setMenuChat(null)} /> : null
        })()}
      </AnimatePresence>
    </>
  )
}

function SidebarTitle({ icon, label, count, action }: { icon: React.ReactNode; label: string; count: number; action?: React.ReactNode }) {
  return <div className="row" style={{ minHeight: 36, padding: '5px 8px', color: 'var(--text-3)', gap: 7 }}>
    {icon}<span style={{ fontSize: 11, fontWeight: 760, letterSpacing: '.045em', textTransform: 'uppercase' }}>{label}</span>
    <span className="micro">{count}</span>{action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
  </div>
}
function SidebarEmpty({ text }: { text: string }) { return <div className="micro" style={{ padding: '9px 11px 15px' }}>{text}</div> }
function ChatRow({ title, active, onOpen, onMenu }: { chatId: string; title: string; active: boolean; onOpen: () => void; onMenu: () => void }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 34px', borderRadius: 15, background: active ? 'var(--brand-soft)' : 'transparent' }}>
    <button onClick={onOpen} style={{ minHeight: 43, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '0 9px', border: 0, background: 'transparent', color: active ? 'var(--brand)' : 'var(--text-2)', textAlign: 'left', cursor: 'pointer' }}>
      <MessageSquareText size={16} /><span className="truncate" style={{ fontSize: 13, fontWeight: active ? 650 : 530 }}>{title}</span>
    </button>
    <button onClick={onMenu} className="btn btn-ghost btn-icon" style={{ width: 34, height: 34, alignSelf: 'center' }} aria-label="Chat amallari"><MoreHorizontal size={17} /></button>
  </div>
}
