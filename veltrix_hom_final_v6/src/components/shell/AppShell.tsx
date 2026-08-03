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
import { exitNativeApp, isNative, registerBackButton, tap } from '@/lib/native'

const OWN_HEADER = ['/chat', '/rejim/', '/loyiha/', '/tarjima', '/manbalar', '/talent', '/skills', '/settings', '/testlar', '/test/', '/oyin', '/kalkulyator']
const BOTTOM_ROUTES = ['/general', '/personal', '/manbalar']
const TITLES: Record<string, string> = { '/general': 'Veltrix Hom', '/personal': 'Personal' }
type OverlayName = 'drawer' | 'search'

type VeltrixHistoryState = Record<string, unknown> & {
  __veltrixOverlay?: OverlayName
  __veltrixRootBase?: boolean
  __veltrixRootGuard?: boolean
}

function currentHistoryState(): VeltrixHistoryState {
  return (window.history.state && typeof window.history.state === 'object')
    ? { ...window.history.state }
    : {}
}

function replaceHistoryState(patch: Partial<VeltrixHistoryState>, remove: Array<keyof VeltrixHistoryState> = []) {
  const next = currentHistoryState()
  for (const key of remove) delete next[key]
  Object.assign(next, patch)
  window.history.replaceState(next, '', window.location.href)
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const navHidden = useUIStore((s) => s.navHidden)
  const searchOpen = useUIStore((s) => s.searchOpen)
  const setSearch = useUIStore((s) => s.setSearch)
  const resetTransientUI = useUIStore((s) => s.resetTransient)
  const resetChats = useChatStore((s) => s.reset)
  const loadChats = useChatStore((s) => s.load)
  const resetProjects = useProjectStore((s) => s.reset)
  const loadProjects = useProjectStore((s) => s.load)
  const resetTalents = useSkillStore((s) => s.reset)
  const loadTalents = useSkillStore((s) => s.load)
  const [scrolled, setScrolled] = useState(false)
  const [backToast, setBackToast] = useState(false)
  const lastBackRef = useRef(0)
  const toastTimerRef = useRef<number | null>(null)
  const previousUserRef = useRef<string | null>(null)
  const allowNextPopRef = useRef(false)
  const stateRef = useRef({ drawerOpen: false, searchOpen: false, pathname: '/general', search: '' })

  const showExitToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setBackToast(true)
    toastTimerRef.current = window.setTimeout(() => setBackToast(false), 1700)
  }, [])

  const clearOverlayMarker = useCallback(() => {
    if (currentHistoryState().__veltrixOverlay) replaceHistoryState({}, ['__veltrixOverlay'])
  }, [])

  const closeOverlay = useCallback((name: OverlayName) => {
    if (currentHistoryState().__veltrixOverlay === name) {
      window.history.back()
      return
    }
    if (name === 'drawer') setDrawer(false)
    else setSearch(false)
  }, [setDrawer, setSearch])

  const navigateFromOverlay = useCallback((to: string) => {
    clearOverlayMarker()
    setDrawer(false)
    setSearch(false)
    navigate(to)
  }, [clearOverlayMarker, navigate, setDrawer, setSearch])

  // Account data is never allowed to survive an account switch in memory.
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
  }, [userId, loadChats, loadProjects, loadTalents, resetChats, resetProjects, resetTalents, resetTransientUI])

  // Any control may open the shared drawer/search through the store. Add a
  // same-route history entry so Android/browser Back closes the overlay first.
  useEffect(() => {
    if (drawerOpen && currentHistoryState().__veltrixOverlay !== 'drawer') {
      window.history.pushState({ ...currentHistoryState(), __veltrixOverlay: 'drawer' }, '', window.location.href)
    }
  }, [drawerOpen])
  useEffect(() => {
    if (searchOpen && currentHistoryState().__veltrixOverlay !== 'search') {
      window.history.pushState({ ...currentHistoryState(), __veltrixOverlay: 'search' }, '', window.location.href)
    }
  }, [searchOpen])

  // General gets a same-route guard entry. Returning from Personal/Manbalar
  // lands on General normally; only the next Back press starts double-back exit.
  useEffect(() => {
    if (location.pathname !== '/general' || location.search) return
    const state = currentHistoryState()
    if (state.__veltrixRootGuard || state.__veltrixRootBase || state.__veltrixOverlay) return
    replaceHistoryState({ __veltrixRootBase: true }, ['__veltrixRootGuard'])
    window.history.pushState({ ...currentHistoryState(), __veltrixRootGuard: true, __veltrixRootBase: false }, '', window.location.href)
  }, [location.pathname, location.search])

  useEffect(() => {
    // Route navigation owns the next screen; no stale overlay may remain.
    clearOverlayMarker()
    setDrawer(false)
    setSearch(false)
  }, [location.pathname, location.search, clearOverlayMarker, setDrawer, setSearch])

  useEffect(() => {
    if (!drawerOpen && !searchOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [drawerOpen, searchOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true) }
      if (e.key === 'Escape') {
        if (searchOpen) closeOverlay('search')
        else if (drawerOpen) closeOverlay('drawer')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, searchOpen, closeOverlay, setSearch])

  useEffect(() => {
    const root = document.querySelector('[data-scroll-root]')
    if (!root) { setScrolled(false); return }
    const onScroll = () => setScrolled(root.scrollTop > 8)
    onScroll(); root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [location.pathname])

  useEffect(() => {
    stateRef.current = { drawerOpen, searchOpen, pathname: location.pathname, search: location.search }
  }, [drawerOpen, searchOpen, location.pathname, location.search])

  // Browser/PWA Back follows the exact same overlay → route → exit order.
  useEffect(() => {
    const onPopState = () => {
      if (allowNextPopRef.current) { allowNextPopRef.current = false; return }
      const state = stateRef.current
      if (state.searchOpen) { setSearch(false); return }
      if (state.drawerOpen) { setDrawer(false); return }

      const next = currentHistoryState()
      const atGeneralRoot = window.location.pathname === '/general' && !window.location.search
      if (!atGeneralRoot || !next.__veltrixRootBase) return

      const now = Date.now()
      if (now - lastBackRef.current < 1800) {
        setBackToast(false)
        if (isNative) { void exitNativeApp(); return }
        allowNextPopRef.current = true
        window.history.back()
        return
      }

      lastBackRef.current = now
      showExitToast()
      window.history.pushState({ ...next, __veltrixRootBase: false, __veltrixRootGuard: true }, '', window.location.href)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setDrawer, setSearch, showExitToast])

  // One native listener for the shell lifetime; duplicate listeners are a
  // common source of double navigation on Android WebViews.
  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    void registerBackButton(() => {
      // Bottom sheets/dialogs dispatch Escape and close themselves first.
      const modal = document.querySelector<HTMLElement>('[data-veltrix-modal="true"]')
      if (modal) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return
      }

      const state = stateRef.current
      if (state.searchOpen) { closeOverlay('search'); return }
      if (state.drawerOpen) { closeOverlay('drawer'); return }

      const isGeneralRoot = state.pathname === '/general' && !state.search
      if (!isGeneralRoot) {
        const index = Number(window.history.state?.idx ?? 0)
        if (index > 0 || window.history.length > 1) navigate(-1)
        else navigate('/general', { replace: true })
        return
      }

      const now = Date.now()
      if (now - lastBackRef.current < 1800) { void exitNativeApp(); return }
      lastBackRef.current = now
      showExitToast()
    }).then((off) => { if (disposed) off(); else cleanup = off })
    return () => { disposed = true; cleanup() }
  }, [closeOverlay, navigate, showExitToast])

  useEffect(() => () => { if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current) }, [])

  const ownHeader = OWN_HEADER.some((p) => location.pathname.startsWith(p))
  const showNav = !navHidden && BOTTOM_ROUTES.includes(location.pathname)
  const isGeneral = location.pathname === '/general'
  const title = TITLES[location.pathname] ?? 'Veltrix Hom'
  const newChat = useCallback(() => { void tap(); navigate('/general') }, [navigate])

  return (
    <div className="v5-app-bg" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <OfflineBanner />
      {!ownHeader && (
        <header className={`v5-shell-header${scrolled ? ' glass-nav' : ''}`} style={{ paddingTop: 'var(--safe-top)', flexShrink: 0, zIndex: 50 }}>
          <div className="row" style={{ minHeight: 'var(--header-h)', paddingInline: 8, gap: 7 }}>
            <button className="v5-round-icon" onClick={() => { void tap(); setDrawer(true) }} aria-label="Menyu"><Menu size={23} /></button>
            <div className="v5-brand-title" style={{ flex: 1, justifyContent: isGeneral ? 'center' : 'flex-start', minWidth: 0 }}>
              {isGeneral && <VeltrixMark size={29} />}<span className="truncate">{title}</span>
            </div>
            <button className="v5-round-icon" onClick={() => setSearch(true)} aria-label="Qidirish"><Search size={21} /></button>
            <button className="v5-round-icon" onClick={newChat} aria-label="Yangi chat"><Plus size={23} /></button>
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
        {drawerOpen && <SettingsDrawer key="drawer" onClose={() => closeOverlay('drawer')} onNavigate={navigateFromOverlay} />}
        {searchOpen && <SearchDialog key="search" onClose={() => closeOverlay('search')} onNavigate={navigateFromOverlay} />}
        {backToast && <motion.div className="v5-back-toast" initial={{ opacity: 0, y: 12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>Chiqish uchun yana bir marta bosing</motion.div>}
      </AnimatePresence>
    </div>
  )
}
