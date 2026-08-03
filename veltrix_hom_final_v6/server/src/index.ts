import express from 'express'
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

app.listen(env.PORT, () => {
  console.log(`▲ Veltrix Hom server → http://localhost:${env.PORT}`)
})
