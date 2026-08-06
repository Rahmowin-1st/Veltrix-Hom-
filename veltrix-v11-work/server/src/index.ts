import express from 'express'
import { startWorkerLoop, stopWorkerLoop, workerHealth } from './services/jobWorker.js'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { env } from './config.js'
import { requireAuth } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { quotaPercent } from './services/gemini.js'
import { checkSupabaseAdminConnection } from './services/supabase.js'
import { chatRouter } from './routes/chat.js'
import { projectsRouter } from './routes/projects.js'
import { sourcesRouter } from './routes/sources.js'
import { uploadRouter } from './routes/upload.js'
import { skillsRouter } from './routes/skills.js'
import { translateRouter } from './routes/translate.js'
import { quizzesRouter } from './routes/quizzes.js'
import { activityRouter } from './routes/activity.js'

const app = express()

app.use(cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true }))
app.use(express.json({ limit: '32mb' }))

// 30 requests / minute / user, per the spec.
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.userId ?? req.ip ?? 'anon',
    message: { error: 'rate_limited', message: '⏳ Juda tez. Bir daqiqa kuting.' },
  })
)

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.get('/health/dependencies', async (_req, res) => {
  const supabase = await checkSupabaseAdminConnection()
  res.status(supabase.ok ? 200 : 503).json({ ok: supabase.ok, supabase })
})

// Operational visibility into the durable job queue: how many jobs sit in
// each state and whether any leases have gone stale (a dead worker). Read-only
// and unauthenticated so an uptime monitor can poll it.
app.get('/health/worker', async (_req, res) => {
  try {
    res.json({ ok: true, ...(await workerHealth()) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'worker_health_failed' })
  }
})

app.get('/api/quota', requireAuth, async (req, res, next) => {
  try {
    res.json({ percent: await quotaPercent(req.userId!) })
  } catch (e) { next(e) }
})

app.use('/api/chat', chatRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/sources/upload', uploadRouter)
app.use('/api/sources', sourcesRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/translate', translateRouter)
app.use('/api/quizzes', quizzesRouter)
app.use('/api/activity', activityRouter)

app.use(errorHandler)

// Resumes any job left unfinished by a previous restart or sleep.
startWorkerLoop()
const server = app.listen(env.PORT, () => {
  console.log(`▲ Veltrix Hom server → http://localhost:${env.PORT}`)
  void checkSupabaseAdminConnection().then((dependency) => {
    if (dependency.ok) {
      console.log(`[startup] Supabase ready project=${dependency.project_ref} key=${dependency.key_kind} fp=${dependency.key_fingerprint}`)
    } else {
      console.error(`[startup] Supabase configuration failed: ${dependency.error}. ${dependency.action}`)
    }
  })
})

// Graceful shutdown: stop claiming new jobs and let in-flight HTTP finish.
// A job interrupted mid-flight keeps its checkpoint, so another worker (or
// this process on restart) resumes it from the last committed page.
function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received, draining…`)
  stopWorkerLoop()
  server.close(() => process.exit(0))
  // Hard cap so a stuck connection cannot block the deploy platform forever.
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
