import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Keep-alive workspace for the three primary destinations.
 *
 * The previous shell rendered `<motion.main key={location.pathname}>`, which
 * gave every route change a brand-new React subtree: scroll position, drafts,
 * filters and already-fetched lists were all destroyed, and the user saw a
 * skeleton on a screen they had already visited. That is what made tab
 * switching feel like a page refresh rather than a native app.
 *
 * Here each primary tab is mounted once on first visit and then simply hidden.
 * Hiding — rather than unmounting — is what preserves scroll offset and local
 * component state for free, without a bespoke save/restore layer that would
 * inevitably miss some piece of state.
 *
 * Only the three top-level tabs are kept alive. Detail screens (a chat, a
 * project, a source) still mount and unmount normally, because keeping every
 * visited chat's DOM forever would be a memory leak on exactly the low-end
 * Android devices this app targets. Their *data* survives in the query cache,
 * which is the part that actually costs time to rebuild.
 */

export interface TabPanel {
  /** Route path that activates this panel, e.g. `/general`. */
  path: string
  render: () => ReactNode
}

interface Props {
  panels: TabPanel[]
  /** Rendered when the current route is not one of the panels. */
  children: ReactNode
}

export function TabWorkspace({ panels, children }: Props) {
  const location = useLocation()
  const paths = useMemo(() => panels.map((p) => p.path), [panels])
  const active = paths.find((p) => location.pathname === p) ?? null

  // Panels are added on first activation and never removed, so returning to a
  // tab is instant. The set is bounded by `panels.length`, so it cannot grow.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(active ? [active] : []))
  useEffect(() => {
    if (!active || visited.has(active)) return
    setVisited((prev) => new Set(prev).add(active))
  }, [active, visited])

  return (
    <>
      {panels.map((panel) => {
        if (!visited.has(panel.path)) return null
        const isActive = panel.path === active
        return (
          <KeepAlivePanel key={panel.path} active={isActive}>
            {panel.render()}
          </KeepAlivePanel>
        )
      })}
      {/* A non-tab route (chat, project, settings…) renders normally. */}
      {!active && children}
    </>
  )
}

/**
 * A single kept-alive panel.
 *
 * `display: none` is deliberate: it keeps the subtree mounted while removing
 * it from layout, paint and hit-testing, so a hidden tab costs nothing per
 * frame. `inert` plus `aria-hidden` keep it out of the accessibility tree and
 * away from keyboard focus, which a plain `hidden` style would not guarantee.
 */
function KeepAlivePanel({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)

  // The browser discards the scroll offset of a `display:none` element, so we
  // capture it on the way out and restore it on the way back in.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const scroller = node.querySelector<HTMLElement>('[data-scroll-root]') ?? node
    if (active) {
      if (scrollTop.current) {
        // Restore before paint so the user never sees the top of the list.
        requestAnimationFrame(() => { scroller.scrollTop = scrollTop.current })
      }
      return () => { scrollTop.current = scroller.scrollTop }
    }
    return undefined
  }, [active])

  return (
    <div
      ref={ref}
      data-tab-panel
      aria-hidden={!active}
      {...(!active ? { inert: '' } : {})}
      style={{
        display: active ? 'flex' : 'none',
        flex: 1,
        minHeight: 0,
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )
}
