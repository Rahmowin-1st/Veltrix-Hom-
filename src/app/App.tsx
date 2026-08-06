import { MotionConfig } from 'framer-motion'
import { useMotionLevel } from '@/hooks/useMotionLevel'
import PrimaryTabs from '@/components/shell/PrimaryTabs'
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
import { setHapticsEnabled } from '@/lib/native'

// Route-level code splitting keeps the first paint light.
const Chat = lazy(() => import('@/screens/Chat'))
const Chats = lazy(() => import('@/screens/Chats'))
const Mode = lazy(() => import('@/screens/Mode'))
const Translate = lazy(() => import('@/screens/Translate'))
const Skills = lazy(() => import('@/screens/Skills'))
const Project = lazy(() => import('@/screens/Project'))
const Onboarding = lazy(() => import('@/screens/Onboarding'))
const SignIn = lazy(() => import('@/screens/SignIn'))
const AuthCallback = lazy(() => import('@/screens/AuthCallback'))
const Settings = lazy(() => import('@/screens/Settings'))
const Quizzes = lazy(() => import('@/screens/Quizzes'))
const QuizPlay = lazy(() => import('@/screens/QuizPlay'))
const Game = lazy(() => import('@/screens/Game'))
const Calculator = lazy(() => import('@/screens/Calculator'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

const SEEN = 'veltrix:seen'

/**
 * Applies the motion level to every Framer animation in the tree.
 *
 * `reducedMotion="always"` makes Framer skip transform/opacity animation and
 * jump to the final value, which is exactly what a weak device needs — and it
 * covers all 29 animated components without touching each one.
 */
function MotionGate({ children }: { children: React.ReactNode }) {
  const level = useMotionLevel()
  return (
    <MotionConfig
      reducedMotion={level === 'off' ? 'always' : 'never'}
      transition={level === 'reduced' ? { duration: 0.12 } : undefined}
    >
      {children}
    </MotionConfig>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <MotionGate>
            <Root />
          </MotionGate>
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

  // The haptics toggle must actually silence the device.
  const haptics = useAuthStore((s) => s.settings?.haptics ?? true)
  useEffect(() => { setHapticsEnabled(haptics) }, [haptics])

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
          {/* Keyboard users reach content without tabbing the whole sidebar. */}
          <a href="#main" className="skip-link">Asosiy mazmunga o'tish</a>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/kirish" element={<SignIn />} />
            <Route path="/boshlash" element={<Guard onboarding={false}><Onboarding /></Guard>} />

            <Route element={<Guard><AppShell /></Guard>}>
              {/*
                The three primary tabs render through one persistent element,
                so switching between them hides rather than destroys their
                subtree. Scroll position, drafts and filters survive, and a
                revisited tab never shows a skeleton.
              */}
              <Route path="/general" element={<PrimaryTabs />} />
              <Route path="/manbalar" element={<PrimaryTabs />} />
              <Route path="/personal" element={<PrimaryTabs />} />
              <Route path="/chats" element={<Chats />} />
              <Route path="/rejim/:modeId" element={<Mode />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:chatId" element={<Chat />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/tarjima" element={<Translate />} />
              <Route path="/talent" element={<Skills />} />
              <Route path="/skills" element={<Navigate to="/talent" replace />} />
              <Route path="/testlar" element={<Quizzes />} />
              <Route path="/test/:quizId" element={<QuizPlay />} />
              <Route path="/oyin" element={<Game />} />
              <Route path="/kalkulyator" element={<Calculator />} />
              <Route path="/loyiha/:projectId" element={<Project />} />
              {/* Old English path kept working so existing links never 404. */}
              <Route path="/sources" element={<Navigate to="/manbalar" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/general" replace />} />
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
