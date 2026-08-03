import { Router } from 'express'
import { z } from 'zod'
import { CACHE_THRESHOLD, MODELS } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { admin } from '../services/supabase.js'
import { embedOne, generate, quotaPercent } from '../services/gemini.js'
import { parseSlashCommands, routeMessage, stripFences } from '../services/subjectRouter.js'
import { buildSystemPrompt, REFUSAL_BLOCKS } from '../prompts/system.js'

export const chatRouter = Router()

const Media = z.object({
  mimeType: z.string().min(3).max(120),
  data: z.string().min(1).max(30_000_000),
  name: z.string().max(240).optional(),
})
const Body = z.object({
  chatId: z.string().uuid().nullable().optional(),
  text: z.string().min(1).max(8000),
  lockedSourceId: z.string().uuid().nullable().optional(),
  lockedSourceIds: z.array(z.string().uuid()).max(8).optional(),
  image: Media.nullable().optional(), // legacy client compatibility
  media: Media.nullable().optional(),
  talentId: z.string().uuid().nullable().optional(),
})

interface Chunk {
  id?: string
  source_id: string
  source_title?: string
  page_number: number
  content: string
  heading?: string | null
}

chatRouter.post('/', requireAuth, async (req, res, next) => {
  const started = Date.now()
  try {
    const userId = req.userId!
    const body = Body.parse(req.body)
    const slash = parseSlashCommands(body.text)
    const question = slash.cleanText || body.text
    const media = body.media ?? body.image ?? null

    const [{ data: profile }, { data: settings }] = await Promise.all([
      admin.from('profiles').select('grade,school_language').eq('id', userId).single(),
      admin.from('user_settings').select('*').eq('user_id', userId).single(),
    ])
    const answerLength = slash.answerLength ?? settings?.answer_length ?? 'normal'

    let chatId = body.chatId ?? null
    if (chatId) {
      const { data: ownedChat } = await admin.from('chats').select('id').eq('id', chatId).eq('user_id', userId).maybeSingle()
      if (!ownedChat) return res.status(404).json({ message: 'Chat topilmadi yoki bu akkauntga tegishli emas.' })
    } else {
      const { data, error } = await admin.from('chats').insert({ user_id: userId, title: question.replace(/\s+/g, ' ').trim().slice(0, 60), skill_id: body.talentId ?? null }).select('id').single()
      if (error) throw error
      chatId = data?.id ?? null
    }
    if (!chatId) throw new Error('Chat yaratilmadi')

    const { error: userMessageError } = await admin.from('messages').insert({
      chat_id: chatId,
      user_id: userId,
      role: 'user',
      content: body.text,
      attachments: media ? [{ name: media.name ?? 'biriktirma', mimeType: media.mimeType }] : null,
    })
    if (userMessageError) throw userMessageError

    let talent: { id: string; name: string; description: string | null; instructions: string | null; subject_slug: string | null } | null = null
    if (body.talentId) {
      const { data } = await admin.from('skills').select('id,name,description,instructions,subject_slug').eq('id', body.talentId).eq('user_id', userId).maybeSingle()
      talent = data
      if (!talent) return res.status(400).json({ message: 'Tanlangan Talent topilmadi.' })
      await admin.from('chats').update({ skill_id: talent.id }).eq('id', chatId).eq('user_id', userId)
      await admin.from('skills').update({ use_count: (await currentTalentUseCount(talent.id, userId)) + 1, updated_at: new Date().toISOString() }).eq('id', talent.id).eq('user_id', userId)
    }

    const route = await routeMessage(userId, question)
    if (route.intent === 'off_topic' && !talent) {
      const saved = await persist(userId, chatId, REFUSAL_BLOCKS, 'guard', started)
      return res.json({ ...saved, chatId, sourceMode: 'none', subject: null })
    }
    const subjectSlug = talent?.subject_slug ?? slash.subject ?? route.subject_slug

    let sourceIds: string[] = []
    let selectedSourceMeta: Array<{ id: string; title: string; status: string; page_count: number | null; storage_path: string | null; error_message: string | null; processing_warning: string | null }> = []
    let sourceMode: 'locked' | 'auto' | 'none' | 'not_found' = 'none'

    // New clients always send lockedSourceIds, including an empty array when
    // the user explicitly removes every source. Older clients may omit it;
    // in that case restore the account-synced source context of this chat.
    const sourceSelectionProvided = body.lockedSourceIds !== undefined || body.lockedSourceId !== undefined
    let requestedSourceIds = body.lockedSourceIds?.length
      ? [...new Set(body.lockedSourceIds)]
      : body.lockedSourceId ? [body.lockedSourceId] : []

    if (!sourceSelectionProvided) {
      const { data: remembered, error: rememberedError } = await admin
        .from('chat_sources')
        .select('source_id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (rememberedError) throw rememberedError
      requestedSourceIds = (remembered ?? []).map((row) => row.source_id)
    }

    if (requestedSourceIds.length) {
      const { data: ownedSources, error } = await admin.from('sources').select('id,title,status,page_count,storage_path,error_message,processing_warning').eq('user_id', userId).in('id', requestedSourceIds)
      if (error) throw error
      if (!ownedSources?.length) return res.status(404).json({ message: 'Tanlangan manba bu akkauntda topilmadi.' })
      const unavailable = ownedSources.filter((s) => s.status !== 'ready')
      if (unavailable.length) {
        const src = unavailable[0]!
        return res.status(409).json({ message: src.status === 'failed' ? `“${src.title}” qayta ishlanmadi: ${src.error_message ?? 'noma’lum xato'}. Manbani qayta ishlang.` : `“${src.title}” hali tayyorlanmoqda (${src.status}).` })
      }
      // Preserve the user's requested order even though SQL IN does not.
      const sourceById = new Map(ownedSources.map((source) => [source.id, source]))
      selectedSourceMeta = requestedSourceIds.map((id) => sourceById.get(id)).filter(Boolean) as typeof selectedSourceMeta
      sourceIds = selectedSourceMeta.map((source) => source.id)
      sourceMode = 'locked'
    } else if (settings?.auto_source !== false && route.needs_source) {
      let subjectId: string | null = null
      if (subjectSlug) {
        const { data } = await admin.from('subjects').select('id').or(`user_id.eq.${userId},is_system.eq.true`).eq('slug', subjectSlug).limit(1).maybeSingle()
        subjectId = data?.id ?? null
      }
      let query = admin.from('sources').select('id').eq('user_id', userId).eq('status', 'ready').eq('is_active', true)
      if (subjectId) query = query.eq('subject_id', subjectId)
      const { data } = await query.limit(4)
      if (data?.length) { sourceIds = data.map((s) => s.id); sourceMode = 'auto' }
    }

    // Persist manual source context per chat and account. This is what makes
    // the same source selection reappear on another device after sign-in.
    if (sourceSelectionProvided) {
      const { error: clearSourceError } = await admin.from('chat_sources').delete().eq('chat_id', chatId).eq('user_id', userId)
      if (clearSourceError) throw clearSourceError
      if (sourceIds.length) {
        const { error: linkError } = await admin.from('chat_sources').insert(
          sourceIds.map((sourceId) => ({ chat_id: chatId, source_id: sourceId, user_id: userId }))
        )
        if (linkError) throw linkError
      }
      const { error: contextError } = await admin.from('chats').update({
        locked_source_id: sourceIds[0] ?? null,
        skill_id: talent?.id ?? body.talentId ?? null,
      }).eq('id', chatId).eq('user_id', userId)
      if (contextError) throw contextError
    }

    // Create the query vector only after the real account-owned source context
    // has been resolved. This prevents cached answers from a different source
    // being served before manual/automatic source selection is known.
    let questionEmbedding: number[] | null = null
    try { questionEmbedding = await embedOne(question, 'query') } catch { /* page/keyword/direct-PDF fallback remains available */ }

    const cacheAllowed = !media && !talent && sourceIds.length <= 1
    if (cacheAllowed && questionEmbedding) {
      try {
        const { data: cached } = await admin.rpc('match_answer_cache', {
          p_user_id: userId,
          p_embedding: questionEmbedding,
          p_source_id: sourceIds[0] ?? null,
          p_threshold: CACHE_THRESHOLD,
        })
        const hit = Array.isArray(cached) ? cached[0] : null
        if (hit?.answer_blocks) {
          const saved = await persist(userId, chatId, hit.answer_blocks, 'cache', started, {
            subject: route.subject,
            sourceId: sourceIds[0] ?? null,
            sourceMode,
          })
          return res.json({ ...saved, cached: true, chatId, sourceMode, subject: route.subject })
        }
      } catch { /* cache is an optimisation, never a hard dependency */ }
    }

    const pageHint = slash.page ?? route.page_hint ?? extractPage(question)
    let chunks: Chunk[] = []
    if (sourceIds.length && pageHint) chunks = await getPageContext(sourceIds, pageHint)
    if (sourceIds.length && chunks.length === 0 && questionEmbedding) chunks = await getVectorContext(userId, sourceIds, question, questionEmbedding)
    if (sourceIds.length && chunks.length === 0) chunks = await getKeywordContext(sourceIds, question)

    // Scanned/image PDFs can have no text layer. In strict manual-source mode,
    // send the original private PDF directly to Gemini instead of returning a
    // generic server error. Total inline documents are capped at 20 MB.
    const sourcePdfMedia: Array<{ mimeType: string; data: string }> = []
    let directPdfBytes = 0
    if (requestedSourceIds.length && (chunks.length === 0 || pageHint !== null)) {
      for (const src of selectedSourceMeta) {
        if (!src.storage_path) continue
        const { data: file, error: downloadError } = await admin.storage.from('sources').download(src.storage_path)
        if (downloadError || !file) continue
        const bytes = Buffer.from(await file.arrayBuffer())
        if (directPdfBytes + bytes.length > 20 * 1024 * 1024) break
        directPdfBytes += bytes.length
        sourcePdfMedia.push({ mimeType: 'application/pdf', data: bytes.toString('base64') })
      }
    }

    const hasSource = chunks.length > 0 || sourcePdfMedia.length > 0
    if (sourceIds.length && !hasSource) sourceMode = 'not_found'
    if (sourceIds.length) await admin.from('sources').update({ last_used_at: new Date().toISOString() }).in('id', sourceIds).eq('user_id', userId)

    if (requestedSourceIds.length && !hasSource) {
      const blocks = [{ type: 'source_not_found', searched: pageHint ? `${pageHint}-bet va yaqin betlar` : question.slice(0, 120), nearby: [] }]
      const saved = await persist(userId, chatId, blocks, 'source-guard', started, { subject: route.subject, sourceId: sourceIds[0] ?? null, sourceMode: 'not_found' })
      return res.json({ ...saved, chatId, subject: route.subject, citations: [], sourceMode: 'not_found', pagesUsed: [] })
    }

    let system = buildSystemPrompt({
      grade: profile?.grade ?? null,
      language: profile?.school_language ?? 'uz',
      subjectSlug,
      answerLength,
      teacherMode: settings?.teacher_mode ?? false,
      stickerLevel: settings?.sticker_level ?? 'normal',
      citationRequired: settings?.citation_required ?? true,
      hasSource,
    })
    if (talent) {
      system += `\n\n## ACTIVE TALENT — QAT'IY DOMAIN LOCK\nNomi: ${talent.name}\nFan/mavzu: ${talent.subject_slug ?? 'umumiy'}\n${talent.instructions ?? talent.description ?? ''}\nBarcha matn, rasm, audio, fayl va manbani shu Talent doirasida talqin qil. Mavzu tashqarisidagi so‘rovni aralashtirma; mos kelmasa aniq ayt. Fakt uydirma.`
    }

    let prompt = ''
    if (hasSource) {
      const sourceNames = selectedSourceMeta.map((source) => source.title).filter(Boolean)
      prompt += `SOURCE_CONTEXT (faqat haqiqiy manba):\n`
      if (sourceNames.length) prompt += `Ulangan manbalar: ${sourceNames.join(', ')}\n`
      for (const c of chunks) prompt += `\n[Manba: ${c.source_title ?? c.source_id} · ${c.page_number}-bet${c.heading ? ` · ${c.heading}` : ''}]\n${c.content}\n`
      if (pageHint) prompt += `\nFOYDALANUVCHI ${pageHint}-BETNI AYTDI. PDF ichidagi BOSMA BET RAQAMINI PDF indeksidan ustun qo‘y. Muqova sabab indeks siljishi mumkin. ${pageHint}-betda uyga vazifa bo‘lmasa, yaqin betlardan haqiqiy uyga vazifa joyini top, o‘sha betni aniq ayt va shuni bajar. Hech qachon betni uydirma.\n`
      prompt += '\n---\n'
    }
    if (slash.format === 'check') prompt += `TOPSHIRIQ: o‘quvchining javobini tekshir; xato joyini va to‘g‘ri javobni aniq ko‘rsat.\n`
    if (slash.format === 'simple') prompt += `TOPSHIRIQ: juda sodda tushuntir; hayotiy o‘xshatish, misol va bitta tekshiruv savoli ber.\n`
    if (slash.format === 'quiz') prompt += `TOPSHIRIQ: ${slash.quizCount ?? 5} ta quiz bloki yarat.\n`
    else if (slash.format === 'notebook') prompt += `TOPSHIRIQ: daftarga ko‘chirishga tayyor formatda ber.\n`
    if (slash.translate) prompt += `TARJIMA: ${slash.translate.from} → ${slash.translate.to}\n`
    prompt += `SAVOL: ${question}`

    const raw = await generate({
      userId,
      model: MODELS.answer,
      system,
      prompt,
      json: true,
      media: [...sourcePdfMedia, ...(media ? [{ mimeType: media.mimeType, data: media.data }] : [])],
    })

    let parsed = safeParse(raw)
    if (!parsed) {
      const retry = await generate({ userId, model: MODELS.answer, system: 'Faqat to‘g‘ri JSON qaytar.', prompt: `Quyidagini JSON formatga tuzat:\n${raw.slice(0, 5000)}`, json: true })
      parsed = safeParse(retry)
    }
    if (!parsed) parsed = { subject: route.subject, topic: '', blocks: [{ type: 'note', text: raw.slice(0, 3000) }], citations: [], stickers: [], confidence: 0.2, followups: [] }

    const pageToSource = new Map(chunks.map((c) => [c.page_number, c.source_id]))
    const validPages = new Set(chunks.map((c) => c.page_number))
    const maxDirectPdfPage = Math.max(0, ...selectedSourceMeta.map((s) => s.page_count ?? 0))
    const citations = (parsed.citations ?? []).filter((c) => {
      if (!hasSource) return true
      if (validPages.size) return validPages.has(c.page)
      return sourcePdfMedia.length > 0 && c.page > 0 && (!maxDirectPdfPage || c.page <= maxDirectPdfPage)
    })
    const usedPages = new Set(validPages.size ? [...validPages] : citations.map((citation) => citation.page))
    const primarySourceId = chunks[0]?.source_id ?? sourceIds[0] ?? null
    const saved = await persist(userId, chatId, parsed.blocks, MODELS.answer, started, { subject: parsed.subject, sourceId: primarySourceId, sourceMode })

    if (citations.length && saved.messageId) {
      const { error } = await admin.from('message_citations').insert(citations.map((c) => ({ message_id: saved.messageId, source_id: pageToSource.get(c.page) ?? primarySourceId, page_number: c.page, quote: c.quote ?? null, ref: c.ref ?? null })))
      if (error) console.error('[citation]', error)
    }
    if (cacheAllowed && questionEmbedding && parsed.confidence >= 0.6) {
      await admin.from('answer_cache').insert({ user_id: userId, source_id: sourceIds[0] ?? null, question, question_embedding: questionEmbedding, answer_blocks: parsed.blocks }).then(() => undefined, () => undefined)
    }
    await admin.from('activity_events').insert({ user_id: userId, kind: 'chat_message', chat_id: chatId, points: 2, metadata: { subject: parsed.subject, sourceMode, talentId: talent?.id ?? null } }).then(() => undefined, () => undefined)

    res.json({ ...saved, chatId, subject: parsed.subject, topic: parsed.topic, citations, stickers: parsed.stickers ?? [], followups: parsed.followups ?? [], confidence: parsed.confidence, sourceMode, pagesUsed: [...usedPages].sort((a,b)=>a-b), quotaPercent: await quotaPercent(userId) })
  } catch (e) { next(e) }
})

interface Parsed { subject: string; topic: string; blocks: unknown[]; citations?: { page: number; quote?: string; ref?: string }[]; stickers?: string[]; confidence: number; followups?: string[] }
function safeParse(raw: string): Parsed | null { try { const o = JSON.parse(stripFences(raw)) as Parsed; return Array.isArray(o.blocks) && o.blocks.length ? o : null } catch { return null } }

async function persist(userId: string, chatId: string, blocks: unknown, model: string, started: number, meta?: { subject?: string; sourceId?: string | null; sourceMode?: string }) {
  const content = blocksToText(blocks)
  const { data, error } = await admin.from('messages').insert({ chat_id: chatId, user_id: userId, role: 'assistant', content, blocks, model_used: model, latency_ms: Date.now()-started, detected_subject: meta?.subject ?? null, used_source_id: meta?.sourceId ?? null, source_mode: meta?.sourceMode ?? 'none' }).select('id').single()
  if (error) throw error
  const { error: chatError } = await admin.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId).eq('user_id', userId)
  if (chatError) throw chatError
  return { messageId: data?.id ?? null, blocks, latencyMs: Date.now()-started }
}

