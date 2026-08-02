import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, Sparkles, Settings as SettingsIcon } from 'lucide-react'

const TABS = [
  { to: '/chat', label: 'Chat', Icon: MessageSquare },
  { to: '/personal', label: 'Personal', Icon: Sparkles },
  { to: '/settings', label: 'Sozlamalar', Icon: SettingsIcon },
] as const

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav
      className="glass hide-scrollbar"
      aria-label="Asosiy navigatsiya"
      style={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 'calc(8px + var(--safe-bottom))',
        height: 'var(--nav-h)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        alignItems: 'center',
        zIndex: 40,
        borderRadius: 'var(--radius-pill)',
      }}
    >
      {TABS.map(({ to, label, Icon }) => {
        const active = pathname.startsWith(to)
        return (
          <NavLink
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              height: '100%',
              textDecoration: 'none',
              color: active ? 'var(--text)' : 'var(--text-2)',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                aria-hidden
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                style={{
                  position: 'absolute',
                  inset: '6px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'color-mix(in srgb, var(--violet) 16%, transparent)',
                  boxShadow: '0 0 20px -6px var(--violet)',
                }}
              />
            )}
            <Icon
              size={20}
              strokeWidth={active ? 2.2 : 1.8}
              style={{
                position: 'relative',
                transform: active ? 'scale(1.05)' : 'none',
                transition: 'transform var(--dur-button) var(--ease-button)',
              }}
            />
            <span style={{ position: 'relative' }}>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
