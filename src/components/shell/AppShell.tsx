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

/** Routes that render their own header and hide the shell one. */
const OWN_HEADER = ['/rejim/', '/loyiha/', '/tarjima', '/manbalar', '/skills']

const TITLES: Record<string, string> = {
  '/general': 'Veltrix Hom',
  '/chats': 'Chatlar',
  '/personal': 'Personal',
}

/**
 * The shell owns chrome only: header, drawer, bottom bar, overlays.
 * Screens own their content and their own scrolling.
 */
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

  // Lock the page behind the drawer so nothing scrolls underneath it.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
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

  // The header gains its surface only once content passes underneath it.
  useEffect(() => {
    const root = document.querySelector('[data-scroll-root]')
    if (!root) { setScrolled(false); return }
    const onScroll = () => setScrolled(root.scrollTop > 6)
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [location.pathname])

  const ownHeader = OWN_HEADER.some((p) => location.pathname.startsWith(p))
  const showNav = !navHidden && !ownHeader
  const isGeneral = location.pathname === '/general'
  const title = TITLES[location.pathname]

  const newChat = useCallback(() => { void tap(); navigate('/general') }, [navigate])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', overflow: 'hidden', background: 'var(--bg)',
    }}>
      <OfflineBanner />

      {!ownHeader && (
        <header
          className={scrolled ? 'glass-nav' : undefined}
          style={{
            position: 'sticky', top: 0, flexShrink: 0,
            zIndex: 'var(--z-header)' as unknown as number,
            paddingTop: 'var(--safe-top)',
            background: scrolled ? undefined : 'var(--bg)',
            borderRadius: 0,
            borderWidth: scrolled ? '0 0 1px' : '0',
            boxShadow: scrolled ? 'var(--shadow-sm)' : 'none',
            transition: 'box-shadow var(--t-hover) var(--ease)',
          }}
        >
          <div className="row" style={{ height: 'var(--header-h)', paddingInline: 6, gap: 4 }}>
            <button className="btn btn-ghost btn-icon" style={{ width: 42, height: 42 }}
              onClick={() => { void tap(); setDrawer(true) }} aria-label="Sozlamalar">
              <Menu size={22} />
            </button>

            <div className="row" style={{
              flex: 1, minWidth: 0, gap: 8,
              justifyContent: isGeneral ? 'center' : 'flex-start',
            }}>
              {isGeneral && <VeltrixMark size={24} />}
              <span className="truncate" style={{
                fontSize: 'var(--fs-lead)', fontWeight: 680, letterSpacing: '-0.025em',
              }}>
                {title ?? 'Veltrix Hom'}
              </span>
            </div>

            <button className="btn btn-ghost btn-icon" style={{ width: 42, height: 42 }}
              onClick={() => setSearch(true)} aria-label="Qidirish">
              <Search size={20} />
            </button>
            <button className="btn btn-ghost btn-icon" style={{ width: 42, height: 42 }}
              onClick={newChat} aria-label="Yangi chat">
              <Plus size={22} />
            </button>
          </div>
        </header>
      )}

      <motion.main
        id="main"
        tabIndex={-1}
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
