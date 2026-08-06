import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Bounded keep-alive workspace for the three primary destinations.
 *
 * All primary panels mount during app bootstrap instead of on first tap. This
 * is deliberate: there are exactly three of them, and warming this bounded
 * set removes the first-open pause without keeping an unbounded collection of
 * chats/projects alive. A hidden panel stays mounted but is removed from
 * layout, paint, hit-testing and the accessibility tree.
 */
export interface TabPanel {
  path: string
  render: () => ReactNode
}

interface Props {
  panels: TabPanel[]
}

export function TabWorkspace({ panels }: Props) {
  const location = useLocation()
  const paths = useMemo(() => panels.map((panel) => panel.path), [panels])
  const active = paths.includes(location.pathname) ? location.pathname : null

  return (
    <>
      {panels.map((panel) => (
        <KeepAlivePanel key={panel.path} active={panel.path === active} path={panel.path}>
          {panel.render()}
        </KeepAlivePanel>
      ))}
    </>
  )
}

function KeepAlivePanel({ active, path, children }: {
  active: boolean
  path: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)

  // Capture before the panel is hidden, then restore before the next paint.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const scroller = node.querySelector<HTMLElement>('[data-scroll-root]') ?? node

    if (active) {
      scroller.scrollTop = scrollTop.current
      return () => { scrollTop.current = scroller.scrollTop }
    }
    return undefined
  }, [active])

  return (
    <div
      ref={ref}
      data-tab-panel={path}
      aria-hidden={!active}
      {...(!active ? { inert: '' } : {})}
      style={{
        display: active ? 'flex' : 'none',
        flex: 1,
        minHeight: 0,
        flexDirection: 'column',
        contain: active ? undefined : 'layout style paint',
      }}
    >
      {children}
    </div>
  )
}
