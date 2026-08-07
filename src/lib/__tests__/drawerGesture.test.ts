import { describe, it, expect } from 'vitest'
import {
  resolveAxis, shouldSnapOpen, progressFromDx, drawerTravel,
  FLICK_VELOCITY,
} from '../drawerGesture'

/**
 * The drawer gesture's decisions. These are the parts that are impossible to
 * verify by eye and easy to get subtly wrong.
 */
describe('direction lock', () => {
  it('does not decide on a movement too small to judge', () => {
    expect(resolveAxis(3, 2)).toBe('undecided')
  })

  it('gives an ambiguous drag to vertical scrolling', () => {
    // The chat list scrolls constantly; the drawer opens rarely. A tie must
    // not pull the drawer open under a scrolling finger.
    expect(resolveAxis(10, 10)).toBe('vertical')
    expect(resolveAxis(10, 12)).toBe('vertical')
  })

  it('claims horizontal only when clearly dominant', () => {
    expect(resolveAxis(30, 5)).toBe('horizontal')
    // 1.2x is not decisive enough to steal a scroll.
    expect(resolveAxis(12, 10)).toBe('undecided')
  })

  it('never switches axis once locked', () => {
    // A drag that starts horizontal then curves downward must keep dragging
    // the drawer, not suddenly hand control to the scroller mid-gesture.
    expect(resolveAxis(5, 90, 'horizontal')).toBe('horizontal')
    expect(resolveAxis(90, 5, 'vertical')).toBe('vertical')
  })
})

describe('snap decision', () => {
  const slow = 0

  it('opens on a fast flick even from almost closed', () => {
    expect(shouldSnapOpen({ progress: 0.08, velocity: FLICK_VELOCITY + 0.1, wasOpen: false })).toBe(true)
  })

  it('closes on a fast reverse flick even from almost open', () => {
    expect(shouldSnapOpen({ progress: 0.95, velocity: -(FLICK_VELOCITY + 0.1), wasOpen: true })).toBe(false)
  })

  it('uses position when the drag is slow', () => {
    expect(shouldSnapOpen({ progress: 0.15, velocity: slow, wasOpen: false })).toBe(false)
    expect(shouldSnapOpen({ progress: 0.70, velocity: slow, wasOpen: false })).toBe(true)
  })

  it('applies hysteresis so a midpoint release does not flicker', () => {
    // The same progress resolves differently depending on where the drag
    // started — which is what stops a drawer parked near the middle from
    // oscillating between open and closed.
    const midOpening = shouldSnapOpen({ progress: 0.40, velocity: slow, wasOpen: false })
    const midClosing = shouldSnapOpen({ progress: 0.40, velocity: slow, wasOpen: true })
    expect(midOpening).toBe(false)
    expect(midClosing).toBe(true)
  })

  it('a barely-moved open drawer stays open', () => {
    expect(shouldSnapOpen({ progress: 0.97, velocity: slow, wasOpen: true })).toBe(true)
  })
})

describe('progress mapping', () => {
  it('caps travel so a wide screen does not need a huge drag', () => {
    expect(drawerTravel(1200)).toBe(360)
    expect(drawerTravel(360)).toBeCloseTo(316.8)
  })

  it('maps an opening drag from 0 to 1 and clamps', () => {
    expect(progressFromDx(0, 400, false)).toBe(0)
    expect(progressFromDx(9999, 400, false)).toBe(1)
    expect(progressFromDx(drawerTravel(400) / 2, 400, false)).toBeCloseTo(0.5)
  })

  it('maps a closing drag (negative dx) down from 1', () => {
    expect(progressFromDx(0, 400, true)).toBe(1)
    expect(progressFromDx(-drawerTravel(400) / 2, 400, true)).toBeCloseTo(0.5)
    expect(progressFromDx(-9999, 400, true)).toBe(0)
  })
})
