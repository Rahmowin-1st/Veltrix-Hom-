import { useEffect, useRef } from 'react'

/**
 * Horizontal swipe detection for tab switching.
 *
 * Everything here exists to answer one question: did the user *mean* to swipe
 * sideways? Getting that wrong is worse than having no gesture at all — a tab
 * that changes while someone scrolls a list or drags a chip feels broken.
 *
 * So the gesture only fires when all of these hold:
 *  - the touch did not start on something that scrolls horizontally, or on an
 *    input, button, link or slider (those own their own drags);
 *  - horizontal travel clearly dominates vertical travel;
 *  - the swipe passes a distance threshold, or a shorter one at high velocity;
 *  - the soft keyboard is not open (the user is typing, not navigating).
 *
 * Pointer state lives in refs, never React state: updating state on every
 * pointermove would re-render the whole screen at touch frequency.
 */

interface Options {
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  enabled?: boolean
}

const MIN_DISTANCE = 64          // px of horizontal travel
const FAST_DISTANCE = 34         // px, accepted when the flick is quick
const FAST_VELOCITY = 0.45       // px/ms
const DIRECTION_RATIO = 1.6      // horizontal must beat vertical by this much
const EDGE_IGNORE = 18           // leave the OS back-gesture strip alone

/** Elements that legitimately consume a horizontal drag of their own. */
function ownsHorizontalDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true
  if (target.closest('[data-no-swipe]')) return true
  if (target.closest('button, a, [role="slider"], [role="tablist"]')) return true
  // Anything actually scrollable sideways, e.g. a wide table or a chip rail.
  let node: Element | null = target
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

export function useHorizontalSwipe<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  { onSwipeRight, onSwipeLeft, enabled = true }: Options,
): void {
  // Handlers are read from a ref so re-creating them never re-binds listeners.
  const handlers = useRef({ onSwipeRight, onSwipeLeft })
  handlers.current = { onSwipeRight, onSwipeLeft }

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return

    let startX = 0
    let startY = 0
    let startTime = 0
    let tracking = false

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; return }
      const touch = e.touches[0]!
      // Never compete with the OS edge-back gesture.
      if (touch.clientX < EDGE_IGNORE || touch.clientX > window.innerWidth - EDGE_IGNORE) {
        tracking = false
        return
      }
      if (ownsHorizontalDrag(e.target)) { tracking = false; return }
      startX = touch.clientX
      startY = touch.clientY
      startTime = performance.now()
      tracking = true
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const touch = e.changedTouches[0]
      if (!touch) return

      // A visible keyboard means the user is composing, not navigating.
      const keyboardInset = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset') || '0',
      ) || 0
      if (keyboardInset > 60) return

      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      const absX = Math.abs(dx)
      const absY = Math.abs(dy)
      if (absX < absY * DIRECTION_RATIO) return  // this was a vertical scroll

      const velocity = absX / Math.max(1, performance.now() - startTime)
      const farEnough = absX >= MIN_DISTANCE || (absX >= FAST_DISTANCE && velocity >= FAST_VELOCITY)
      if (!farEnough) return

      if (dx > 0) handlers.current.onSwipeRight?.()
      else handlers.current.onSwipeLeft?.()
    }

    const onTouchCancel = () => { tracking = false }

    // Passive: we never preventDefault, so scrolling stays smooth.
    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchend', onTouchEnd, { passive: true })
    node.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [ref, enabled])
}
