import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUIStore } from '@/store/uiStore'
import { isNative, onHardwareBack, exitApp } from '@/lib/native'

/**
 * One back-navigation policy, two platform adapters.
 *
 * The V9 implementation kept a sentinel entry and called `navigate(-1)` from
 * `popstate`. That is wrong on the web: `popstate` fires *after* the browser
 * has already moved, so calling `navigate(-1)` moves a second time — a double
 * navigation the user never asked for, and a history stack that grows corrupt
 * as overlays are opened and closed.
 *
 * The model here instead:
 *
 *   Browser / PWA — the history stack is the source of truth. Opening an
 *   overlay pushes an entry tagged with that overlay's id. `popstate` never
 *   navigates; it only *reconciles* the overlay stack to whatever entry the
 *   browser landed on. Back therefore closes exactly one overlay, and Forward
 *   restores it, for free. Explicit Close calls `history.back()` when the
 *   overlay owns the current entry, so it removes its own entry rather than
 *   stranding it.
 *
 *   Capacitor Android — there is no `popstate` for the hardware button, so it
 *   is handled explicitly in priority order: top overlay → previous route →
 *   at the root, "press again to exit", then `App.exitApp()`.
 *
 * A normal browser tab cannot be force-closed by script, and we do not pretend
 * otherwise: on the web the root simply lets the browser handle Back.
 */

const ROOT_PATHS = new Set(['/general'])
/** Peer tabs of General; Back from these means "go home", not "unwind". */
const PEER_TABS = new Set(['/manbalar', '/personal'])
const EXIT_WINDOW_MS = 2000

interface OverlayHistoryState {
  veltrixOverlays?: string[]
}

function currentOverlayEntry(): string[] {
  const state = window.history.state as OverlayHistoryState | null
  return Array.isArray(state?.veltrixOverlays) ? state.veltrixOverlays : []
}

export function useBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const overlays = useUIStore((s) => s.overlays)
  const closeTopOverlay = useUIStore((s) => s.closeTopOverlay)
  const syncOverlays = useUIStore((s) => s.syncOverlays)
  const hasOverlay = useUIStore((s) => s.hasOpenOverlay)
  const setExitHint = useUIStore((s) => s.setExitHint)

  const exitArmedAt = useRef(0)
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname

  // Guards the push effect from reacting to its own history writes, and from
  // re-pushing while we are reconciling after a popstate.
  const reconcilingRef = useRef(false)
  const overlaysRef = useRef<string[]>(overlays)
  overlaysRef.current = overlays

  /* ---------------- Browser / PWA: overlays live in history ---------------- */
  useEffect(() => {
    if (isNative) return
    if (reconcilingRef.current) return

    const inHistory = currentOverlayEntry()
    const inStore = overlays

    // Store grew (an overlay opened) → give it its own history entry so Back
    // closes it and Forward brings it back.
    if (inStore.length > inHistory.length) {
      window.history.pushState({ veltrixOverlays: [...inStore] } as OverlayHistoryState, '')
      return
    }

    // Store shrank because of an explicit Close (not a Back press). Walk the
    // browser back so the entry this overlay owned is consumed rather than
    // left behind as a dead forward entry.
    if (inStore.length < inHistory.length) {
      reconcilingRef.current = true
      window.history.back()
      window.setTimeout(() => { reconcilingRef.current = false }, 0)
    }
  }, [overlays])

  useEffect(() => {
    if (isNative) return
    const onPopState = () => {
      // Never navigate here. The browser has already moved; our only job is to
      // make the overlay stack match the entry we landed on. Back closes one
      // overlay, Forward reopens it, and a route change clears them.
      reconcilingRef.current = true
      syncOverlays(currentOverlayEntry())
      window.setTimeout(() => { reconcilingRef.current = false }, 0)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [syncOverlays])

  /* ---------------- Capacitor Android hardware button ---------------- */

  /** True when the app consumed the press; false to let the platform exit. */
  const handleNativeBack = useCallback((): boolean => {
    // 0) Keyboard first. If the user is typing, Back means "put the keyboard
    //    away" — closing the screen underneath would throw away their draft
    //    and is never what they intended.
    const focused = document.activeElement as HTMLElement | null
    const typing = focused instanceof HTMLTextAreaElement ||
      focused instanceof HTMLInputElement ||
      focused?.isContentEditable === true
    const keyboardOpen = (
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset') || '0',
      ) || 0
    ) > 60
    if (typing && keyboardOpen) {
      focused?.blur()
      return true
    }

    // 1) Overlays next.
    if (hasOverlay()) {
      closeTopOverlay()
      return true
    }

    // 2) A peer tab returns to General rather than unwinding history. Tabs
    //    are switched with replace semantics, so there is no meaningful
    //    "previous" entry to go back to — and General is the home users expect.
    if (PEER_TABS.has(locationRef.current)) {
      navigate('/general', { replace: true })
      return true
    }

    // 3) Any other screen → previous screen.
    if (!ROOT_PATHS.has(locationRef.current)) {
      navigate(-1)
      return true
    }

    // 4) Root → arm, then confirm, an exit.
    const now = Date.now()
    if (now - exitArmedAt.current < EXIT_WINDOW_MS) {
      setExitHint(false)
      return false
    }
    exitArmedAt.current = now
    setExitHint(true)
    window.setTimeout(() => {
      if (Date.now() - exitArmedAt.current >= EXIT_WINDOW_MS - 50) setExitHint(false)
    }, EXIT_WINDOW_MS)
    return true
  }, [navigate, hasOverlay, closeTopOverlay, setExitHint])

  useEffect(() => {
    if (!isNative) return
    // Exactly one listener, cleaned up on unmount — a duplicate registration
    // would consume a single press twice.
    return onHardwareBack(() => {
      if (!handleNativeBack()) void exitApp()
    })
  }, [handleNativeBack])

  // Leaving a route abandons any overlay that belonged to it, so the store and
  // the history entry cannot drift apart.
  useEffect(() => {
    if (isNative) return
    if (overlaysRef.current.length && !currentOverlayEntry().length) {
      syncOverlays([])
    }
  }, [location.pathname, syncOverlays])
}
