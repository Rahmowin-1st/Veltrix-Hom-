import { useSyncExternalStore } from 'react'
import { subscribeMotionLevel, getMotionLevel, type MotionLevel } from './useAdaptiveMotion'

/**
 * The current motion level as React state.
 *
 * Uses `useSyncExternalStore` so a level change re-renders exactly once —
 * never per frame — and server/first-paint reads stay consistent.
 */
export function useMotionLevel(): MotionLevel {
  return useSyncExternalStore(
    subscribeMotionLevel,
    () => getMotionLevel(),
    () => 'full' as MotionLevel,
  )
}
