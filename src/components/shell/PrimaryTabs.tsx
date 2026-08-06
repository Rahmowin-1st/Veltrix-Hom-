import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TabWorkspace, type TabPanel } from './TabWorkspace'
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe'
import { useUIStore } from '@/store/uiStore'
import General from '@/screens/General'
import Sources from '@/screens/Sources'
import Personal from '@/screens/Personal'

const PANELS: TabPanel[] = [
  { path: '/manbalar', render: () => <Sources /> },
  { path: '/general', render: () => <General /> },
  { path: '/personal', render: () => <Personal /> },
]

/**
 * Persistent primary workspace. AppShell owns this component and never
 * unmounts it during an authenticated session, including while a detail route
 * is open. That makes returning from a chat/project/source immediate and
 * restores the exact tab state underneath it.
 */
export default function PrimaryTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const hostRef = useRef<HTMLDivElement>(null)
  const overlayOpen = useUIStore((state) => state.overlays.length > 0)

  useHorizontalSwipe(hostRef, {
    enabled: location.pathname === '/general' && !overlayOpen,
    onSwipeRight: () => navigate('/manbalar', { replace: true }),
    onSwipeLeft: () => navigate('/personal', { replace: true }),
  })

  return (
    <div ref={hostRef} data-primary-workspace
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TabWorkspace panels={PANELS} />
    </div>
  )
}
