import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PanelLeftOpen, Pencil, Pin, PinOff, FolderInput, FolderMinus, Trash2, Check,
} from 'lucide-react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { MobileHeader } from './MobileHeader'
import { SearchDialog } from '@/components/search/SearchDialog'
import { ProjectDialog } from '@/components/project/ProjectDialog'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { sourceApi } from '@/lib/api'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useUIStore } from '@/store/uiStore'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import type { ChatSummary, Subject } from '@/types'

/** Page titles for the compact mobile header. */
const TITLES: Record<string, string> = {
  '/personal': 'Personal',
  '/tarjima': 'Tarjima',
  '/manbalar': 'Manbalar',
  '/skills': 'Skills',
  '/settings': 'Sozlamalar',
}

/**
 * The shell owns layout only. Screens own their own content and scrolling.
 *
 * Desktop → persistent sidebar + main column, no bottom nav.
 * Mobile  → overlay drawer + floating bottom nav, never both at once.
 */
export function AppShell() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()

  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const navHidden = useUIStore((s) => s.navHidden)
  const searchOpen = useUIStore((s) => s.searchOpen)
  const setSearch = useUIStore((s) => s.setSearch)

  const chats = useChatStore((s) => s.chats)
  const chatsLoading = useChatStore((s) => s.loading)
  const loadChats = useChatStore((s) => s.load)

  const [menuFor, setMenuFor] = useState<{ chat: ChatSummary; x: number; y: number } | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])

  useEffect(() => { sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {}) }, [])
  useEffect(() => { void loadChats() }, [loadChats])

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

  // A drawer that survives navigation feels broken on touch.
  useEffect(() => { setDrawer(false) }, [location.pathname, setDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
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

  const isChat = location.pathname.startsWith('/chat')
  const isSettingsRoot = location.pathname === '/settings'
  const headerTitle = TITLES[location.pathname]
  const showNav = isMobile && !navHidden && !drawerOpen

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
      <OfflineBanner />
      {!isMobile && <Sidebar {...sidebarProps} variant="desktop" />}

      {/* ---------------- mobile drawer ---------------- */}
      <AnimatePresence>
        {isMobile && drawerOpen && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawer(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 59, background: 'var(--scrim)' }}
            />
            <motion.div
              key="drawer"
              role="dialog" aria-modal="true" aria-label="Navigatsiya"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.35, right: 0 }}
              onDragEnd={(_, info) => { if (info.offset.x < -70) setDrawer(false) }}
              style={{
                position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 60,
                paddingTop: 'var(--safe-top)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <Sidebar {...sidebarProps} variant="drawer" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---------------- main column ---------------- */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {isMobile && !isSettingsRoot && (
          <MobileHeader
            title={headerTitle}
            showMark={isChat}
            onMenu={() => setDrawer(true)}
            onSearch={isChat ? () => setSearch(true) : undefined}
            onNewChat={isChat ? newChat : undefined}
          />
        )}

        {!isMobile && collapsed && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleSidebar}
            aria-label="Yon panelni ochish"
            style={{ position: 'absolute', top: 8, left: 8, zIndex: 21 }}
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        <motion.main
          id="main"
          tabIndex={-1}
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          <Outlet />
        </motion.main>

        {showNav && <BottomNav />}
      </div>

      <AnimatePresence>
        {searchOpen && <SearchDialog key="search" onClose={() => setSearch(false)} />}
        {projectOpen && (
          <ProjectDialog key="project" subjects={subjects} onClose={() => setProjectOpen(false)} />
        )}
        {menuFor && (
          <ChatMenu
            key="chatmenu"
            chat={menuFor.chat}
            x={menuFor.x}
            y={menuFor.y}
            mobile={isMobile}
            onClose={() => setMenuFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ==================== chat context menu ============================ */

type MenuView = 'root' | 'rename' | 'project' | 'confirm'

/**
 * Bottom sheet on mobile, anchored popover on desktop — in both cases it
 * opens next to the chat it belongs to, never in a detached corner.
 */
function ChatMenu({ chat, x, y, mobile, onClose }: {
  chat: ChatSummary; x: number; y: number; mobile: boolean; onClose: () => void
}) {
  const rename = useChatStore((s) => s.rename)
  const togglePin = useChatStore((s) => s.togglePin)
  const moveToProject = useChatStore((s) => s.moveToProject)
  const remove = useChatStore((s) => s.remove)
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)

  const [view, setView] = useState<MenuView>('root')
  const [name, setName] = useState(chat.title ?? '')

  useEffect(() => { void loadProjects() }, [loadProjects])

  useEffect(() => {
    if (mobile) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobile, onClose])

  const body = (
    <div style={{ display: 'grid', gap: mobile ? 2 : 1 }}>
      {view === 'root' && (
        <>
          <Item icon={<Pencil size={17} />} label="Nomini o'zgartirish"
            onClick={() => setView('rename')} mobile={mobile} />
          <Item
            icon={chat.pinned ? <PinOff size={17} /> : <Pin size={17} />}
            label={chat.pinned ? 'Mahkamdan olish' : 'Mahkamlash'}
            onClick={() => { void togglePin(chat.id); onClose() }}
            mobile={mobile}
          />
          {chat.project_id ? (
            <Item icon={<FolderMinus size={17} />} label="Loyihadan chiqarish"
              onClick={() => { void moveToProject(chat.id, null); onClose() }} mobile={mobile} />
          ) : (
            <Item icon={<FolderInput size={17} />} label="Loyihaga ko'chirish"
              onClick={() => setView('project')} mobile={mobile} />
          )}
          <Item icon={<Trash2 size={17} />} label="O'chirish" danger
            onClick={() => setView('confirm')} mobile={mobile} />
        </>
      )}

      {view === 'rename' && (
        <div style={{ display: 'grid', gap: 'var(--s-3)', padding: mobile ? 0 : 8 }}>
          <input className="input" autoFocus value={name} maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) { void rename(chat.id, name.trim()); onClose() }
            }} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, height: 38 }}
              onClick={() => setView('root')}>Orqaga</button>
            <button className="btn btn-primary" style={{ flex: 1, height: 38 }}
              disabled={!name.trim()}
              onClick={() => { void rename(chat.id, name.trim()); onClose() }}>Saqlash</button>
          </div>
        </div>
      )}

      {view === 'project' && (
        <>
          {projects.length === 0 && (
            <p className="micro" style={{ padding: 14, textAlign: 'center', lineHeight: 1.6 }}>
              Loyiha yo'q. Yon paneldagi Loyihalar bo'limidan yarating.
            </p>
          )}
          {projects.map((p) => (
            <Item
              key={p.id}
              icon={<span aria-hidden style={{ fontSize: 16 }}>{p.emoji}</span>}
              label={p.name}
              onClick={() => { void moveToProject(chat.id, p.id); onClose() }}
              mobile={mobile}
              trailing={chat.project_id === p.id ? <Check size={15} /> : undefined}
            />
          ))}
          <Item icon={<span aria-hidden />} label="Orqaga"
            onClick={() => setView('root')} mobile={mobile} />
        </>
      )}

      {view === 'confirm' && (
        <div style={{ display: 'grid', gap: 'var(--s-3)', padding: mobile ? 0 : 10 }}>
          <p style={{ fontSize: 'var(--fs-label)', lineHeight: 1.55 }}>
            Bu chat va uning barcha xabarlari o'chiriladi. Buni qaytarib bo'lmaydi.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, height: 38 }}
              onClick={() => setView('root')}>Bekor</button>
            <button className="btn btn-danger" style={{ flex: 1, height: 38 }}
              onClick={() => { void remove(chat.id); onClose() }}>O'chirish</button>
          </div>
        </div>
      )}
    </div>
  )

  if (mobile) {
    return (
      <BottomSheet
        title={view === 'confirm' ? "O'chirilsinmi?" : (chat.title ?? 'Chat')}
        onClose={onClose}
        desktopWidth={360}
      >
        {body}
      </BottomSheet>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 69 }} />
      <motion.div
        role="menu"
        initial={{ opacity: 0, scale: .96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .96 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="glass"
        style={{
          position: 'fixed',
          left: Math.min(x, window.innerWidth - 244),
          top: Math.min(y, window.innerHeight - 240),
          width: 234, padding: 5,
          borderRadius: 'var(--r-md)',
          zIndex: 70,
        }}
      >
        {body}
      </motion.div>
    </>
  )
}

function Item({ icon, label, onClick, danger, mobile, trailing }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  mobile: boolean
  trailing?: React.ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: mobile ? '12px 10px' : '9px 11px',
        minHeight: mobile ? 50 : 40,
        borderRadius: 'var(--r-md)',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        color: danger ? 'var(--danger)' : 'var(--text)',
        fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
      }}
    >
      {icon}
      <span className="truncate" style={{ flex: 1 }}>{label}</span>
      {trailing}
    </button>
  )
}
