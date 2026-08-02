import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, MessagesSquare, Sparkles, Settings2, PanelLeftOpen } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { SearchDialog } from '@/components/search/SearchDialog'
import { ProjectDialog } from '@/components/project/ProjectDialog'
import { sourceApi } from '@/lib/api'
import type { Subject } from '@/types'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useUIStore } from '@/store/uiStore'
import { useChatStore } from '@/store/chatStore'
import type { ChatSummary } from '@/types'

/**
 * The shell owns layout only. Screens own their own content and scrolling.
 *
 * Desktop  → persistent sidebar + main column, no bottom nav.
 * Mobile   → drawer sidebar + floating bottom nav, never both at once.
 */
export function AppShell() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()

  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)

  const chats = useChatStore((s) => s.chats)
  const chatsLoading = useChatStore((s) => s.loading)
  const loadChats = useChatStore((s) => s.load)

  const [menuFor, setMenuFor] = useState<{ chat: ChatSummary; x: number; y: number } | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const searchOpen = useUIStore((s) => s.searchOpen)
  const setSearch = useUIStore((s) => s.setSearch)

  useEffect(() => { sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {}) }, [])

  // Cmd/Ctrl+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setSearch(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearch])

  useEffect(() => { void loadChats() }, [loadChats])

  // Close the drawer whenever the route changes — a drawer that survives
  // navigation feels broken on touch.
  useEffect(() => { setDrawer(false) }, [location.pathname, setDrawer])

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, setDrawer])

  const newChat = useCallback(() => navigate('/chat'), [navigate])

  const openMenu = useCallback((chat: ChatSummary, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect()
    setMenuFor({ chat, x: r.left, y: r.bottom + 6 })
  }, [])

  const sidebarProps = {
    chats,
    loading: chatsLoading,
    onNewChat: newChat,
    onChatMenu: openMenu,
    onNewProject: () => setProjectOpen(true),
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* ---------- Desktop sidebar ---------- */}
      {!isMobile && <Sidebar {...sidebarProps} variant="desktop" />}

      {/* ---------- Mobile drawer ---------- */}
      <AnimatePresence>
        {isMobile && drawerOpen && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setDrawer(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 49,
                background: 'rgba(1, 12, 38, 0.55)',
                backdropFilter: 'blur(2px)',
              }}
            />
            <motion.div
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigatsiya"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => { if (info.offset.x < -70) setDrawer(false) }}
              style={{
                position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
                paddingTop: 'var(--safe-top)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <Sidebar {...sidebarProps} variant="drawer" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---------- Main column ---------- */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Compact mobile header. Desktop screens render their own headers. */}
        {isMobile && (
          <header
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              height: 'var(--header-h)', paddingTop: 'var(--safe-top)',
              paddingInline: 'var(--s-3)', flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
              zIndex: 'var(--z-sticky)' as unknown as number,
            }}
          >
            <button className="btn btn-ghost btn-icon" onClick={() => setDrawer(true)}
              aria-label="Menyuni ochish" title="Menyu">
              <Menu size={20} />
            </button>
            <VeltrixMark size={22} />
            <strong style={{ fontSize: 'var(--fs-sm)', fontWeight: 620 }}>Veltrix Hom</strong>
          </header>
        )}

        {/* Desktop: floating re-open control when the sidebar is collapsed */}
        {!isMobile && collapsed && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={useUIStore.getState().toggleSidebar}
            aria-label="Yon panelni ochish"
            style={{ position: 'absolute', top: 10, left: 10, zIndex: 21 }}
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.21, ease: [0.16, 1, 0.3, 1] }}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          <Outlet />
        </motion.main>

        {isMobile && <MobileBottomNav />}
      </div>

      <AnimatePresence>
        {searchOpen && <SearchDialog key="search" onClose={() => setSearch(false)} />}
        {projectOpen && (
          <ProjectDialog key="project" subjects={subjects} onClose={() => setProjectOpen(false)} />
        )}
      </AnimatePresence>

      {menuFor && (
        <ChatContextMenu
          chat={menuFor.chat}
          x={menuFor.x}
          y={menuFor.y}
          onClose={() => setMenuFor(null)}
        />
      )}
    </div>
  )
}

