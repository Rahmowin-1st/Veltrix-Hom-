import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SplashScreen } from '@/components/brand/SplashScreen'
import { AppShell } from '@/components/shell/AppShell'
import { ScreenSkeleton } from '@/components/ui/ScreenSkeleton'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'

// Route-level code splitting keeps the first paint light.
const Chat = lazy(() => import('@/screens/Chat'))
const Personal = lazy(() => import('@/screens/Personal'))
const Settings = lazy(() => import('@/screens/Settings'))
const Sources = lazy(() => import('@/screens/Sources'))
const Onboarding = lazy(() => import('@/screens/Onboarding'))
const SignIn = lazy(() => import('@/screens/SignIn'))
const AuthCallback = lazy(() => import('@/screens/AuthCallback'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

const SEEN = 'veltrix:seen'

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
  const [splashDone, setSplashDone] = useState(false)
  const [firstLaunch] = useState(() => !localStorage.getItem(SEEN))

  useTheme()

  // Auth resolves *underneath* the splash, so the animation never adds delay.
  useEffect(() => { void bootstrap() }, [bootstrap])
  useEffect(() => { if (splashDone) localStorage.setItem(SEEN, '1') }, [splashDone])

  const showSplash = !splashDone || !ready

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <SplashScreen key="splash" quick={!firstLaunch} onDone={() => setSplashDone(true)} />
        )}
      </AnimatePresence>

      {!showSplash && (
        <Suspense fallback={<ScreenSkeleton />}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/kirish" element={<SignIn />} />
            <Route path="/boshlash" element={<Guard onboarding={false}><Onboarding /></Guard>} />

            <Route element={<Guard><AppShell /></Guard>}>
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

function Guard({ children, onboarding = true }: { children: React.ReactNode; onboarding?: boolean }) {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)

  if (!session) return <Navigate to="/kirish" replace />
  if (onboarding && profile && !profile.onboarding_done) return <Navigate to="/boshlash" replace />
  return <>{children}</>
}
