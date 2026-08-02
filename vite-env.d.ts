import { useEffect, useMemo } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquarePlus, Search, MessagesSquare, Sparkles, Settings2,
  PanelLeftClose, PanelLeftOpen, Pin, MoreHorizontal, Plus, Library,
} from 'lucide-react'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import type { ChatSummary } from '@/types'

interface Props {
  chats: ChatSummary[]
  loading: boolean
  onNewChat: () => void
  onChatMenu: (chat: ChatSummary, anchor: HTMLElement) => void
  onNewProject: () => void
  /** Mobile drawer renders the same tree without the collapse control. */
  variant?: 'desktop' | 'drawer'
}

export function Sidebar({ chats, loading, onNewChat, onChatMenu, onNewProject, variant = 'desktop' }: Props) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed) && variant === 'desktop'
  const toggle = useUIStore((s) => s.toggleSidebar)
  const setSearch = useUIStore((s) => s.setSearch)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const profile = useAuthStore((s) => s.profile)
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)
  const navigate = useNavigate()
  const { chatId } = useParams()

  const { pinned, groups } = useMemo(() => groupChats(chats), [chats])

  useEffect(() => { void loadProjects() }, [loadProjects])

  const close = () => variant === 'drawer' && setDrawer(false)

  return (
    <aside
      aria-label="Asosiy navigatsiya"
      style={{
        width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        background: 'var(--bg-sidebar)',
        borderRight: variant === 'desktop' ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: `width var(--t-sidebar) var(--ease)`,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* ---- Brand header ---- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 'var(--header-h)',
          padding: `0 ${collapsed ? '0' : 'var(--s-3)'}`,
          justifyContent: collapsed ? 'center' : 'space-between',
          flexShrink: 0,
        }}
      >
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <VeltrixMark size={26} />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.strong
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.16 }}
                className="truncate"
                style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, letterSpacing: '-0.01em' }}
              >
                Veltrix Hom
              </motion.strong>
            )}
          </AnimatePresence>
        </div>

        {variant === 'desktop' && !collapsed && (
          <button className="btn btn-ghost btn-icon" onClick={toggle} title="Yon panelni yopish" aria-label="Yon panelni yopish">
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {variant === 'desktop' && collapsed && (
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggle}
          title="Yon panelni ochish"
          aria-label="Yon panelni ochish"
          style={{ alignSelf: 'center', marginBottom: 6 }}
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* ---- Primary actions ---- */}
      <div style={{ padding: `0 ${collapsed ? '10px' : 'var(--s-3)'}`, display: 'grid', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => { onNewChat(); close() }}
          className="btn"
          title="Yangi chat"
          style={{
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 12px',
            width: collapsed ? 44 : '100%',
            background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)',
            color: 'var(--text)',
          }}
        >
          <MessageSquarePlus size={18} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Yangi chat</span>}
        </button>

        <SideAction icon={<Search size={18} />} label="Qidirish" collapsed={collapsed}
          onClick={() => { setSearch(true); close() }} />
        <SideLink to="/chat" icon={<MessagesSquare size={18} />} label="Chat" collapsed={collapsed} onClick={close} />
        <SideLink to="/personal" icon={<Sparkles size={18} />} label="Personal" collapsed={collapsed} onClick={close} />
        <SideLink to="/sources" icon={<Library size={18} />} label="Manbalar" collapsed={collapsed} onClick={close} />
        <SideLink to="/settings" icon={<Settings2 size={18} />} label="Sozlamalar" collapsed={collapsed} onClick={close} />
      </div>

      {/* ---- Scrollable history ---- */}
      <div
        className="hide-sb"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          marginTop: 'var(--s-4)',
          padding: `0 ${collapsed ? '10px' : 'var(--s-3)'} var(--s-4)`,
          opacity: collapsed ? 0 : 1,
          pointerEvents: collapsed ? 'none' : 'auto',
          transition: 'opacity 140ms var(--ease)',
        }}
      >
        {loading && (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 32, opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        )}

        {!loading && chats.length === 0 && (
          <p className="micro" style={{ padding: '10px 8px', lineHeight: 1.5 }}>
            Hali chat yo'q. Birinchi savolingizni yuboring — bu yerda saqlanadi.
          </p>
        )}

        <Section label="Loyihalar" action={
          <button onClick={() => { onNewProject(); close() }} aria-label="Yangi loyiha" title="Yangi loyiha"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', display: 'grid', padding: 2 }}>
            <Plus size={14} />
          </button>
        }>
          {projects.length === 0 && (
            <p className="micro" style={{ padding: '2px 8px', lineHeight: 1.5 }}>
              Loyiha yo'q. Fan bo'yicha ish maydoni yarating.
            </p>
          )}
          {projects.map((pr) => (
            <button key={pr.id} onClick={() => { navigate(`/chat?project=${pr.id}`); close() }}
              title={pr.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px', minHeight: 36, borderRadius: 'var(--r-sm)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-2)', fontSize: 'var(--fs-sm)',
                fontFamily: 'var(--font)', textAlign: 'left',
              }}>
              <span aria-hidden style={{ fontSize: 14 }}>{pr.emoji}</span>
              <span className="truncate" style={{ flex: 1 }}>{pr.name}</span>
              {pr.chat_count > 0 && <span className="micro">{pr.chat_count}</span>}
            </button>
          ))}
        </Section>

        {pinned.length > 0 && (
          <Section label="Mahkamlangan">
            {pinned.map((c) => (
              <ChatRow key={c.id} chat={c} active={c.id === chatId}
                onOpen={() => { navigate(`/chat/${c.id}`); close() }} onMenu={onChatMenu} />
            ))}
          </Section>
        )}

        {groups.map(([label, items]) =>
          items.length === 0 ? null : (
            <Section key={label} label={label}>
              {items.map((c) => (
                <ChatRow key={c.id} chat={c} active={c.id === chatId}
                  onOpen={() => { navigate(`/chat/${c.id}`); close() }} onMenu={onChatMenu} />
              ))}
            </Section>
          )
        )}
      </div>

      {/* ---- User footer ---- */}
      <button
        onClick={() => { navigate('/settings'); close() }}
        title={profile?.full_name ?? 'Hisob'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: collapsed ? '10px' : '10px var(--s-3)',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderTop: '1px solid var(--border)',
          background: 'transparent',
          border: 'none',
          borderTopWidth: 1,
          borderTopStyle: 'solid',
          borderTopColor: 'var(--border)',
          cursor: 'pointer',
          color: 'var(--text)',
          fontFamily: 'var(--font)',
          textAlign: 'left',
          flexShrink: 0,
          minHeight: 56,
        }}
      >
        <Avatar profile={profile} />
        {!collapsed && (
          <span className="col" style={{ minWidth: 0, gap: 1 }}>
            <span className="truncate" style={{ fontSize: 'var(--fs-label)', fontWeight: 560 }}>
              {profile?.full_name ?? 'Foydalanuvchi'}
            </span>
            <span className="micro truncate">
              {profile?.grade ? `${profile.grade}-sinf` : 'Sinf tanlanmagan'}
            </span>
          </span>
        )}
      </button>
    </aside>
  )
}

