import { useEffect } from 'react'

/**
 * Keeps the composer above the on-screen keyboard.
 *
 * Mobile keyboards often resize only the VISUAL viewport while the layout
 * viewport stays full height, so `100dvh` alone leaves the composer hidden
 * underneath. We measure the difference and publish it as a CSS variable
 * the shell can subtract from its height.
 *
 * `interactive-widget=resizes-content` in the viewport meta handles this
 * natively on newer Chrome; this hook is the fallback everywhere else and
 * simply reports 0 when the browser already resized the layout.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement

    // No VisualViewport support: leave the variable at its 0 default rather
    // than guessing, so layout stays predictable.
    if (!vv) {
      root.style.setProperty('--keyboard-inset', '0px')
      return
    }

    let frame = 0
    const update = () => {
      // Coalesce the burst of resize/scroll events a keyboard animation
      // fires into one write per frame.
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        // How much of the layout viewport the keyboard covers.
        const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        // Ignore sub-pixel noise and address-bar collapse jitter.
        const inset = covered > 60 ? Math.round(covered) : 0
        root.style.setProperty('--keyboard-inset', `${inset}px`)
        root.dataset.keyboard = inset > 0 ? 'open' : 'closed'
      })
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.setProperty('--keyboard-inset', '0px')
      delete root.dataset.keyboard
    }
  }, [])
}
