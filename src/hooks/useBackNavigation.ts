import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUIStore } from '@/store/uiStore'
import { isNative, onHardwareBack, exitApp } from '@/lib/native'

/**
 * One back-navigation policy for the whole app, so every surface behaves
 * the way a native app does — and the way ChatGPT does on the web.
 *
 * The rules, in priority order, all operate on *navigation* only. Nothing
 * here ever undoes a sent message or an AI call; it moves between screens
 * and closes overlays, never mutates content.
 *
 *   1. An open overlay (settings drawer, search, sheet) closes first.
 *   2. Anywhere that isn't the root returns to the previous screen.
 *   3. At the root (General), the first press arms a "press again to exit"
 *      hint; a second press within the window exits (native) or is left to
 *      the browser (web).
 *
 * This is wired once, from AppShell, and coordinates the browser history
 * stack and the Android hardware button through the same function.
 */

const ROOT_PATHS = new Set(['/general'])
const EXIT_WINDOW_MS = 2000

export function useBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const closeTopOverlay = useUIStore((s) => s.closeTopOverlay)
  const hasOverlay = useUIStore((s) => s.hasOpenOverlay)
  const setExitHint = useUIStore((s) => s.setExitHint)

  const exitArmedAt = useRef(0)
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname

  /**
   * Returns true when the app consumed the back action, false when the
   * platform should handle it (exit on native, browser back on web).
   */
  const handleBack = useCallback((): boolean => {
    // 1) Overlays always win — a back press dismisses the topmost one.
    if (hasOverlay()) {
      closeTopOverlay()
      return true
    }

    const path = locationRef.current
    const atRoot = ROOT_PATHS.has(path)

    // 2) Not at the root → go to the previous screen in history.
    if (!atRoot) {
      navigate(-1)
      return true
    }

    // 3) At the root → arm, then confirm, an exit.
    const now = Date.now()
    if (now - exitArmedAt.current < EXIT_WINDOW_MS) {
      setExitHint(false)
      return false // let the platform exit / go back
    }

    exitArmedAt.current = now
    setExitHint(true)
    window.setTimeout(() => {
      // Only clear if a second press did not already consume it.
      if (Date.now() - exitArmedAt.current >= EXIT_WINDOW_MS - 50) setExitHint(false)
    }, EXIT_WINDOW_MS)
    return true
  }, [navigate, hasOverlay, closeTopOverlay, setExitHint])

  // Android hardware back button.
  useEffect(() => {
    if (!isNative) return
    const cleanup = onHardwareBack(() => {
      if (!handleBack()) void exitApp()
    })
    return cleanup
  }, [handleBack])

  // Browser / PWA back button. We keep a sentinel entry on the stack so a
  // back press fires popstate instead of leaving the app; if the app decides
  // not to consume it, we let the real navigation through.
  useEffect(() => {
    if (isNative) return

    // Seed one extra history entry so the first back press is catchable.
    if (!window.history.state?.veltrixSentinel) {
      window.history.pushState({ veltrixSentinel: true }, '')
    }

    const onPopState = () => {
      const consumed = handleBack()
      if (consumed) {
        // Re-arm the sentinel: we stayed in the app, so keep a catchable entry.
        window.history.pushState({ veltrixSentinel: true }, '')
      }
      // If not consumed we do nothing — the browser already moved back, which
      // at the root means leaving the app, exactly as intended.
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [handleBack])
}
