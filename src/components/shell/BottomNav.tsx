import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessagesSquare, Sparkles, User } from 'lucide-react'
import { tap } from '@/lib/native'

/**
 * Three destinations, matching how the product is actually used:
 * history, the place you ask, and your own workspace.
 *
 * Nothing here is repeated in the settings drawer, and nothing in the
 * drawer appears here — each surface owns its own concerns.
 */
const ITEMS = [
  { to: '/chats',    label: 'Chats',    Icon: MessagesSquare },
  { to: '/general',  label: 'General',  Icon: Sparkles },
  { to: '/personal', label: 'Personal', Icon: User },
] as const

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className="glass-nav"
      style={{
        position: 'fixed',
        left: 12, right: 12,
        bottom: 'calc(var(--safe-bottom) + 10px)',
        height: 'var(--nav-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 5,
        borderRadius: 'var(--r-xl)',
        zIndex: 'var(--z-nav)' as unknown as number,
      }}
    >
      {ITEMS.map(({ to, label, Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`)
        return (
          <NavLink
            key={to}
            to={to}
            onClick={() => void tap()}
            aria-current={active ? 'page' : undefined}
            style={{
              position: 'relative',
              flex: 1,
              display: 'grid',
              justifyItems: 'center',
              alignContent: 'center',
              gap: 3,
              minHeight: 50,
              borderRadius: 'var(--r-md)',
              textDecoration: 'none',
              color: active ? 'var(--brand)' : 'var(--text-3)',
              transition: 'color var(--t-hover) var(--ease)',
            }}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: 'var(--r-md)',
                  background: 'var(--brand-soft)',
                }}
              />
            )}
            <motion.span
              animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
              transition={{ type: 'spring', stiffness: 460, damping: 26 }}
              style={{ display: 'grid', placeItems: 'center', zIndex: 1 }}
            >
              <Icon size={21} strokeWidth={active ? 2.5 : 1.95} />
            </motion.span>
            <span style={{
              zIndex: 1,
              fontSize: 'var(--fs-micro)',
              fontWeight: active ? 660 : 520,
              letterSpacing: '-0.01em',
            }}>
              {label}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
