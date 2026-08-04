import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useMediaQuery'

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
 * It owns one browser-history entry, so Android/browser Back closes the sheet
 * without unexpectedly leaving the current page.
 */
export function BottomSheet({
  title, onClose, children, desktopWidth = 480, maxHeight = '86dvh',
}: Props) {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef(`sheet-${crypto.randomUUID()}`)
  const closedByPopRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const requestClose = useCallback(() => {
    const state = window.history.state as Record<string, unknown> | null
    if (state?.__veltrixModal === markerRef.current) {
      window.history.back()
      return
    }
    onCloseRef.current()
  }, [])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const state = (window.history.state && typeof window.history.state === 'object')
      ? { ...window.history.state }
      : {}
    window.history.pushState({ ...state, __veltrixModal: markerRef.current }, '', window.location.href)

    const onPop = () => {
      closedByPopRef.current = true
      onCloseRef.current()
    }
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

    window.addEventListener('popstate', onPop, { once: true })
    window.addEventListener('keydown', onKey, true)
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus(), 60)

    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow

      // Route navigation can unmount the sheet without a Back event. Remove
      // only our marker so it cannot consume a later unrelated Back press.
      const now = window.history.state as Record<string, unknown> | null
      if (!closedByPopRef.current && now?.__veltrixModal === markerRef.current) {
        const next = { ...now }
        delete next.__veltrixModal
        window.history.replaceState(next, '', window.location.href)
      }
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
