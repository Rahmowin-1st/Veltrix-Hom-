import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Follows new messages only while the user is already at the bottom.
 * Scrolling up to re-read something must never be yanked back down by
 * an incoming token.
 */
export function useAutoScroll(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setPinned(distance < 120)
  }, [])

  useEffect(() => {
    if (!pinned) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setPinned(true)
  }, [])

  return { containerRef, endRef, onScroll, pinned, scrollToEnd }
}
