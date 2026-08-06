import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { generate } from '../services/gemini.js'

export const quizzesRouter = Router()

const questionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(240)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(700).optional().nullable(),
  points: z.number().int().min(1).max(100).optional(),
}).refine((q) => q.correctIndex < q.options.length, {
  message: 'To\'g\'ri javob indeksi variantlardan tashqarida.',
})

const createSchema = z.object({
  title: z.string().trim().min(1).max(15),
  description: z.string().trim().max(50).optional().nullable(),
  icon: z.string().max(24).optional(),
  cover_url: z.string().max(600000).refine((value) => value.startsWith('data:image/') || /^https?:\/\//.test(value), 'Rasm formati noto‘g‘ri.').optional().nullable(),
  background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  background_logo: z.string().max(30).optional().nullable(),
  source_id: z.string().uuid().optional().nullable(),
  subject_id: z.string().uuid().optional().nullable(),
  generation_mode: z.enum(['manual', 'ai']).default('manual'),
  prompt: z.string().trim().max(1500).optional().nullable(),
  question_count: z.number().int().min(1).max(50).default(10),
  per_question_seconds: z.number().int().min(5).max(3600).optional().nullable(),
  total_seconds: z.number().int().min(10).max(86400).optional().nullable(),
  shuffle_questions: z.boolean().default(true),
  shuffle_options: z.boolean().default(true),
  questions: z.array(questionSchema).max(50).optional(),
})

quizzesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await admin
      .from('quizzes')
      .select('*')
      .eq('user_id', req.userId!)
      .order('updated_at', { ascending: false })
    if (error) throw error
    res.json({ quizzes: data ?? [] })
  } catch (e) { next(e) }
})

quizzesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const [{ data: quiz, error }, { data: questions, error: qError }] = await Promise.all([
      admin.from('quizzes').select('*').eq('id', req.params.id).eq('user_id', userId).single(),
      admin.from('quiz_questions').select('*').eq('quiz_id', req.params.id)
        .eq('user_id', userId).order('position'),
    ])
    if (error) throw error
    if (qError) throw qError
    res.json({ quiz: { ...quiz, questions: questions ?? [] } })
  } catch (e) { next(e) }
})

quizzesRouter.post('/', requireAuth, async (req, res, next) => {
  const userId = req.userId!
  let quizId: string | null = null
  try {
    const input = createSchema.parse(req.body)
    let questions = input.questions ?? []

    if (input.generation_mode === 'ai') {
      if (!input.prompt) {
        return res.status(400).json({ message: 'AI test uchun mavzu yoki ko\'rsatma kiriting.' })
      }
      questions = await generateQuiz(userId, input.prompt, input.question_count)
    }
    if (questions.length === 0) {
      return res.status(400).json({ message: 'Kamida bitta savol kiriting.' })
    }

    const { questions: _questions, ...row } = input
    const { data: quiz, error } = await admin.from('quizzes').insert({
      ...row,
      user_id: userId,
      question_count: questions.length,
    }).select('*').single()
    if (error) throw error
    quizId = quiz.id

    const { error: qError } = await admin.from('quiz_questions').insert(
      questions.map((q, index) => ({
        quiz_id: quiz.id,
        user_id: userId,
        position: index,
        question: q.question,
        explanation: q.explanation ?? null,
        options: q.options,
        correct_index: q.correctIndex,
        points: q.points ?? 1,
      }))
    )
    if (qError) throw qError

    await logActivity(userId, 'quiz_created', 8, { quizId: quiz.id })
    res.status(201).json({ quiz: { ...quiz, questions } })
  } catch (e) {
    if (quizId) await admin.from('quizzes').delete().eq('id', quizId).eq('user_id', userId)
    next(e)
  }
})

quizzesRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = createSchema.partial().omit({ questions: true, generation_mode: true }).parse(req.body)
    const { data, error } = await admin.from('quizzes').update(body)
      .eq('id', req.params.id).eq('user_id', req.userId!).select('*').single()
    if (error) throw error
    res.json({ quiz: data })
  } catch (e) { next(e) }
})

quizzesRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { error } = await admin.from('quizzes').delete()
      .eq('id', req.params.id).eq('user_id', req.userId!)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})

quizzesRouter.post('/:id/attempts', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: quiz, error } = await admin.from('quizzes').select('id')
      .eq('id', req.params.id).eq('user_id', userId).single()
    if (error) throw error

    const { data: qs, error: qError } = await admin.from('quiz_questions')
      .select('id, points').eq('quiz_id', quiz.id).eq('user_id', userId).order('position')
    if (qError) throw qError

    const order = (qs ?? []).map((q) => q.id)
    const maxScore = (qs ?? []).reduce((n, q) => n + Number(q.points ?? 1), 0)
    const { data, error: aError } = await admin.from('quiz_attempts').insert({
      quiz_id: quiz.id,
      user_id: userId,
      max_score: maxScore,
      question_order: order,
    }).select('*').single()
    if (aError) throw aError
    res.status(201).json({ attempt: data })
  } catch (e) { next(e) }
})

