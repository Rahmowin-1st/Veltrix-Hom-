import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, ArrowLeft, Plus, MoreHorizontal, Search } from 'lucide-react'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'

interface Props {
  title?: string
  /** Back replaces the menu button on contextual pages. */
  back?: boolean
  onMenu?: () => void
  onNewChat?: () => void
  onSearch?: () => void
  onOverflow?: (anchor: HTMLElement) => void
  showMark?: boolean
}

/**
 * Compact, safe-area aware. Gains a translucent surface and a soft shadow
 * once the page scrolls — never a thick border, never a full-screen blur.
 */
export function MobileHeader({
  title, back, onMenu, onNewChat, onSearch, onOverflow, showMark,
}: Props) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4 ||
      (document.querySelector('[data-scroll-root]')?.scrollTop ?? 0) > 4)
    const root = document.querySelector('[data-scroll-root]')
    root?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root?.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-header)' as unknown as number,
        paddingTop: 'var(--safe-top)',
        background: scrolled ? 'var(--surface-glass)' : 'var(--bg)',
        backdropFilter: scrolled ? 'blur(18px) saturate(1.4)' : undefined,
        boxShadow: scrolled ? '0 1px 12px rgba(9,23,45,.07)' : 'none',
        transition: 'background var(--t-hover) var(--ease), box-shadow var(--t-hover) var(--ease)',
      }}
    >
      <div style={{
        height: 'var(--header-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingInline: 6,
      }}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => (back ? navigate(-1) : onMenu?.())}
          aria-label={back ? 'Orqaga' : 'Menyu'}
        >
          {back ? <ArrowLeft size={21} /> : <Menu size={21} />}
        </button>

        <div style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
          gap: 7, justifyContent: showMark ? 'center' : 'flex-start',
        }}>
          {showMark && <VeltrixMark size={22} />}
          <span className="truncate" style={{
            fontSize: 'var(--fs-lead)', fontWeight: 640, letterSpacing: '-0.02em',
          }}>
            {title ?? 'Veltrix Hom'}
          </span>
        </div>

        {onSearch && (
          <button className="btn btn-ghost btn-icon" onClick={onSearch} aria-label="Qidirish">
            <Search size={20} />
          </button>
        )}
        {onNewChat && (
          <button className="btn btn-ghost btn-icon" onClick={onNewChat} aria-label="Yangi chat">
            <Plus size={21} />
          </button>
        )}
        {onOverflow && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={(e) => onOverflow(e.currentTarget)}
            aria-label="Boshqa amallar"
          >
            <MoreHorizontal size={20} />
          </button>
        )}
      </div>
    </header>
  )
}
