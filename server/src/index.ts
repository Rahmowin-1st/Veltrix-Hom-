import express from 'express'
import { startWorkerLoop, stopWorkerLoop, workerHealth } from './services/jobWorker.js'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { env } from './config.js'
import { requireAuth } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { quotaPercent } from './services/gemini.js'
import { chatRouter } from './routes/chat.js'
import { projectsRouter } from './routes/projects.js'
import { sourcesRouter } from './routes/sources.js'
import { uploadRouter } from './routes/upload.js'
import { skillsRouter } from './routes/skills.js'
import { translateRouter } from './routes/translate.js'
import { quizzesRouter } from './routes/quizzes.js'
import { activityRouter } from './routes/activity.js'
import { v1Router } from './v1/router.js'
import { V1Worker } from './v1/jobs.js'
import { purgeExpiredPart2Trash } from './v1/part2Trash.js'
import { part5HealthRouter, part5RequestTelemetry } from './v1/part5Health.js'

const app = express()

app.use(cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true }))
app.use(express.json({ limit: '32mb' }))
app.use(part5RequestTelemetry)
app.use(part5HealthRouter)

// Canonical Product Freeze backend. Mount before legacy /api middleware so
// v1 owns its English machine-readable errors, durable limits and auth model.
app.use('/api/v1', v1Router)

// Legacy compatibility routes remain available while migration proceeds.
// They are NOT canonical authority for the new Product Freeze.
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

startWorkerLoop()
const v1Worker = new V1Worker()
void v1Worker.runLoop(1500)
const part2TrashTimer = setInterval(() => {
  void purgeExpiredPart2Trash(50).catch(error => {
    console.error('[vh-part2-trash-maintenance]', { errorClass: error instanceof Error ? error.name : 'UnknownError' })
  })
}, 15 * 60_000)
part2TrashTimer.unref()
const server = app.listen(env.PORT, () => {
  console.log(`▲ Veltrix Hom server → http://localhost:${env.PORT}`)
})

function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received, draining…`)
  stopWorkerLoop()
  v1Worker.stop()
  clearInterval(part2TrashTimer)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
