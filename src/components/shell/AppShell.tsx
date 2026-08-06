import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

import { BottomNav } from './BottomNav'
import { SettingsDrawer } from './SettingsDrawer'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { SearchDialog } from '@/components/search/SearchDialog'
import { AppHeader } from './AppHeader'
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
  const ownHeader = OWN_HEADER.some((p) => location.pathname.startsWith(p))
  const showNav = !navHidden && BOTTOM_ROUTES.includes(location.pathname)
  const title = TITLES[location.pathname] ?? 'Veltrix Hom'

  return (
    <div className="v5-app-bg" style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100dvh - var(--keyboard-inset, 0px))', overflow: 'hidden',
    }}>
      <OfflineBanner />

      {!ownHeader && <AppHeader title={title} onMenu={() => { void tap(); setDrawer(true) }} />}

      {/*
        No `key={location.pathname}` here. That key remounted the entire page
        on every navigation, destroying scroll position, drafts and loaded
        data — the "page refresh" feeling the app is meant to avoid. Primary
        tabs are kept alive by TabWorkspace; everything else mounts normally.
      */}
      <main id="main" tabIndex={-1}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>

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
