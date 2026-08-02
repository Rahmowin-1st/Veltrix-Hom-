import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { IgnitionAnimation } from '@/components/brand/IgnitionAnimation'
import { AppHeader } from '@/components/ui/AppHeader'
import { BottomNav } from '@/components/ui/BottomNav'
import { ScreenSkeleton } from '@/components/ui/ScreenSkeleton'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { usePerfMode } from '@/hooks/usePerfMode'

// Route-based code splitting keeps first paint under the 2.5s target.
const Chat = lazy(() => import('@/screens/Chat'))
const Personal = lazy(() => import('@/screens/Personal'))
const Settings = lazy(() => import('@/screens/Settings'))
const Onboarding = lazy(() => import('@/screens/Onboarding'))
const SignIn = lazy(() => import('@/screens/SignIn'))
const AuthCallback = lazy(() => import('@/screens/AuthCallback'))
const Sources = lazy(() => import('@/screens/Sources'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

const SEEN_KEY = 'veltrix:seen'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Root />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function Root() {
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const ready = useAuthStore((s) => s.ready)
  const [ignitionDone, setIgnitionDone] = useState(false)
  const [firstLaunch] = useState(() => !localStorage.getItem(SEEN_KEY))

  useTheme()
  usePerfMode()

  // Auth check + profile fetch run *during* the animation, not after it.
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (ignitionDone) localStorage.setItem(SEEN_KEY, '1')
  }, [ignitionDone])

  const showIgnition = !ignitionDone || !ready

  return (
    <>
      <AnimatePresence>
        {showIgnition && (
          <IgnitionAnimation
            key="ignition"
            variant={firstLaunch ? 'full' : 'short'}
            onComplete={() => setIgnitionDone(true)}
          />
        )}
      </AnimatePresence>

      {!showIgnition && (
        <Suspense fallback={<ScreenSkeleton />}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/kirish" element={<SignIn />} />
            <Route path="/boshlash" element={<Guard requireOnboarding={false}><Onboarding /></Guard>} />

            <Route element={<Guard><Shell /></Guard>}>
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:chatId" element={<Chat />} />
              <Route path="/personal" element={<Personal />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/sources" element={<Sources />} />
            </Route>

            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Suspense>
      )}
    </>
  )
}

/** Blocks unauthenticated access and pushes new users into onboarding. */
function Guard({
  children,
  requireOnboarding = true,
}: {
  children: React.ReactNode
  requireOnboarding?: boolean
}) {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)

  if (!session) return <Navigate to="/kirish" replace />
  if (requireOnboarding && profile && !profile.onboarding_done) {
    return <Navigate to="/boshlash" replace />
  }
  return <>{children}</>
}

function Shell() {
  const location = useLocation()
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        style={{
          flex: 1,
          paddingInline: 12,
          paddingTop: 12,
          paddingBottom: 'calc(var(--nav-h) + 28px + var(--safe-bottom))',
        }}
      >
        <Outlet />
      </motion.main>
      <BottomNav />
    </div>
  )
}
