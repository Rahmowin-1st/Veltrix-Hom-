/**
 * Drawer gesture decision logic, kept pure so it can be tested without a DOM.
 *
 * The gesture itself lives in the chat screen (it needs real touch events and a
 * MotionValue), but every *decision* it makes is here: whether the drag has
 * declared a direction, and whether releasing should snap open or closed.
 * Those are the parts that are easy to get subtly wrong and impossible to
 * verify by eye.
 */

/** Width the drawer travels; the gesture is normalised against it. */
export function drawerTravel(viewportWidth: number): number {
  return Math.min(viewportWidth * 0.88, 360)
}

export type GestureAxis = 'undecided' | 'horizontal' | 'vertical'

/**
 * Decides which axis owns a drag, once it has moved far enough to tell.
 *
 * Locking matters more than the threshold: without a lock, a diagonal scroll
 * flickers between opening the drawer and scrolling the list. Once an axis is
 * claimed it is never reconsidered for the rest of the gesture.
 */
export function resolveAxis(dx: number, dy: number, current: GestureAxis = 'undecided'): GestureAxis {
  if (current !== 'undecided') return current          // locked — never switch
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absX < 6 && absY < 6) return 'undecided'         // too small to judge
  // Vertical wins ties: the chat list scrolls far more often than the drawer
  // opens, so an ambiguous drag should scroll rather than pull the drawer.
  if (absY >= absX) return 'vertical'
  return absX > absY * 1.25 ? 'horizontal' : 'undecided'
}

export interface SnapInput {
  /** 0 = fully closed, 1 = fully open. */
  progress: number
  /** Positive = moving toward open, in px/ms. */
  velocity: number
  /** Whether the drawer was open when the drag started. */
  wasOpen: boolean
}

/**
 * Snap decision on release.
 *
 * A fast flick should win regardless of distance — the user has expressed a
 * clear intent and waiting for them to cross the halfway point feels sticky.
 * A slow drag is judged on position instead, because a slow finger is placing
 * the drawer deliberately.
 */
export const FLICK_VELOCITY = 0.45   // px/ms
export const OPEN_THRESHOLD = 0.42   // fraction of travel, opening
export const CLOSE_THRESHOLD = 0.62  // fraction remaining, closing

export function shouldSnapOpen({ progress, velocity, wasOpen }: SnapInput): boolean {
  // Decisive flick: direction alone decides.
  if (velocity >= FLICK_VELOCITY) return true
  if (velocity <= -FLICK_VELOCITY) return false

  // Slow drag: position decides, with hysteresis so an already-open drawer
  // needs a definite pull to close (and vice versa). Without this, a drawer
  // released near the midpoint flickers between states.
  return wasOpen ? progress > 1 - CLOSE_THRESHOLD : progress >= OPEN_THRESHOLD
}

/** Clamps raw finger travel to a 0..1 drawer progress. */
export function progressFromDx(dx: number, viewportWidth: number, wasOpen: boolean): number {
  const travel = drawerTravel(viewportWidth)
  const raw = wasOpen ? 1 + dx / travel : dx / travel
  return Math.min(1, Math.max(0, raw))
}