function blocksToText(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null
  const parts: string[] = []
  for (const block of blocks as Array<Record<string, unknown>>) {
    if (typeof block.text === 'string') parts.push(block.text)
    if (Array.isArray(block.items)) parts.push(block.items.map(String).join('\n'))
    if (typeof block.latex === 'string') parts.push(block.latex)
    if (typeof block.translated === 'string') parts.push(block.translated)
  }
  return parts.join('\n\n').slice(0, 12_000) || null
}
function extractPage(text: string): number | null { const m = text.match(/(?:^|\s)(\d{1,4})\s*(?:-|–)?\s*(?:bet|sahifa)/iu); return m?.[1] ? Number(m[1]) : null }
async function getPageContext(sourceIds: string[], page: number): Promise<Chunk[]> {
  const from = Math.max(1, page - 2), to = page + 1
  const { data: pages, error } = await admin.from('source_pages').select('source_id,page_number,text_content').in('source_id', sourceIds).gte('page_number', from).lte('page_number', to).order('page_number')
  if (error) throw error
  const { data: sources } = await admin.from('sources').select('id,title').in('id', sourceIds)
  const names = new Map<string, string>((sources ?? []).map((s) => [String(s.id), String(s.title)]))
  return (pages ?? []).filter((p) => (p.text_content ?? '').trim().length > 20).map((p) => ({ source_id: p.source_id, source_title: names.get(p.source_id), page_number: p.page_number, content: p.text_content.slice(0, 9000) }))
}
async function getVectorContext(userId: string, sourceIds: string[], question: string, embedding: number[]): Promise<Chunk[]> {
  const { data, error } = await admin.rpc('match_source_chunks', { p_user_id: userId, p_embedding: embedding, p_query_text: question, p_source_ids: sourceIds, p_page_from: null, p_page_to: null, p_match_count: 8 })
  if (error) return []
  const rows = (data as Chunk[]) ?? []
  const { data: sources } = await admin.from('sources').select('id,title').in('id', sourceIds)
  const names = new Map<string, string>((sources ?? []).map((s) => [String(s.id), String(s.title)]))
  return rows.map((r) => ({ ...r, source_title: names.get(r.source_id) }))
}
async function getKeywordContext(sourceIds: string[], question: string): Promise<Chunk[]> {
  const keyword = question.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu)?.find((w) => !['qilib','bering','masala','vazifa','ushbu','kitob'].includes(w))
  if (!keyword) return []
  const safe = keyword.replace(/[%_,]/g, '')
  const { data } = await admin.from('source_pages').select('source_id,page_number,text_content').in('source_id', sourceIds).ilike('text_content', `%${safe}%`).limit(8)
  const { data: sources } = await admin.from('sources').select('id,title').in('id', sourceIds)
  const names = new Map<string, string>((sources ?? []).map((s) => [String(s.id), String(s.title)]))
  return (data ?? []).map((p) => ({ source_id: p.source_id, source_title: names.get(p.source_id), page_number: p.page_number, content: p.text_content.slice(0, 7000) }))
}
async function currentTalentUseCount(id: string, userId: string): Promise<number> { const { data } = await admin.from('skills').select('use_count').eq('id', id).eq('user_id', userId).maybeSingle(); return data?.use_count ?? 0 }

