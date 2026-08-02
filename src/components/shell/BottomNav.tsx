import { NavLink, useLocation } from 'react-router-dom'
import { MessageSquare, Sparkles, Languages, Library, Settings2 } from 'lucide-react'
import { tap } from '@/lib/native'

/**
 * Mobile primary navigation. Five destinations, each a real screen.
 * Hidden on Settings subpages and behind overlays so it never floats
 * on top of unrelated content.
 */
const ITEMS = [
  { to: '/chat',     label: 'Chat',      Icon: MessageSquare },
  { to: '/personal', label: 'Personal',  Icon: Sparkles },
  { to: '/tarjima',  label: 'Tarjima',   Icon: Languages },
  { to: '/manbalar', label: 'Manbalar',  Icon: Library },
  { to: '/settings', label: 'Sozlamalar', Icon: Settings2 },
] as const

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className="glass"
      style={{
        position: 'fixed',
        left: var8(), right: var8(),
        bottom: `calc(var(--safe-bottom) + 8px)`,
        height: 'var(--nav-h)',
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'var(--r-xl)',
        zIndex: 'var(--z-nav)' as unknown as number,
        padding: 4,
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
              flex: 1,
              display: 'grid',
              justifyItems: 'center',
              gap: 2,
              padding: '6px 2px',
              minHeight: 46,
              borderRadius: 'var(--r-md)',
              textDecoration: 'none',
              color: active ? 'var(--brand)' : 'var(--text-3)',
              background: active ? 'var(--brand-soft)' : 'transparent',
              transition: 'background var(--t-hover) var(--ease), color var(--t-hover) var(--ease)',
            }}
          >
            <Icon size={19} strokeWidth={active ? 2.3 : 1.9} />
            <span style={{
              fontSize: 'var(--fs-micro)',
              fontWeight: active ? 600 : 500,
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

/** Keeps the nav inset consistent with the composer's horizontal padding. */
function var8() { return '8px' }
