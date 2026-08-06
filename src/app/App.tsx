import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SplashScreen } from '@/components/brand/SplashScreen'
import { AppShell } from '@/components/shell/AppShell'
import { ScreenSkeleton } from '@/components/ui/ScreenSkeleton'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useMotionLevel } from '@/hooks/useMotionLevel'
import { setHapticsEnabled } from '@/lib/native'
import { installLongTaskObserver } from '@/lib/perf'

/* Keep loader functions so the same chunks can be warmed during idle time. */
const loadChat = () => import('@/screens/Chat')
const loadChats = () => import('@/screens/Chats')
const loadMode = () => import('@/screens/Mode')
const loadTranslate = () => import('@/screens/Translate')
const loadSkills = () => import('@/screens/Skills')
const loadProject = () => import('@/screens/Project')
const loadOnboarding = () => import('@/screens/Onboarding')
const loadSignIn = () => import('@/screens/SignIn')
const loadAuthCallback = () => import('@/screens/AuthCallback')
const loadSettings = () => import('@/screens/Settings')
const loadQuizzes = () => import('@/screens/Quizzes')
const loadQuizPlay = () => import('@/screens/QuizPlay')
const loadGame = () => import('@/screens/Game')
const loadCalculator = () => import('@/screens/Calculator')

const Chat = lazy(loadChat)
const Chats = lazy(loadChats)
const Mode = lazy(loadMode)
const Translate = lazy(loadTranslate)
const Skills = lazy(loadSkills)
const Project = lazy(loadProject)
const Onboarding = lazy(loadOnboarding)
const SignIn = lazy(loadSignIn)
const AuthCallback = lazy(loadAuthCallback)
const Settings = lazy(loadSettings)
const Quizzes = lazy(loadQuizzes)
const QuizPlay = lazy(loadQuizPlay)
const Game = lazy(loadGame)
const Calculator = lazy(loadCalculator)

const SECONDARY_LOADERS = [
  loadChat, loadChats, loadSettings, loadProject, loadTranslate,
  loadSkills, loadQuizzes, loadCalculator, loadGame, loadMode, loadQuizPlay,
]

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const SEEN = 'veltrix:seen'

function MotionGate({ children }: { children: ReactNode }) {
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
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const ready = useAuthStore((state) => state.ready)
  const [splashDone, setSplashDone] = useState(false)
  const [firstLaunch] = useState(() => !localStorage.getItem(SEEN))

  useTheme()

  const haptics = useAuthStore((state) => state.settings?.haptics ?? true)
  useEffect(() => { setHapticsEnabled(haptics) }, [haptics])
  useEffect(() => { void bootstrap() }, [bootstrap])
  useEffect(() => { if (splashDone) localStorage.setItem(SEEN, '1') }, [splashDone])
  useEffect(() => installLongTaskObserver(), [])

  // Warm likely detail screens one at a time after the first meaningful paint.
  // This removes avoidable first-tap stalls without starting a download storm
  // on weak/mobile connections.
  useEffect(() => {
    if (!ready) return
    return prewarmSecondaryRoutes()
  }, [ready])

  const showSplash = !splashDone || !ready

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <SplashScreen key="splash" quick={!firstLaunch} onDone={() => setSplashDone(true)} />
        )}
      </AnimatePresence>

      {!showSplash && (
        <>
          <a href="#main" className="skip-link">Asosiy mazmunga o'tish</a>
          <Routes>
            <Route path="/auth/callback" element={<RouteSuspense><AuthCallback /></RouteSuspense>} />
            <Route path="/kirish" element={<RouteSuspense><SignIn /></RouteSuspense>} />
            <Route path="/boshlash" element={<Guard onboarding={false}><RouteSuspense><Onboarding /></RouteSuspense></Guard>} />

            <Route element={<Guard><AppShell /></Guard>}>
              {/* AppShell owns the persistent primary workspace. These routes
                  intentionally render no second copy of the primary screens. */}
              <Route path="/general" element={<PrimaryRoute />} />
              <Route path="/manbalar" element={<PrimaryRoute />} />
              <Route path="/personal" element={<PrimaryRoute />} />

              <Route path="/chats" element={<RouteSuspense><Chats /></RouteSuspense>} />
              <Route path="/rejim/:modeId" element={<RouteSuspense><Mode /></RouteSuspense>} />
              <Route path="/chat" element={<RouteSuspense><Chat /></RouteSuspense>} />
              <Route path="/chat/:chatId" element={<RouteSuspense><Chat /></RouteSuspense>} />
              <Route path="/settings" element={<RouteSuspense><Settings /></RouteSuspense>} />
              <Route path="/tarjima" element={<RouteSuspense><Translate /></RouteSuspense>} />
              <Route path="/talent" element={<RouteSuspense><Skills /></RouteSuspense>} />
              <Route path="/skills" element={<Navigate to="/talent" replace />} />
              <Route path="/testlar" element={<RouteSuspense><Quizzes /></RouteSuspense>} />
              <Route path="/test/:quizId" element={<RouteSuspense><QuizPlay /></RouteSuspense>} />
              <Route path="/oyin" element={<RouteSuspense><Game /></RouteSuspense>} />
              <Route path="/kalkulyator" element={<RouteSuspense><Calculator /></RouteSuspense>} />
              <Route path="/loyiha/:projectId" element={<RouteSuspense><Project /></RouteSuspense>} />
              <Route path="/sources" element={<Navigate to="/manbalar" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/general" replace />} />
          </Routes>
        </>
      )}
    </>
  )
}

function RouteSuspense({ children }: { children: ReactNode }) {
  // The boundary lives inside AppShell, so a lazy detail screen never removes
  // the header, persistent tabs or drawer and never looks like an app reload.
  return <Suspense fallback={<ScreenSkeleton />}>{children}</Suspense>
}

function PrimaryRoute() { return null }

function Guard({ children, onboarding = true }: { children: ReactNode; onboarding?: boolean }) {
  const session = useAuthStore((state) => state.session)
  const profile = useAuthStore((state) => state.profile)

  if (!session) return <Navigate to="/kirish" replace />
  if (onboarding && profile && !profile.onboarding_done) return <Navigate to="/boshlash" replace />
  return <>{children}</>
}

function prewarmSecondaryRoutes(): () => void {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
    deviceMemory?: number
  }).connection
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4

  // Respect users who explicitly request less data and very constrained RAM.
  if (connection?.saveData || memory <= 1) return () => undefined

  let cancelled = false
  let index = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let idleId: number | null = null

  const schedule = () => {
    if (cancelled || index >= SECONDARY_LOADERS.length) return
    const run = async () => {
      if (cancelled) return
      const loader = SECONDARY_LOADERS[index++]
      if (loader) await loader().catch(() => undefined)
      schedule()
    }

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => { void run() }, { timeout: 1800 })
    } else {
      timeoutId = globalThis.setTimeout(() => { void run() }, index === 0 ? 500 : 180)
    }
  }

  schedule()
  return () => {
    cancelled = true
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId)
    if (idleId !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
  }
}