/* ------------------------------ parts ------------------------------ */

function Avatar({ profile }: { profile: { avatar_url: string | null; full_name: string | null } | null }) {
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt="" width={28} height={28}
        style={{ borderRadius: '50%', border: '1px solid var(--border)', flexShrink: 0 }} />
    )
  }
  return (
    <span aria-hidden style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: 'var(--brand-700)', color: '#fff',
      display: 'grid', placeItems: 'center',
      fontSize: 12, fontWeight: 600,
    }}>
      {profile?.full_name?.[0]?.toUpperCase() ?? '·'}
    </span>
  )
}

function SideLink({ to, icon, label, collapsed, onClick }: {
  to: string; icon: React.ReactNode; label: string; collapsed: boolean; onClick: () => void
}) {
  return (
    <NavLink to={to} onClick={onClick} title={label}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 40,
        padding: collapsed ? 0 : '0 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 'var(--r-sm)',
        textDecoration: 'none',
        fontSize: 'var(--fs-sm)',
        fontWeight: isActive ? 570 : 500,
        color: isActive ? 'var(--text)' : 'var(--text-2)',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        transition: 'background var(--t-hover) var(--ease), color var(--t-hover) var(--ease)',
      })}>
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

function SideAction({ icon, label, collapsed, onClick }: {
  icon: React.ReactNode; label: string; collapsed: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 40,
        padding: collapsed ? 0 : '0 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent',
        color: 'var(--text-2)', fontSize: 'var(--fs-sm)', fontWeight: 500,
        fontFamily: 'var(--font)', cursor: 'pointer', width: '100%',
      }}>
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

