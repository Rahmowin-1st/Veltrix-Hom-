import { Router } from 'express'
import { z } from 'zod'
import { CACHE_THRESHOLD, MODELS } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { embedOne, generate, quotaPercent } from '../services/gemini.js'
import { parseSlashCommands, routeMessage, stripFences } from '../services/subjectRouter.js'
import { buildSystemPrompt, REFUSAL_BLOCKS } from '../prompts/system.js'

export const chatRouter = Router()

const Body = z.object({
  chatId: z.string().uuid().nullable().optional(),
  text: z.string().min(1).max(4000),
  lockedSourceId: z.string().uuid().nullable().optional(),
  lockedSourceIds: z.array(z.string().uuid()).max(8).optional(),
  image: z.object({ mimeType: z.string(), data: z.string() }).nullable().optional(),
})

interface Chunk {
  id: string
  source_id: string
  page_number: number
  content: string
  heading: string | null
}

chatRouter.post('/', requireAuth, async (req, res, next) => {
  const started = Date.now()
  try {
    const userId = req.userId!
    const body = Body.parse(req.body)

    /* ---- [0] slash commands: free, no AI ------------------------- */
    const slash = parseSlashCommands(body.text)
    const question = slash.cleanText || body.text

    /* ---- load the user's profile + settings ---------------------- */
    const [{ data: profile }, { data: settings }] = await Promise.all([
      admin.from('profiles').select('grade, school_language').eq('id', userId).single(),
      admin.from('user_settings').select('*').eq('user_id', userId).single(),
    ])

    const answerLength = slash.answerLength ?? settings?.answer_length ?? 'normal'

    /* ---- ensure a chat row --------------------------------------- */
    let chatId = body.chatId ?? null
    if (!chatId) {
      const { data } = await admin
        .from('chats')
        .insert({ user_id: userId, title: question.slice(0, 60) })
        .select('id')
        .single()
      chatId = data?.id ?? null
    }
    if (!chatId) throw new Error('Chat yaratilmadi')

    await admin.from('messages').insert({
      chat_id: chatId, user_id: userId, role: 'user', content: body.text,
    })

    /* ---- [1] semantic cache: exact hit means zero AI cost --------- */
    let questionEmbedding: number[] | null = null
    try {
      questionEmbedding = await embedOne(question, 'query')
      const { data: cached } = await admin.rpc('match_answer_cache', {
        p_user_id: userId,
        p_embedding: questionEmbedding,
        p_source_id: body.lockedSourceIds?.[0] ?? body.lockedSourceId ?? null,
        p_threshold: CACHE_THRESHOLD,
      })
      const hit = Array.isArray(cached) ? cached[0] : null
      if (hit?.answer_blocks) {
        const saved = await persist(userId, chatId, hit.answer_blocks, 'cache', started)
        return res.json({ ...saved, cached: true, chatId })
      }
    } catch {
      // Embedding failure must not break the answer — continue without cache/RAG.
    }

    /* ---- [2] router ---------------------------------------------- */
    const route = await routeMessage(userId, question)

    if (route.intent === 'off_topic') {
      const saved = await persist(userId, chatId, REFUSAL_BLOCKS, 'guard', started)
      return res.json({ ...saved, chatId, sourceMode: 'none', subject: null })
    }

    const subjectSlug = slash.subject ?? route.subject_slug

    /* ---- [3] choose the source ----------------------------------- */
    let sourceIds: string[] | null = null
    let sourceMode: 'locked' | 'auto' | 'none' = 'none'

    const requestedSourceIds = body.lockedSourceIds?.length ? body.lockedSourceIds : (body.lockedSourceId ? [body.lockedSourceId] : [])
    if (requestedSourceIds.length) {
      const { data: ownedSources } = await admin.from('sources').select('id').eq('user_id', userId).in('id', requestedSourceIds).eq('status', 'ready')
      sourceIds = (ownedSources ?? []).map((source) => source.id)
      if (sourceIds.length === 0) return res.status(400).json({ message: 'Tanlangan manbalar topilmadi yoki hali tayyor emas.' })
      sourceMode = 'locked'
    } else if (settings?.auto_source !== false && route.needs_source) {
      const { data: subj } = await admin
        .from('subjects').select('id').eq('user_id', userId).eq('slug', subjectSlug).maybeSingle()

      const q = admin.from('sources')
        .select('id').eq('user_id', userId).eq('status', 'ready').eq('is_active', true)
      if (subj?.id) q.eq('subject_id', subj.id)

      const { data: srcs } = await q.limit(4)
      if (srcs?.length) {
        sourceIds = srcs.map((s) => s.id)
        sourceMode = 'auto'
      }
    }

    /* ---- [4] hybrid RAG ------------------------------------------ */
    let chunks: Chunk[] = []
    if (sourceIds && questionEmbedding) {
      const page = slash.page ?? route.page_hint
      const { data } = await admin.rpc('match_source_chunks', {
        p_user_id: userId,
        p_embedding: questionEmbedding,
        p_query_text: question,
        p_source_ids: sourceIds,
        p_page_from: page ? Math.max(1, page - 1) : null,
        p_page_to: page ? page + 1 : null,
        p_match_count: 6,
      })
      chunks = (data as Chunk[]) ?? []

      // A page hint that returns nothing shouldn't dead-end the search.
      if (chunks.length === 0 && page) {
        const { data: wide } = await admin.rpc('match_source_chunks', {
          p_user_id: userId, p_embedding: questionEmbedding, p_query_text: question,
          p_source_ids: sourceIds, p_page_from: null, p_page_to: null, p_match_count: 6,
        })
        chunks = (wide as Chunk[]) ?? []
      }
    }

    const hasSource = chunks.length > 0
    if (sourceMode !== 'none' && !hasSource) sourceMode = 'none'

    /* ---- [5] generate the answer --------------------------------- */
    const system = buildSystemPrompt({
      grade: profile?.grade ?? null,
      language: profile?.school_language ?? 'uz',
      subjectSlug,
      answerLength,
      teacherMode: settings?.teacher_mode ?? false,
      stickerLevel: settings?.sticker_level ?? 'normal',
      citationRequired: settings?.citation_required ?? true,
      hasSource,
    })

    let prompt = ''
    if (hasSource) {
      prompt += 'SOURCE_CONTEXT:\n'
      for (const c of chunks) {
        prompt += `\n[${c.page_number}-bet${c.heading ? ` · ${c.heading}` : ''}]\n${c.content}\n`
      }
      prompt += '\n---\n'
    }
    if (slash.format === 'check') {
      prompt += `TOPSHIRIQ: o'quvchining javobini tekshir. Avval to'g'ri yoki noto'g'ri ekanini `
        + `ayt, so'ng xato AYNAN qayerda ekanini ko'rsat va to'g'ri javobni ber. `
        + `Qisqa izoh qo'sh.\n`
    }

    if (slash.format === 'simple') {
      prompt += `TOPSHIRIQ: mavzuni juda sodda tilda tushuntir. Hayotiy o'xshatish va bitta `
        + `qisqa misol keltir, oxirida bitta tekshiruv savoli ber.\n`
    }

    if (slash.format === 'quiz') {
      prompt += `TOPSHIRIQ: quyidagi mavzudan ${slash.quizCount ?? 5} ta quiz bloki yarat.\n`
    } else if (slash.format === 'notebook') {
      prompt += 'TOPSHIRIQ: javobni daftarga aynan ko\'chiriladigan formatda ber.\n'
    }
    if (slash.translate) {
      prompt += `TARJIMA: ${slash.translate.from} → ${slash.translate.to}\n`
    }
    prompt += `SAVOL: ${question}`

    const raw = await generate({
      userId,
      model: MODELS.answer,
      system,
      prompt,
      json: true,
      media: body.image ? [body.image] : undefined,
    })

    /* ---- [6] parse, with one repair attempt ---------------------- */
    let parsed = safeParse(raw)
    if (!parsed) {
      const retry = await generate({
        userId, model: MODELS.answer,
        system: 'Faqat to\'g\'ri JSON qaytar, boshqa hech narsa.',
        prompt: `Quyidagini to'g'ri JSON ga aylantir:\n${raw.slice(0, 3000)}`,
        json: true,
      })
      parsed = safeParse(retry)
    }
    if (!parsed) {
      parsed = {
        subject: route.subject, topic: '',
        blocks: [{ type: 'note', text: raw.slice(0, 1200) }],
        citations: [], stickers: [], confidence: 0.2, followups: [],
      }
    }

    // Never let the model invent pages we didn't retrieve.
    const validPages = new Set(chunks.map((c) => c.page_number))
    const citations = (parsed.citations ?? []).filter(
      (c: { page?: number }) => !hasSource || (c.page != null && validPages.has(c.page))
    )

    /* ---- [7] persist + cache ------------------------------------- */
    const saved = await persist(
      userId, chatId, parsed.blocks, MODELS.answer, started,
      { subject: parsed.subject, sourceId: chunks[0]?.source_id ?? null, sourceMode }
    )

    if (citations.length && saved.messageId) {
      await admin.from('message_citations').insert(
        citations.map((c: { page: number; quote?: string; ref?: string }) => ({
          message_id: saved.messageId,
          source_id: chunks[0]?.source_id ?? null,
          page_number: c.page,
          quote: c.quote ?? null,
          ref: c.ref ?? null,
        }))
      )
    }

    if (questionEmbedding && parsed.confidence >= 0.6) {
      await admin.from('answer_cache').insert({
        user_id: userId,
        source_id: body.lockedSourceIds?.[0] ?? body.lockedSourceId ?? null,
        question,
        question_embedding: questionEmbedding,
        answer_blocks: parsed.blocks,
      })
    }

    await admin.from('activity_events').insert({
      user_id: userId,
      kind: 'chat_message',
      chat_id: chatId,
      project_id: null,
      points: 2,
      metadata: { subject: parsed.subject, sourceMode },
    }).then(() => undefined, () => undefined)

    res.json({
      ...saved,
      chatId,
      subject: parsed.subject,
      topic: parsed.topic,
      citations,
      stickers: parsed.stickers ?? [],
      followups: parsed.followups ?? [],
      confidence: parsed.confidence,
      sourceMode,
      pagesUsed: [...validPages].sort((a, b) => a - b),
      quotaPercent: await quotaPercent(userId),
    })
  } catch (e) {
    next(e)
  }
})

