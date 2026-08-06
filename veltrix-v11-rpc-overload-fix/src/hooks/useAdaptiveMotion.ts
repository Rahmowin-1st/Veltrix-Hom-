import { useEffect } from 'react'

/**
 * Animation is the first thing to sacrifice on a slow phone. Rather than
 * guessing once at startup, we pick a level from several weak signals and
 * then *demote* it if the device actually drops frames in practice.
 *
 * The level is published as a `data-motion` attribute on <html> so CSS can
 * respond without any component re-rendering.
 */
export type MotionLevel = 'full' | 'reduced' | 'off'

const STORAGE_KEY = 'veltrix:motion-level'

/** No single signal is reliable, so we combine them and require agreement. */
function detectInitialLevel(): MotionLevel {
  // An explicit OS-level preference always wins — it is a real user choice,
  // not a heuristic.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off'

  // A manual override from Settings, if the user set one.
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'full' || stored === 'reduced' || stored === 'off') return stored

  const cores = navigator.hardwareConcurrency ?? 4
  // deviceMemory is Chromium-only; absent elsewhere, which is why it only
  // contributes a vote rather than deciding on its own.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4

  let weakSignals = 0
  if (cores <= 4) weakSignals++
  if (memory <= 4) weakSignals++
  // A very narrow viewport usually means a budget phone rather than a
  // flagship, which tend to report large logical widths.
  if (window.innerWidth <= 400) weakSignals++

  if (weakSignals >= 2) return 'reduced'
  return 'full'
}

/** Subscribers (e.g. Framer's MotionConfig) that need the level in JS, not CSS. */
const listeners = new Set<(level: MotionLevel) => void>()
let currentLevel: MotionLevel = 'full'

function apply(level: MotionLevel) {
  currentLevel = level
  document.documentElement.dataset.motion = level
  for (const listener of listeners) listener(level)
}

/**
 * CSS can throttle transitions, but Framer Motion animates in JavaScript and
 * ignores `transition-duration`. Components therefore need the level as a
 * value, which this subscription provides without a re-render per frame.
 */
export function subscribeMotionLevel(listener: (level: MotionLevel) => void): () => void {
  listeners.add(listener)
  listener(currentLevel)
  return () => { listeners.delete(listener) }
}

/**
 * Installs the motion level and watches real frame timing. If the device
 * sustains a poor frame rate while animating, we step down a level — once,
 * and never back up, so the UI cannot oscillate.
 */
/**
 * Installs the motion level, then samples real frame timing for a BOUNDED
 * window only.
 *
 * V7 ran requestAnimationFrame for the entire lifetime of the app. That
 * monitor is itself a per-frame cost and keeps the CPU awake — on exactly
 * the weak phones it was meant to help. Two seconds of sampling shortly
 * after startup is enough to tell a struggling device from a healthy one,
 * after which the loop stops for good.
 */
export function useAdaptiveMotion() {
  useEffect(() => {
    let level = detectInitialLevel()
    apply(level)

    // An explicit preference or an already-minimal level needs no sampling.
    if (level === 'off') return
    if (localStorage.getItem(STORAGE_KEY)) return

    const SAMPLE_MS = 2000
    const START_DELAY_MS = 1200   // let first paint and hydration settle

    let rafId = 0
    let startTimer = 0
    let frames = 0
    let sampleStart = 0
    let stopped = false

    const stop = () => {
      stopped = true
      if (rafId) cancelAnimationFrame(rafId)
      if (startTimer) window.clearTimeout(startTimer)
      rafId = 0
    }

    const sample = (now: number) => {
      if (stopped) return
      if (!sampleStart) sampleStart = now
      frames++

      const elapsed = now - sampleStart
      if (elapsed >= SAMPLE_MS) {
        const fps = (frames * 1000) / elapsed
        // Below ~40fps the interface already feels sticky. Demote exactly
        // once — never repeatedly, so the UI cannot oscillate.
        if (fps < 40) {
          level = level === 'full' ? 'reduced' : 'off'
          apply(level)
        }
        stop()   // measurement finished; the loop never runs again
        return
      }
      rafId = requestAnimationFrame(sample)
    }

    startTimer = window.setTimeout(() => {
      if (!stopped) rafId = requestAnimationFrame(sample)
    }, START_DELAY_MS)

    return stop
  }, [])
}

/** Lets Settings offer an explicit override of the automatic choice. */
export function setMotionLevel(level: MotionLevel | 'auto') {
  if (level === 'auto') {
    localStorage.removeItem(STORAGE_KEY)
    apply(detectInitialLevel())
    return
  }
  localStorage.setItem(STORAGE_KEY, level)
  apply(level)
}

export function getMotionLevel(): MotionLevel {
  const current = document.documentElement.dataset.motion
  return current === 'reduced' || current === 'off' ? current : 'full'
}
