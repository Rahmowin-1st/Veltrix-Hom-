import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { defaultAiRouter, type AiRouter } from './aiRouter.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

const titleSchema = z.string().trim().min(1).max(200)
const tagNameSchema = z.string().trim().min(1).max(64)
const conversationIdSchema = z.string().uuid()
const tagIdSchema = z.string().uuid()

export const historyQuerySchema = z.object({
  view: z.enum(['active', 'archived', 'all']).default('active'),
  tagId: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).transform(value => ({
  view: value.view,
  tagIds: value.tagId === undefined ? [] : (Array.isArray(value.tagId) ? value.tagId : [value.tagId]).map(id => tagIdSchema.parse(id)),
  limit: value.limit,
}))

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  includeArchived: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const pinInputSchema = z.object({
  pinned: z.boolean(),
  pinOrder: z.number().int().min(0).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.pinned && value.pinOrder !== undefined && value.pinOrder !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pinOrder'], message: 'Unpinned conversations cannot keep a pin order.' })
  }
})

export const archiveInputSchema = z.object({ archived: z.boolean() }).strict()
export const titleInputSchema = z.object({ title: titleSchema }).strict()
export const createTagInputSchema = z.object({ name: tagNameSchema }).strict()
export const attachTagInputSchema = z.object({ tagId: tagIdSchema }).strict()

export function deterministicConversationTitle(prompt: string, answer = '') {
  const source = `${prompt} ${answer}`
    .replace(/[`*_>#\[\](){}]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[!?;:,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!source) return 'New Conversation'
  const words = source.split(' ').filter(Boolean).slice(0, 8)
  const candidate = words.join(' ').replace(/[.!?\-–—]+$/g, '').trim()
  if (!candidate) return 'New Conversation'
  return candidate.length <= 72 ? candidate : `${candidate.slice(0, 69).trimEnd()}…`
}

export function sanitizeGeneratedConversationTitle(raw: string) {
  const first = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean) ?? ''
  const cleaned = first
    .replace(/^\s*(?:title\s*:\s*)/i, '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69).trimEnd()}…`
}

async function applyAutoTitle(id: string, conversationId: string, title: string) {
  const { data, error } = await admin.rpc('vh_apply_auto_conversation_title', {
    p_account_id: id,
    p_conversation_id: conversationId,
    p_title: title,
  })
  if (error) throw error
  return z.object({ applied: z.boolean(), titleSource: z.enum(['AUTO', 'USER']) }).passthrough().parse(data)
}

export async function runFirstTurnTitleJob(input: {
  accountId: string
  conversationId: string
  prompt: string
  answer: string
  ai?: AiRouter
}) {
  try {
    const { data: conversation, error: conversationError } = await admin.from('vh_conversations')
      .select('id,title,title_source')
      .eq('id', input.conversationId)
      .eq('account_id', input.accountId)
      .is('trashed_at', null)
      .maybeSingle()
    if (conversationError) throw conversationError
    if (!conversation || conversation.title_source === 'USER') return { attempted: false, reason: 'USER_TITLE' as const }

    const { count, error: countError } = await admin.from('vh_conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', input.accountId)
      .eq('conversation_id', input.conversationId)
      .eq('role', 'USER')
    if (countError) throw countError
    if (Number(count ?? 0) !== 1) return { attempted: false, reason: 'NOT_FIRST_TURN' as const }

    const fallback = deterministicConversationTitle(input.prompt, input.answer)
    const fallbackResult = await applyAutoTitle(input.accountId, input.conversationId, fallback)
    if (fallbackResult.titleSource === 'USER') return { attempted: false, reason: 'USER_TITLE' as const }

    try {
      const result = await (input.ai ?? defaultAiRouter).generate({
        taskClass: 'fast',
        prompt: `User message:\n${input.prompt}\n\nAssistant answer:\n${input.answer.slice(0, 1200)}`,
        system: 'Return one concise conversation title only. Maximum 8 words. No quotes, markdown, labels, punctuation-only output, or explanation.',
      })
      const generated = sanitizeGeneratedConversationTitle(result.text)
      if (generated) await applyAutoTitle(input.accountId, input.conversationId, generated)
      return { attempted: true, fallback, generated }
    } catch (aiError) {
      console.warn('[vh-v1-part3-title]', {
        conversationId: input.conversationId,
        phase: 'ai_title',
        errorClass: aiError instanceof Error ? aiError.name : 'UnknownError',
      })
      return { attempted: true, fallback, generated: null }
    }
  } catch (error) {
    console.error('[vh-v1-part3-title]', {
      conversationId: input.conversationId,
      phase: 'title_job',
      errorClass: error instanceof Error ? error.name : 'UnknownError',
    })
    return { attempted: false, reason: 'TITLE_JOB_FAILED' as const }
  }
}

function rpcDomainError(error: unknown): never {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : String(error)
  if (message.includes('conversation_not_found')) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.')
  if (message.includes('conversation_tag_not_found')) throw new ApiError(404, 'CONVERSATION_TAG_NOT_FOUND', 'Conversation tag was not found.')
  if (message.includes('default_tag_immutable')) throw new ApiError(409, 'DEFAULT_TAG_IMMUTABLE', 'Default tags cannot be renamed or deleted.')
  if (message.includes('conversation_tag_name_conflict')) throw new ApiError(409, 'CONVERSATION_TAG_NAME_CONFLICT', 'A tag with that name already exists.')
  if (message.includes('archived_conversation_cannot_pin')) throw new ApiError(409, 'ARCHIVED_CONVERSATION_CANNOT_PIN', 'Restore an archived conversation before pinning it.')
  if (message.includes('conversation_title_invalid') || message.includes('conversation_tag_invalid') || message.includes('pin_order_invalid')) {
    throw new ApiError(400, 'CONVERSATION_METADATA_INVALID', 'Conversation metadata is invalid.')
  }
  throw error
}

router.get('/conversations/history', async (req, res, next) => {
  try {
    const id = accountId(req)
    const query = historyQuerySchema.parse(req.query)
    const { data, error } = await admin.rpc('vh_list_conversation_history', {
      p_account_id: id,
      p_view: query.view,
      p_tag_ids: query.tagIds,
      p_limit: query.limit,
    })
    if (error) rpcDomainError(error)
    res.json({ view: query.view, tagIds: query.tagIds, conversations: data ?? [] })
  } catch (error) { next(error) }
})

router.get('/conversations/search', async (req, res, next) => {
  try {
    const id = accountId(req)
    const query = searchQuerySchema.parse(req.query)
    const { data, error } = await admin.rpc('vh_search_conversations', {
      p_account_id: id,
      p_query: query.q,
      p_include_archived: query.includeArchived,
      p_limit: query.limit,
    })
    if (error) rpcDomainError(error)
    res.json({ query: query.q, includeArchived: query.includeArchived, hits: data ?? [] })
  } catch (error) { next(error) }
})

router.get('/conversations/tags', async (req, res, next) => {
  try {
    const id = accountId(req)
    const { error: ensureError } = await admin.rpc('vh_ensure_conversation_default_tags', { p_account_id: id })
    if (ensureError) rpcDomainError(ensureError)
    const { data, error } = await admin.from('vh_conversation_tags')
      .select('id,name,is_default,catalog_key,created_at,updated_at')
      .eq('account_id', id)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })
      .limit(200)
    if (error) throw error
    res.json({ tags: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/conversations/tags', async (req, res, next) => {
  try {
    const id = accountId(req)
    const input = createTagInputSchema.parse(req.body)
    const { data, error } = await admin.rpc('vh_create_conversation_tag', { p_account_id: id, p_name: input.name })
    if (error) rpcDomainError(error)
    res.status(201).json({ tagId: z.string().uuid().parse(data) })
  } catch (error) { next(error) }
})

router.patch('/conversations/tags/:tagId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const tagId = tagIdSchema.parse(req.params.tagId)
    const input = createTagInputSchema.parse(req.body)
    const { data, error } = await admin.rpc('vh_rename_conversation_tag', { p_account_id: id, p_tag_id: tagId, p_name: input.name })
    if (error) rpcDomainError(error)
    res.json(data)
  } catch (error) { next(error) }
})

router.delete('/conversations/tags/:tagId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const tagId = tagIdSchema.parse(req.params.tagId)
    const { error } = await admin.rpc('vh_delete_conversation_tag', { p_account_id: id, p_tag_id: tagId })
    if (error) rpcDomainError(error)
    res.status(204).end()
  } catch (error) { next(error) }
})

