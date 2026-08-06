import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LibraryBig, Sparkles, UserRound } from 'lucide-react'
import { tap } from '@/lib/native'

const ITEMS = [
  { to: '/manbalar', label: 'Manbalar', Icon: LibraryBig },
  { to: '/general', label: 'General', Icon: Sparkles },
  { to: '/personal', label: 'Personal', Icon: UserRound },
] as const

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="v5-bottom-nav" aria-label="Asosiy navigatsiya">
      {ITEMS.map(({ to, label, Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`)
        return (
          <NavLink
            key={to}
            to={to}
            // Peer tabs REPLACE rather than push. Pushing would grow one
            // history entry per tap, so Back would walk the user through
            // every tab they had visited instead of leaving the app.
            replace
            className="v5-bottom-link"
            data-active={active}
            aria-current={active ? 'page' : undefined}
            onClick={() => void tap()}
          >
            {active && (
              <motion.span
                className="v5-bottom-pill"
                layoutId="v5-bottom-nav-pill"
                transition={{ type: 'spring', stiffness: 340, damping: 29, mass: .7 }}
              />
            )}
            <motion.span
              animate={{ scale: active ? 1.12 : .96, y: active ? -2 : 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 25 }}
              style={{ display: 'grid', placeItems: 'center' }}
            >
              <Icon size={23} strokeWidth={active ? 2.55 : 1.9} />
            </motion.span>
            <motion.span
              className="v5-bottom-label"
              animate={{ opacity: active ? 1 : .72, y: active ? -1 : 0 }}
            >
              {label}
            </motion.span>
          </NavLink>
        )
      })}
    </nav>
  )
}
