import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useUIStore } from '@/store/uiStore'

interface Props {
  title?: string
  onClose: () => void
  children: React.ReactNode
  /** Desktop renders a centred panel of this width instead of a sheet. */
  desktopWidth?: number
  maxHeight?: string
}

/**
 * Shared modal primitive: bottom sheet on mobile, centred panel on desktop.
 *
 * It does NOT touch browser history itself. Instead it registers on the
 * central overlay stack, and useBackNavigation closes the topmost overlay on
 * Back. Two independent systems pushing history entries was the source of
 * the previously broken back behaviour, so there is exactly one owner now.
 */
export function BottomSheet({
  title, onClose, children, desktopWidth = 480, maxHeight = '86dvh',
}: Props) {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef(`sheet-${crypto.randomUUID()}`)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const requestClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Join the central back stack. useBackNavigation pops this first, so
    // Back closes the sheet rather than leaving the page.
    const id = markerRef.current
    const { pushOverlay, popOverlay, registerOverlayCloser } = useUIStore.getState()
    registerOverlayCloser(id, () => onCloseRef.current())
    pushOverlay(id)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return }
      if (e.key !== 'Tab') return

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables?.length) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    window.addEventListener('keydown', onKey, true)
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus(), 60)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      // Leaving the stack on unmount covers both paths: closed by Back, and
      // unmounted by a route change while still open.
      popOverlay(id)
      previous?.focus?.()
    }
  }, [requestClose])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={requestClose}
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 69 }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-veltrix-modal="true"
        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: .97, y: 8 }}
        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: .97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="glass"
        style={{
          position: 'fixed', zIndex: 70,
          display: 'grid',
          gridTemplateRows: title ? 'auto minmax(0,1fr)' : 'minmax(0,1fr)',
          overflow: 'hidden',
          ...(isMobile
            ? {
                left: 0, right: 0, bottom: 0,
                maxHeight,
                borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0',
                paddingBottom: 'var(--safe-bottom)',
              }
            : {
                top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: desktopWidth, maxHeight,
              }),
        }}
      >
        {isMobile && (
          <div aria-hidden style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            width: 38, height: 4, borderRadius: 99, background: 'var(--border-strong)',
          }} />
        )}

        {title && (
          <div className="row" style={{
            padding: `${isMobile ? 20 : 16}px var(--s-5) var(--s-3)`,
            borderBottom: '1px solid var(--border)',
          }}>
            <strong style={{ fontSize: 'var(--fs-section)' }}>{title}</strong>
            <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} onClick={requestClose} aria-label="Yopish">
              <X size={19} />
            </button>
          </div>
        )}

        <div className="hide-sb" style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: 'var(--s-5)' }}>
          {children}
        </div>
      </motion.div>
    </>
  )
}
