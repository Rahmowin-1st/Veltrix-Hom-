import { useEffect, useRef } from 'react'
import { useUIStore } from '@/store/uiStore'

/**
 * Registers a local popover/menu in the single global overlay stack.
 * Hardware/browser Back therefore closes exactly this layer before the route.
 */
export function useOverlayRegistration(open: boolean, prefix: string, onClose: () => void): string {
  const idRef = useRef(`${prefix}-${crypto.randomUUID()}`)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const id = idRef.current
    const state = useUIStore.getState()
    state.registerOverlayCloser(id, () => closeRef.current())
    state.pushOverlay(id)
    return () => useUIStore.getState().popOverlay(id)
  }, [open])

  return idRef.current
}