/* ------------------------ Mobile bottom nav ------------------------- */

const TABS = [
  { to: '/chat', label: 'Chat', Icon: MessagesSquare },
  { to: '/personal', label: 'Personal', Icon: Sparkles },
  { to: '/settings', label: 'Sozlamalar', Icon: Settings2 },
] as const

function MobileBottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      className="glass"
      aria-label="Bo'limlar"
      style={{
        position: 'fixed',
        left: 10, right: 10,
        bottom: 'calc(10px + var(--safe-bottom))',
        height: 'var(--nav-h)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        borderRadius: 'var(--r-xl)',
        zIndex: 'var(--z-nav)' as unknown as number,
      }}
    >
      {TABS.map(({ to, label, Icon }) => {
        const active = pathname.startsWith(to)
        return (
          <button
            key={to}
            onClick={() => navigate(to)}
            aria-current={active ? 'page' : undefined}
            style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: active ? 'var(--text)' : 'var(--text-3)',
              fontSize: 'var(--fs-micro)', fontWeight: active ? 570 : 480,
              fontFamily: 'var(--font)',
              minHeight: 44,
            }}
          >
            {active && (
              <motion.span
                layoutId="tab-indicator"
                aria-hidden
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                style={{
                  position: 'absolute', top: 6, width: 34, height: 3,
                  borderRadius: 99, background: 'var(--accent)',
                }}
              />
            )}
            <Icon size={19} strokeWidth={active ? 2.2 : 1.75} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/* ---------------------- Chat context menu --------------------------- */

function ChatContextMenu({ chat, x, y, onClose }: {
  chat: ChatSummary; x: number; y: number; onClose: () => void
}) {
  const rename = useChatStore((s) => s.rename)
  const togglePin = useChatStore((s) => s.togglePin)
  const remove = useChatStore((s) => s.remove)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const item: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '9px 12px', minHeight: 40,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--text)', fontSize: 'var(--fs-sm)',
    fontFamily: 'var(--font)', textAlign: 'left',
    borderRadius: 'var(--r-xs)',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 69 }} />
      <motion.div
        role="menu"
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="glass"
        style={{
          position: 'fixed',
          left: Math.min(x, window.innerWidth - 216),
          top: Math.min(y, window.innerHeight - 190),
          width: 206, padding: 5,
          borderRadius: 'var(--r-md)',
          zIndex: 'var(--z-modal)' as unknown as number,
        }}
      >
        {!confirming ? (
          <>
            <button style={item} role="menuitem" onClick={() => {
              const next = window.prompt('Yangi nom:', chat.title ?? '')
              if (next?.trim()) void rename(chat.id, next.trim())
              onClose()
            }}>
              Nomini o'zgartirish
            </button>
            <button style={item} role="menuitem" onClick={() => { togglePin(chat.id); onClose() }}>
              {chat.pinned ? 'Mahkamdan olish' : 'Mahkamlash'}
            </button>
            <button style={{ ...item, color: 'var(--danger)' }} role="menuitem"
              onClick={() => setConfirming(true)}>
              O'chirish
            </button>
          </>
        ) : (
          <div style={{ padding: 10, display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 'var(--fs-label)', lineHeight: 1.5 }}>
              Bu chat butunlay o'chiriladi. Davom etamizmi?
            </p>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-outline" style={{ flex: 1, height: 34 }} onClick={onClose}>
                Bekor
              </button>
              <button
                className="btn"
                style={{ flex: 1, height: 34, background: 'var(--danger)', color: '#fff' }}
                onClick={() => { void remove(chat.id); onClose() }}
              >
                O'chirish
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
