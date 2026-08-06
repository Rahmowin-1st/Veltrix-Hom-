import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Search, Plus } from 'lucide-react'
import { BottomNav } from './BottomNav'
import { SettingsDrawer } from './SettingsDrawer'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { SearchDialog } from '@/components/search/SearchDialog'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { useUIStore } from '@/store/uiStore'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useSkillStore } from '@/store/skillStore'
import { useAuthStore } from '@/store/authStore'
import { useBackNavigation } from '@/hooks/useBackNavigation'
import { useAdaptiveMotion } from '@/hooks/useAdaptiveMotion'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { tap } from '@/lib/native'

/** Routes that render their own header, so the shell header is hidden. */
const OWN_HEADER = [
  '/chat', '/rejim/', '/loyiha/', '/tarjima', '/manbalar', '/talent',
  '/skills', '/settings', '/testlar', '/test/', '/oyin', '/kalkulyator',
]
/** Only these three top-level destinations show the bottom bar. */
const BOTTOM_ROUTES = ['/general', '/personal', '/manbalar']
const TITLES: Record<string, string> = { '/general': 'Veltrix Hom', '/personal': 'Personal' }

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()

  const userId = useAuthStore((s) => s.user?.id ?? null)
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const navHidden = useUIStore((s) => s.navHidden)
  const searchOpen = useUIStore((s) => s.searchOpen)
  const setSearch = useUIStore((s) => s.setSearch)
  const exitHint = useUIStore((s) => s.exitHint)
  const resetTransientUI = useUIStore((s) => s.resetTransient)

  const resetChats = useChatStore((s) => s.reset)
  const loadChats = useChatStore((s) => s.load)
  const resetProjects = useProjectStore((s) => s.reset)
  const loadProjects = useProjectStore((s) => s.load)
  const resetTalents = useSkillStore((s) => s.reset)
  const loadTalents = useSkillStore((s) => s.load)

  const [scrolled, setScrolled] = useState(false)
  const previousUserRef = useRef<string | null>(null)

  // One place owns all back behaviour — hardware, browser, overlays, exit.
  useBackNavigation()
  // Drops animation quality on devices that cannot sustain a smooth frame rate.
  useAdaptiveMotion()
  // Publishes --keyboard-inset so the composer stays above the keyboard.
  useKeyboardInset()

  // Account data never survives an account switch in memory. On sign-out the
  // stores are cleared; on sign-in the new account's data is loaded fresh.
  useEffect(() => {
    if (previousUserRef.current !== userId) {
      resetChats(); resetProjects(); resetTalents(); resetTransientUI()
      previousUserRef.current = userId
    }
    if (userId) {
      void loadChats(userId)
      void loadProjects(true, userId)
      void loadTalents(true, userId)
    }
  }, [userId, loadChats, loadProjects, loadTalents,
      resetChats, resetProjects, resetTalents, resetTransientUI])

  // Changing route always closes any open overlay.
  useEffect(() => {
    setDrawer(false)
    setSearch(false)
  }, [location.pathname, location.search, setDrawer, setSearch])

  // Lock the page behind an open overlay so nothing scrolls underneath.
  useEffect(() => {
    if (!drawerOpen && !searchOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [drawerOpen, searchOpen])

  // Desktop shortcuts: Cmd/Ctrl+K opens search, Escape closes the top overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setSearch(true)
      }
      if (e.key === 'Escape') {
        if (searchOpen) setSearch(false)
        else if (drawerOpen) setDrawer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, searchOpen, setDrawer, setSearch])

  // The header gains its glass surface only once content scrolls under it.
  useEffect(() => {
    const root = document.querySelector('[data-scroll-root]')
    if (!root) { setScrolled(false); return }
    const onScroll = () => setScrolled(root.scrollTop > 8)
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [location.pathname])

  const ownHeader = OWN_HEADER.some((p) => location.pathname.startsWith(p))
  const showNav = !navHidden && BOTTOM_ROUTES.includes(location.pathname)
  const isGeneral = location.pathname === '/general'
  const title = TITLES[location.pathname] ?? 'Veltrix Hom'
  const newChat = useCallback(() => { void tap(); navigate('/general') }, [navigate])

  return (
    <div className="v5-app-bg" style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100dvh - var(--keyboard-inset, 0px))', overflow: 'hidden',
    }}>
      <OfflineBanner />

      {!ownHeader && (
        <header className={`v5-shell-header${scrolled ? ' glass-nav' : ''}`}
          style={{ paddingTop: 'var(--safe-top)', flexShrink: 0, zIndex: 50 }}>
          <div className="row" style={{ minHeight: 'var(--header-h)', paddingInline: 8, gap: 7 }}>
            <button className="v5-round-icon" onClick={() => { void tap(); setDrawer(true) }}
              aria-label="Menyu"><Menu size={23} /></button>
            <div className="v5-brand-title" style={{
              flex: 1, justifyContent: isGeneral ? 'center' : 'flex-start', minWidth: 0,
            }}>
              {isGeneral && <VeltrixMark size={29} />}
              <span className="truncate">{title}</span>
            </div>
            <button className="v5-round-icon" onClick={() => setSearch(true)}
              aria-label="Qidirish"><Search size={21} /></button>
            <button className="v5-round-icon" onClick={newChat}
              aria-label="Yangi chat"><Plus size={23} /></button>
          </div>
        </header>
      )}

      <motion.main id="main" tabIndex={-1} key={location.pathname}
        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
        transition={{ duration: .24, ease: [0.16, 1, 0.3, 1] }}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </motion.main>

      {showNav && <BottomNav />}

      <AnimatePresence>
        {drawerOpen && (
          <SettingsDrawer key="drawer" onClose={() => setDrawer(false)}
            onNavigate={(to) => { setDrawer(false); navigate(to) }} />
        )}
        {searchOpen && (
          <SearchDialog key="search" onClose={() => setSearch(false)}
            onNavigate={(to) => { setSearch(false); navigate(to) }} />
        )}
        {exitHint && (
          <motion.div className="v5-back-toast"
            initial={{ opacity: 0, y: 12, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}>
            Chiqish uchun yana bir marta bosing
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