quizzesRouter.post('/attempts/:attemptId/answer', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const input = z.object({
      questionId: z.string().uuid(),
      selectedIndex: z.number().int().min(0).nullable(),
      timedOut: z.boolean().default(false),
      elapsedSeconds: z.number().int().min(0).optional().nullable(),
    }).parse(req.body)

    const { data: attempt, error: aError } = await admin.from('quiz_attempts')
      .select('id, quiz_id').eq('id', req.params.attemptId).eq('user_id', userId).single()
    if (aError) throw aError
    const { data: question, error: qError } = await admin.from('quiz_questions')
      .select('id, correct_index, explanation, points').eq('id', input.questionId)
      .eq('quiz_id', attempt.quiz_id).eq('user_id', userId).single()
    if (qError) throw qError

    const isCorrect = !input.timedOut && input.selectedIndex === question.correct_index
    const { error } = await admin.from('quiz_answers').upsert({
      attempt_id: attempt.id,
      question_id: question.id,
      user_id: userId,
      selected_index: input.selectedIndex,
      is_correct: isCorrect,
      timed_out: input.timedOut,
      elapsed_seconds: input.elapsedSeconds ?? null,
    }, { onConflict: 'attempt_id,question_id' })
    if (error) throw error

    await logActivity(userId, 'quiz_answered', isCorrect ? 2 : 1, {
      quizId: attempt.quiz_id, questionId: question.id, correct: isCorrect,
    })
    res.json({
      correct: isCorrect,
      correctIndex: question.correct_index,
      explanation: question.explanation,
      points: isCorrect ? question.points : 0,
    })
  } catch (e) { next(e) }
})

quizzesRouter.post('/attempts/:attemptId/complete', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const attemptId = req.params.attemptId
    const { data: attempt, error: aError } = await admin.from('quiz_attempts')
      .select('*').eq('id', attemptId).eq('user_id', userId).single()
    if (aError) throw aError
    const { data: answers, error } = await admin.from('quiz_answers')
      .select('is_correct,timed_out,question_id').eq('attempt_id', attemptId).eq('user_id', userId)
    if (error) throw error
    const { data: questions, error: qError } = await admin.from('quiz_questions')
      .select('id,points').eq('quiz_id', attempt.quiz_id).eq('user_id', userId)
    if (qError) throw qError

    const byQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]))
    let score = 0, correct = 0, wrong = 0, unanswered = 0
    for (const q of questions ?? []) {
      const a = byQuestion.get(q.id)
      if (!a || a.timed_out) unanswered += 1
      else if (a.is_correct) { correct += 1; score += Number(q.points ?? 1) }
      else wrong += 1
    }
    const duration = Math.max(0, Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000))
    const { data: done, error: updateError } = await admin.from('quiz_attempts').update({
      completed_at: new Date().toISOString(), score,
      correct_count: correct, wrong_count: wrong, unanswered_count: unanswered,
      duration_seconds: duration,
    }).eq('id', attemptId).eq('user_id', userId).select('*').single()
    if (updateError) throw updateError

    await logActivity(userId, 'quiz_completed', Math.max(4, score * 2), {
      quizId: attempt.quiz_id, score, correct, wrong, unanswered,
    })
    res.json({ attempt: done })
  } catch (e) { next(e) }
})

async function generateQuiz(userId: string, prompt: string, count: number) {
  const raw = await generate({
    userId,
    json: true,
    system: `Sen Veltrix Hom test yaratuvchisisan. Faqat JSON qaytar. O'zbek lotin yozuvida, aniq va sinovga mos savollar tuz. Har savolda 2-6 variant, faqat bitta to'g'ri javob bo'lsin.`,
    prompt: `Ko'rsatma: ${prompt}\nSavollar soni: ${count}\nFormat: {"questions":[{"question":"...","options":["..."],"correctIndex":0,"explanation":"...","points":1}]}`,
  })
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(clean) as unknown
  const result = z.object({ questions: z.array(questionSchema).min(1).max(50) }).parse(parsed)
  return result.questions.slice(0, count)
}

async function logActivity(userId: string, kind: string, points: number, metadata: Record<string, unknown>) {
  await admin.from('activity_events').insert({ user_id: userId, kind, points, metadata })
}
