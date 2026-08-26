import { Router } from 'express'
import { admin } from '../services/supabase.js'
import { auditMutations } from './audit.js'
import { v1AuthRouter } from './auth.js'
import { ApiError, requestContext, v1ErrorHandler } from './errors.js'
import { registeredJobKinds } from './jobs.js'
import { QUOTA_CONTRACTS } from './quota.js'
import { v1ProfileRouter } from './profile.js'
import { v1Part2LibraryRouter } from './part2Library.js'
import { v1Part2NotebookRouter } from './part2Notebook.js'
import { v1Part2ResearchRouter } from './part2Research.js'
import { v1Part2RetrievalRouter } from './part2Retrieval.js'
import { v1Part2TrashRouter } from './part2Trash.js'
import { v1Part2Router } from './part2.js'
import { v1Part3ConversationRouter } from './part3Conversation.js'
import { v1Part3HistoryRouter } from './part3History.js'
import { v1Part3InteractionsRouter } from './part3Interactions.js'
import { v1StorageRouter } from './storage.js'
import { v1StreamRouter } from './stream.js'

const router = Router()
router.use(requestContext)
router.use(auditMutations)

router.get('/health', async (_req, res, next) => {
  try {
    const { error } = await admin.from('vh_quota_policies').select('policy_key').limit(1)
    if (error) throw error
    res.json({
      ok: true,
      version: 'v1',
      database: 'ok',
      googleAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
      emailCodeConfigured: Boolean(process.env.APP_ENV === 'test' || (process.env.RESEND_API_KEY && process.env.AUTH_CODE_FROM_EMAIL)),
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      libraryQuota: {
        hardBytes: QUOTA_CONTRACTS.library.hardBytes,
        warningBytes: QUOTA_CONTRACTS.library.warningBytes,
      },
      registeredJobKinds: registeredJobKinds(),
    })
  } catch (error) { next(error) }
})

router.use('/auth', v1AuthRouter)
router.use('/profile', v1ProfileRouter)
router.use('/storage', v1StorageRouter)
// Stronger Part 2 routes mount before the base Part 2 router so they own their exact contracts.
router.use(v1Part2LibraryRouter)
router.use(v1Part2NotebookRouter)
router.use(v1Part2RetrievalRouter)
router.use(v1Part2ResearchRouter)
router.use(v1Part2TrashRouter)
router.use(v1Part2Router)
// Part 3 Conversation routes preserve typed streaming plus explicit interaction/history overlays.
router.use(v1Part3ConversationRouter)
router.use(v1Part3InteractionsRouter)
router.use(v1Part3HistoryRouter)
// The accepted generic /ai/stream primitive remains mounted unchanged for compatibility.
router.use(v1StreamRouter)

router.use((_req, _res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'The API route was not found.')))
router.use(v1ErrorHandler)

export { router as v1Router }