/* --------------------------- helpers ------------------------------ */

interface Parsed {
  subject: string
  topic: string
  blocks: unknown[]
  citations?: { page: number; quote?: string; ref?: string }[]
  stickers?: string[]
  confidence: number
  followups?: string[]
}

function safeParse(raw: string): Parsed | null {
  try {
    const o = JSON.parse(stripFences(raw)) as Parsed
    return Array.isArray(o.blocks) && o.blocks.length > 0 ? o : null
  } catch {
    return null
  }
}

async function persist(
  userId: string,
  chatId: string,
  blocks: unknown,
  model: string,
  started: number,
  meta?: { subject?: string; sourceId?: string | null; sourceMode?: string }
) {
  const { data } = await admin
    .from('messages')
    .insert({
      chat_id: chatId, user_id: userId, role: 'assistant',
      blocks, model_used: model, latency_ms: Date.now() - started,
      detected_subject: meta?.subject ?? null,
      used_source_id: meta?.sourceId ?? null,
      source_mode: meta?.sourceMode ?? 'none',
    })
    .select('id')
    .single()

  await admin.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId)
  return { messageId: data?.id ?? null, blocks, latencyMs: Date.now() - started }
}

/* ---- chat history ------------------------------------------------ */

chatRouter.get('/list', requireAuth, async (req, res, next) => {
  try {
    const { data } = await admin
      .from('chats')
      .select('id, title, updated_at, pinned, project_id, archived')
      .eq('user_id', req.userId!)
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(100)
    res.json({ chats: data ?? [] })
  } catch (e) { next(e) }
})

