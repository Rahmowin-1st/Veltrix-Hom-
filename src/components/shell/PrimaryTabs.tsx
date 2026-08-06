import { useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TabWorkspace, type TabPanel } from './TabWorkspace'
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe'
import General from '@/screens/General'
import Sources from '@/screens/Sources'
import Personal from '@/screens/Personal'

/**
 * The three top-level destinations, mounted once and then kept alive.
 *
 * These are imported eagerly rather than lazily on purpose. They are the
 * screens every session touches, and a lazy chunk here is exactly what caused
 * the "first tap freezes" complaint: the user tapped a tab and waited for a
 * network round-trip before anything rendered. Detail screens stay lazy, where
 * the trade-off actually favours a smaller initial bundle.
 */
export default function PrimaryTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const hostRef = useRef<HTMLDivElement>(null)

  // Swiping between tabs is offered only on General. On the other two tabs a
  // horizontal drag is more likely to belong to a list or a chip rail, and a
  // gesture that sometimes navigates is worse than one that never does.
  useHorizontalSwipe(hostRef, {
    enabled: location.pathname === '/general',
    onSwipeRight: () => navigate('/manbalar', { replace: true }),
    onSwipeLeft: () => navigate('/personal', { replace: true }),
  })

  const panels = useMemo<TabPanel[]>(
    () => [
      { path: '/manbalar', render: () => <Sources /> },
      { path: '/general', render: () => <General /> },
      { path: '/personal', render: () => <Personal /> },
    ],
    [],
  )

  return (
    <div ref={hostRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TabWorkspace panels={panels}>{null}</TabWorkspace>
    </div>
  )
}
