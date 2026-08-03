import { useCallback, useEffect, useState } from 'react'
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
import { tap } from '@/lib/native'

const OWN_HEADER = [
  '/chat', '/rejim/', '/loyiha/', '/tarjima', '/manbalar', '/skills',
  '/settings', '/testlar', '/test/', '/oyin',
]
const BOTTOM_ROUTES = ['/general', '/personal', '/manbalar']
const TITLES: Record<string, string> = {
  '/general': 'Veltrix Hom',
  '/personal': 'Personal',
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const navHidden = useUIStore((s) => s.navHidden)
  const searchOpen = useUIStore((s) => s.searchOpen)
  const setSearch = useUIStore((s) => s.setSearch)
  const loadChats = useChatStore((s) => s.load)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => { void loadChats() }, [loadChats])
  useEffect(() => { setDrawer(false) }, [location.pathname, setDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [drawerOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setSearch(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearch])

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
    <div className="v5-app-bg" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <OfflineBanner />

      {!ownHeader && (
        <header className={`v5-shell-header${scrolled ? ' glass-nav' : ''}`} style={{ paddingTop: 'var(--safe-top)', flexShrink: 0, zIndex: 50 }}>
          <div className="row" style={{ minHeight: 'var(--header-h)', paddingInline: 8, gap: 7 }}>
            <button className="v5-round-icon" onClick={() => { void tap(); setDrawer(true) }} aria-label="Menyu">
              <Menu size={23} />
            </button>

            <div className="v5-brand-title" style={{ flex: 1, justifyContent: isGeneral ? 'center' : 'flex-start', minWidth: 0 }}>
              {isGeneral && <VeltrixMark size={29} />}
              <span className="truncate">{title}</span>
            </div>

            <button className="v5-round-icon" onClick={() => setSearch(true)} aria-label="Qidirish">
              <Search size={21} />
            </button>
            <button className="v5-round-icon" onClick={newChat} aria-label="Yangi chat">
              <Plus size={23} />
            </button>
          </div>
        </header>
      )}

      <motion.main
        id="main"
        tabIndex={-1}
        key={location.pathname}
        initial={{ opacity: 0, x: 8, scale: .998 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -6 }}
        transition={{ duration: .28, ease: [0.16, 1, 0.3, 1] }}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <Outlet />
      </motion.main>

      {showNav && <BottomNav />}

      <AnimatePresence>
        {drawerOpen && <SettingsDrawer key="drawer" onClose={() => setDrawer(false)} />}
        {searchOpen && <SearchDialog key="search" onClose={() => setSearch(false)} />}
      </AnimatePresence>
    </div>
  )
}
