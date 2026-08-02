import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Turns performance mode on when the device can't comfortably render glass:
 *   deviceMemory < 4  OR  hardwareConcurrency < 4  OR  FPS < 40 for 3s.
 * Writes data-perf="on" on <html>; tokens.css does the rest.
 */
export function usePerfMode() {
  const mode = useAuthStore((s) => s.settings?.performance_mode ?? 'auto')

  useEffect(() => {
    const root = document.documentElement

    if (mode === 'on') { root.dataset.perf = 'on'; return }
    if (mode === 'off') { root.dataset.perf = 'off'; return }

    type NavWithHints = Navigator & { deviceMemory?: number }
    const nav = navigator as NavWithHints
    const weakDevice =
      (nav.deviceMemory !== undefined && nav.deviceMemory < 4) ||
      (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 4)

    if (weakDevice) { root.dataset.perf = 'on'; return }

    // Sample real frame rate for 3 seconds before deciding.
    let frames = 0
    let raf = 0
    const start = performance.now()
    const tick = () => {
      frames++
      if (performance.now() - start < 3000) raf = requestAnimationFrame(tick)
      else {
        const fps = frames / ((performance.now() - start) / 1000)
        root.dataset.perf = fps < 40 ? 'on' : 'off'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])
}