router.patch('/conversations/:conversationId/title', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = conversationIdSchema.parse(req.params.conversationId)
    const input = titleInputSchema.parse(req.body)
    const { data, error } = await admin.rpc('vh_set_conversation_title_user', {
      p_account_id: id, p_conversation_id: conversationId, p_title: input.title,
    })
    if (error) rpcDomainError(error)
    res.json(data)
  } catch (error) { next(error) }
})

router.post('/conversations/:conversationId/tags', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = conversationIdSchema.parse(req.params.conversationId)
    const input = attachTagInputSchema.parse(req.body)
    const { error } = await admin.rpc('vh_attach_conversation_tag', {
      p_account_id: id, p_conversation_id: conversationId, p_tag_id: input.tagId,
    })
    if (error) rpcDomainError(error)
    res.status(204).end()
  } catch (error) { next(error) }
})

router.delete('/conversations/:conversationId/tags/:tagId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = conversationIdSchema.parse(req.params.conversationId)
    const tagId = tagIdSchema.parse(req.params.tagId)
    const { error } = await admin.rpc('vh_detach_conversation_tag', {
      p_account_id: id, p_conversation_id: conversationId, p_tag_id: tagId,
    })
    if (error) rpcDomainError(error)
    res.status(204).end()
  } catch (error) { next(error) }
})

router.patch('/conversations/:conversationId/pin', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = conversationIdSchema.parse(req.params.conversationId)
    const input = pinInputSchema.parse(req.body)
    const { data, error } = await admin.rpc('vh_set_conversation_pin', {
      p_account_id: id, p_conversation_id: conversationId, p_pinned: input.pinned, p_pin_order: input.pinOrder ?? null,
    })
    if (error) rpcDomainError(error)
    res.json(data)
  } catch (error) { next(error) }
})

router.patch('/conversations/:conversationId/archive', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = conversationIdSchema.parse(req.params.conversationId)
    const input = archiveInputSchema.parse(req.body)
    const { data, error } = await admin.rpc('vh_set_conversation_archive', {
      p_account_id: id, p_conversation_id: conversationId, p_archived: input.archived,
    })
    if (error) rpcDomainError(error)
    res.json(data)
  } catch (error) { next(error) }
})

export { router as v1Part3HistoryRouter }
