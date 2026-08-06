import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { BottomNav } from './BottomNav'
import { SettingsDrawer } from './SettingsDrawer'
import PrimaryTabs from './PrimaryTabs'
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
import { isNative, tap } from '@/lib/native'

const OWN_HEADER = [
  '/chat', '/rejim/', '/loyiha/', '/tarjima', '/manbalar', '/talent',
  '/skills', '/settings', '/testlar', '/test/', '/oyin', '/kalkulyator',
]
const PRIMARY_ROUTES = ['/general', '/personal', '/manbalar']
const TITLES: Record<string, string> = { '/general': 'Veltrix Hom', '/personal': 'Personal' }

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()

  const userId = useAuthStore((state) => state.user?.id ?? null)
  const drawerOpen = useUIStore((state) => state.drawerOpen)
  const setDrawer = useUIStore((state) => state.setDrawer)
  const navHidden = useUIStore((state) => state.navHidden)
  const searchOpen = useUIStore((state) => state.searchOpen)
  const setSearch = useUIStore((state) => state.setSearch)
  const exitHint = useUIStore((state) => state.exitHint)
  const resetTransientUI = useUIStore((state) => state.resetTransient)

  const resetChats = useChatStore((state) => state.reset)
  const loadChats = useChatStore((state) => state.load)
  const resetProjects = useProjectStore((state) => state.reset)
  const loadProjects = useProjectStore((state) => state.load)
  const resetTalents = useSkillStore((state) => state.reset)
  const loadTalents = useSkillStore((state) => state.load)

  const previousUserRef = useRef<string | null>(null)

  useBackNavigation()
  useAdaptiveMotion()
  useKeyboardInset()

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

  // A route owns a fresh visual context; transient overlays never leak into it.
  useEffect(() => {
    setDrawer(false)
    setSearch(false)
  }, [location.pathname, location.search, setDrawer, setSearch])

  useEffect(() => {
    if (!drawerOpen && !searchOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [drawerOpen, searchOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearch(true)
      }
      if (event.key === 'Escape') {
        if (searchOpen) setSearch(false)
        else if (drawerOpen) setDrawer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, searchOpen, setDrawer, setSearch])

  const ownHeader = OWN_HEADER.some((path) => location.pathname.startsWith(path))
  const primaryActive = PRIMARY_ROUTES.includes(location.pathname)
  const showNav = !navHidden && primaryActive
  const title = TITLES[location.pathname] ?? 'Veltrix Hom'

  return (
    <div className="v5-app-bg" style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100dvh - var(--keyboard-inset, 0px))', overflow: 'hidden',
    }}>
      <OfflineBanner />

      {!ownHeader && <AppHeader title={title} onMenu={() => { void tap(); setDrawer(true) }} />}

      <main id="main" tabIndex={-1}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Always mounted for the whole authenticated session. */}
        <section aria-hidden={!primaryActive} {...(!primaryActive ? { inert: '' } : {})}
          style={{ display: primaryActive ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <PrimaryTabs />
        </section>

        {/* Detail routes are bounded and may unmount; their server data remains cached. */}
        <section aria-hidden={primaryActive} {...(primaryActive ? { inert: '' } : {})}
          style={{ display: primaryActive ? 'none' : 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <Outlet />
        </section>
      </main>

      {showNav && <BottomNav />}

      {/* Permanently mounted so first-open and edge-drag never wait on mount. */}
      <SettingsDrawer open={drawerOpen} onClose={() => setDrawer(false)}
        onNavigate={(to) => {
          // On web the drawer/search owns a same-URL history entry. Replacing
          // that entry with the destination consumes the transient layer, so
          // Back returns to the real previous screen instead of reopening a
          // stale drawer. Native has no overlay history entry, so it pushes.
          navigate(to, { replace: !isNative })
          setDrawer(false)
          setSearch(false)
        }} />

      <AnimatePresence>
        {searchOpen && (
          <SearchDialog key="search" onClose={() => setSearch(false)}
            onNavigate={(to) => {
              navigate(to, { replace: !isNative })
              setSearch(false)
              setDrawer(false)
            }} />
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
