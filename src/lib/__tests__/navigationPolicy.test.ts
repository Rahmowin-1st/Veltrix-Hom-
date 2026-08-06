import { describe, it, expect } from 'vitest'

/**
 * Back-navigation policy, tested as pure decision logic.
 *
 * The real hook needs a router and a Capacitor bridge, so the *decision* is
 * extracted here and asserted directly. What matters is the ordering: a wrong
 * priority is the difference between Back dismissing a keyboard and Back
 * throwing away the draft underneath it.
 */

type BackOutcome = 'dismiss-keyboard' | 'close-overlay' | 'go-home' | 'go-back' | 'arm-exit' | 'exit'

interface BackState {
  typing: boolean
  keyboardInset: number
  overlays: string[]
  path: string
  exitArmed: boolean
}

const PEER_TABS = new Set(['/manbalar', '/personal'])

/** Mirrors the priority chain implemented in useBackNavigation. */
export function decideBack(s: BackState): BackOutcome {
  if (s.typing && s.keyboardInset > 60) return 'dismiss-keyboard'
  if (s.overlays.length > 0) return 'close-overlay'
  if (PEER_TABS.has(s.path)) return 'go-home'
  if (s.path !== '/general') return 'go-back'
  return s.exitArmed ? 'exit' : 'arm-exit'
}

const base: BackState = {
  typing: false, keyboardInset: 0, overlays: [], path: '/general', exitArmed: false,
}

describe('android back priority', () => {
  it('dismisses the keyboard before anything else', () => {
    // Even with an overlay open and a detail route beneath, typing wins.
    expect(decideBack({
      ...base, typing: true, keyboardInset: 320,
      overlays: ['drawer'], path: '/chat/abc',
    })).toBe('dismiss-keyboard')
  })

  it('does not treat a focused input as typing when the keyboard is closed', () => {
    // A hardware keyboard or a stale focus must not swallow Back.
    expect(decideBack({ ...base, typing: true, keyboardInset: 0, path: '/chat/abc' }))
      .toBe('go-back')
  })

  it('closes exactly one overlay at a time', () => {
    expect(decideBack({ ...base, overlays: ['drawer', 'sheet'] })).toBe('close-overlay')
    // After one closes, the next press closes the remaining one.
    expect(decideBack({ ...base, overlays: ['drawer'] })).toBe('close-overlay')
  })

  it('returns peer tabs to General instead of unwinding history', () => {
    expect(decideBack({ ...base, path: '/manbalar' })).toBe('go-home')
    expect(decideBack({ ...base, path: '/personal' })).toBe('go-home')
  })

  it('returns a detail screen to the previous screen', () => {
    expect(decideBack({ ...base, path: '/chat/abc' })).toBe('go-back')
    expect(decideBack({ ...base, path: '/loyiha/1' })).toBe('go-back')
  })

  it('requires two presses to exit from the root', () => {
    expect(decideBack({ ...base, path: '/general' })).toBe('arm-exit')
    expect(decideBack({ ...base, path: '/general', exitArmed: true })).toBe('exit')
  })

  it('never exits while an overlay is open', () => {
    expect(decideBack({ ...base, path: '/general', overlays: ['drawer'], exitArmed: true }))
      .toBe('close-overlay')
  })
})