function Section({ label, children, action }: {
  label: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <section style={{ marginTop: 'var(--s-4)' }}>
      <h3 style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--text-3)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '0 8px 6px',
      }}>
        {label}{action}
      </h3>
      <div style={{ display: 'grid', gap: 1 }}>{children}</div>
    </section>
  )
}

function ChatRow({ chat, active, onOpen, onMenu }: {
  chat: ChatSummary
  active: boolean
  onOpen: () => void
  onMenu: (c: ChatSummary, anchor: HTMLElement) => void
}) {
  return (
    <div
      className="chat-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        borderRadius: 'var(--r-sm)',
        background: active ? 'var(--bg-active)' : 'transparent',
        transition: 'background var(--t-hover) var(--ease)',
      }}
    >
      <button
        onClick={onOpen}
        title={chat.title ?? 'Nomsiz chat'}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left',
          padding: '8px 4px 8px 8px', minHeight: 36,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: active ? 'var(--text)' : 'var(--text-2)',
          fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
          fontWeight: active ? 550 : 450,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        {chat.pinned && <Pin size={12} style={{ flexShrink: 0, color: 'var(--accent)' }} />}
        <span className="truncate">{chat.title ?? 'Nomsiz chat'}</span>
      </button>

      <button
        className="chat-menu-btn"
        onClick={(e) => onMenu(chat, e.currentTarget)}
        aria-label={`${chat.title ?? 'Chat'} menyusi`}
        title="Amallar"
        style={{
          width: 30, height: 30, flexShrink: 0, marginRight: 4,
          borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent',
          color: 'var(--text-3)', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
        }}
      >
        <MoreHorizontal size={15} />
      </button>
    </div>
  )
}

/* --------------------------- grouping ------------------------------ */

const DAY = 86_400_000

/** Bugun · Kecha · Oxirgi 7 kun · Oxirgi 30 kun · Eskiroq */
function groupChats(chats: ChatSummary[]) {
  const pinned = chats.filter((c) => c.pinned)
  const rest = chats.filter((c) => !c.pinned)

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const buckets: Record<string, ChatSummary[]> = {
    Bugun: [], Kecha: [], 'Oxirgi 7 kun': [], 'Oxirgi 30 kun': [], Eskiroq: [],
  }

  for (const c of rest) {
    const ts = new Date(c.updated_at).getTime()
    if (ts >= startOfToday) buckets['Bugun']!.push(c)
    else if (ts >= startOfToday - DAY) buckets['Kecha']!.push(c)
    else if (ts >= startOfToday - 7 * DAY) buckets['Oxirgi 7 kun']!.push(c)
    else if (ts >= startOfToday - 30 * DAY) buckets['Oxirgi 30 kun']!.push(c)
    else buckets['Eskiroq']!.push(c)
  }

  return { pinned, groups: Object.entries(buckets) }
}