chatRouter.get('/:chatId', requireAuth, async (req, res, next) => {
  try {
    const { data } = await admin
      .from('messages')
      .select('id, role, content, blocks, detected_subject, source_mode, created_at')
      .eq('chat_id', req.params.chatId).eq('user_id', req.userId!)
      .order('created_at', { ascending: true })
    res.json({ messages: data ?? [] })
  } catch (e) { next(e) }
})

/* ---- rename / delete -------------------------------------------------
   Additive routes. No existing request or response schema is touched. */

chatRouter.patch('/:chatId', requireAuth, async (req, res, next) => {
  try {
    const patch = z.object({
      title: z.string().min(1).max(120).optional(),
      pinned: z.boolean().optional(),
      archived: z.boolean().optional(),
      draft: z.string().max(4000).nullable().optional(),
      project_id: z.string().uuid().nullable().optional(),
    }).parse(req.body)

    const { error } = await admin
      .from('chats')
      .update(patch)
      .eq('id', req.params.chatId)
      .eq('user_id', req.userId!)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})

chatRouter.delete('/:chatId', requireAuth, async (req, res, next) => {
  try {
    // messages + citations cascade via the schema's ON DELETE CASCADE.
    const { error } = await admin
      .from('chats')
      .delete()
      .eq('id', req.params.chatId)
      .eq('user_id', req.userId!)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* ---- search across titles and message bodies ------------------------ */
chatRouter.get('/search/:query', requireAuth, async (req, res, next) => {
  try {
    const q = (req.params.query ?? '').trim()
    if (q.length < 2) return res.json({ results: [] })
    const { data, error } = await admin.rpc('search_chats', {
      p_user_id: req.userId!, p_query: q, p_limit: 30,
    })
    if (error) throw error
    res.json({ results: data ?? [] })
  } catch (e) { next(e) }
})