chatRouter.get('/list', requireAuth, async (req, res, next) => { try { const { data, error } = await admin.from('chats').select('id,title,updated_at,pinned,project_id,archived,draft,skill_id,locked_source_id').eq('user_id', req.userId!).eq('archived', false).order('pinned', { ascending:false }).order('updated_at',{ascending:false}).limit(200); if(error)throw error; res.json({chats:data??[]}) } catch(e){next(e)} })
chatRouter.get('/search/:query', requireAuth, async (req,res,next)=>{ try{const q=(req.params.query??'').trim();if(q.length<2)return res.json({results:[]});const {data,error}=await admin.rpc('search_chats',{p_user_id:req.userId!,p_query:q,p_limit:30});if(error)throw error;res.json({results:data??[]})}catch(e){next(e)} })
chatRouter.get('/:chatId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!
    const [{ data: chat, error: chatError }, { data: messages, error: messageError }, { data: links, error: linkError }] = await Promise.all([
      admin.from('chats').select('id,title,updated_at,pinned,project_id,draft,skill_id,locked_source_id').eq('id', req.params.chatId).eq('user_id', userId).maybeSingle(),
      admin.from('messages').select('id,role,content,blocks,attachments,detected_subject,source_mode,created_at').eq('chat_id', req.params.chatId).eq('user_id', userId).order('created_at', { ascending: true }),
      admin.from('chat_sources').select('source_id').eq('chat_id', req.params.chatId).eq('user_id', userId).order('created_at', { ascending: true }),
    ])
    if (chatError) throw chatError
    if (!chat) return res.status(404).json({ message: 'Chat topilmadi yoki bu akkauntga tegishli emas.' })
    if (messageError) throw messageError
    if (linkError) throw linkError
    const sourceIds = (links ?? []).map((row) => row.source_id)
    if (!sourceIds.length && chat.locked_source_id) sourceIds.push(chat.locked_source_id)
    res.json({ chat, sourceIds, messages: messages ?? [] })
  } catch (e) { next(e) }
})
chatRouter.patch('/:chatId', requireAuth, async (req,res,next)=>{ try{const patch=z.object({title:z.string().min(1).max(120).optional(),pinned:z.boolean().optional(),archived:z.boolean().optional(),draft:z.string().max(8000).nullable().optional(),project_id:z.string().uuid().nullable().optional(),skill_id:z.string().uuid().nullable().optional(),locked_source_id:z.string().uuid().nullable().optional()}).parse(req.body);const {error}=await admin.from('chats').update(patch).eq('id',req.params.chatId).eq('user_id',req.userId!);if(error)throw error;res.json({ok:true})}catch(e){next(e)} })
chatRouter.delete('/:chatId', requireAuth, async (req,res,next)=>{ try{const {error}=await admin.from('chats').delete().eq('id',req.params.chatId).eq('user_id',req.userId!);if(error)throw error;res.json({ok:true})}catch(e){next(e)} })
