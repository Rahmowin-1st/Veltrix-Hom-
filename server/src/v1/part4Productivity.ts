import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { defaultAiRouter } from './aiRouter.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'

type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

const prioritySchema = z.enum(['LOW','NORMAL','HIGH','URGENT'])
const goalStateSchema = z.enum(['ACTIVE','PAUSED','COMPLETED','ARCHIVED'])
const todoStatusSchema = z.enum(['OPEN','IN_PROGRESS','COMPLETED','CANCELLED'])

const markSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bold') }), z.object({ kind: z.literal('italic') }), z.object({ kind: z.literal('underline') }),
  z.object({ kind: z.literal('strikethrough') }), z.object({ kind: z.literal('monospace') }),
  z.object({ kind: z.literal('color'), value: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ kind: z.literal('highlight'), value: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ kind: z.literal('font'), value: z.enum(['system','serif','rounded','mono']) }),
])
const runSchema = z.object({ text: z.string().max(40_000), marks: z.array(markSchema).max(20).optional() })
const runs = z.array(runSchema).max(500)
const refTypes = z.enum(['conversation','notebook','project','todo','goal'])

export const noteBlockSchema: z.ZodTypeAny = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ type: z.enum(['h1','h2','h3','paragraph']), runs }),
  z.object({ type: z.enum(['quote','callout']), runs, tone: z.enum(['info','success','warning','error','neutral']).optional() }),
  z.object({ type: z.enum(['bullet_list','number_list','check_list']), items: z.array(z.object({ runs, checked: z.boolean().optional() })).max(1000) }),
  z.object({ type: z.literal('collapsible'), title: runs, hidden: z.boolean().optional(), children: z.array(noteBlockSchema).max(500) }),
  z.object({ type: z.literal('section'), title: runs.optional(), children: z.array(noteBlockSchema).max(500) }),
  z.object({ type: z.literal('columns'), columns: z.array(z.object({ children: z.array(noteBlockSchema).max(500) })).min(2).max(4) }),
  z.object({ type: z.literal('divider') }),
  z.object({ type: z.literal('link'), label: runs, href: z.string().url().max(4096) }),
  z.object({ type: z.literal('table'), rows: z.array(z.array(z.string().max(10_000)).max(50)).max(500) }),
  z.object({ type: z.literal('code'), language: z.string().max(80).optional(), code: z.string().max(200_000) }),
  z.object({ type: z.literal('formula'), latex: z.string().max(20_000) }),
  z.object({ type: z.enum(['image','file','library_embed']), assetId: z.string().uuid(), caption: z.string().max(2000).optional() }),
  z.object({ type: z.literal('entity_reference'), entityType: refTypes, entityId: z.string().uuid(), label: z.string().max(1000).optional() }),
  z.object({ type: z.literal('citation'), sourceId: z.string().uuid().optional(), locator: z.string().max(2000).optional(), text: z.string().max(20_000) }),
  z.object({ type: z.literal('info_card'), title: z.string().max(1000), body: z.string().max(20_000), iconKey: z.string().max(120).optional() }),
  z.object({ type: z.literal('timeline'), events: z.array(z.object({ when: z.string().max(500), title: z.string().max(1000), details: z.string().max(10_000).optional() })).max(1000) }),
  z.object({ type: z.literal('map_embed'), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), label: z.string().max(1000).optional() }),
  z.object({ type: z.literal('concept_embed'), conceptKey: z.string().max(200), title: z.string().max(1000), summary: z.string().max(10_000).optional() }),
  z.object({ type: z.literal('template'), templateKey: z.string().max(200), fields: z.record(z.union([z.string().max(20_000),z.number(),z.boolean(),z.null()])).optional() }),
]))

export const noteDocumentSchema = z.array(noteBlockSchema).max(5000)
export function validateNoteDocument(value: unknown) {
  const blocks = noteDocumentSchema.parse(value)
  let count = 0
  const visit = (block: any, depth: number) => {
    if (depth > 12) throw new ApiError(422, 'NOTE_DEPTH_EXCEEDED', 'Note nesting is too deep.')
    count++
    if (count > 5000) throw new ApiError(422, 'NOTE_BLOCK_LIMIT_EXCEEDED', 'Note contains too many blocks.')
    if (Array.isArray(block.children)) for (const child of block.children) visit(child, depth + 1)
    if (Array.isArray(block.columns)) for (const col of block.columns) for (const child of col.children ?? []) visit(child, depth + 1)
  }
  for (const block of blocks) visit(block, 1)
  if (Buffer.byteLength(JSON.stringify(blocks), 'utf8') > 1024 * 1024) throw new ApiError(413, 'NOTE_PAYLOAD_TOO_LARGE', 'Note payload exceeds 1 MiB.')
  return blocks
}

function parseAiJson(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(clean) as unknown } catch { throw new ApiError(502, 'AI_PROPOSAL_INVALID', 'AI returned an invalid proposal.') }
}

const router = Router()
router.use(canonicalAuth)

router.post('/goals', async (req, res, next) => {
  try {
    const input = z.object({ title: z.string().trim().min(1).max(240), description: z.string().max(10_000).optional(), deadline: z.string().datetime({ offset: true }).nullable().optional(), priority: prioritySchema.default('NORMAL'), parentGoalId: z.string().uuid().nullable().optional(), weight: z.number().nonnegative().default(1), pinned: z.boolean().default(false) }).parse(req.body)
    const { data, error } = await admin.from('vh_goals').insert({ account_id: accountId(req), title: input.title, description: input.description ?? null, deadline: input.deadline ?? null, priority: input.priority, parent_goal_id: input.parentGoalId ?? null, weight: input.weight, pinned: input.pinned }).select('*').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})

router.get('/goals', async (req, res, next) => {
  try {
    const owner = accountId(req); const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
    let q = admin.from('vh_goals').select('*').eq('account_id', owner).is('trashed_at', null)
    if (typeof req.query.state === 'string') q = q.eq('state', goalStateSchema.parse(req.query.state))
    const { data, error } = await q.order('pinned', { ascending: false }).order('manual_order').order('updated_at', { ascending: false }).limit(limit)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.patch('/goals/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = z.object({ expectedRevision: z.number().int().positive(), patch: z.record(z.unknown()) }).parse(req.body)
    const { data, error } = await admin.rpc('vh_patch_goal', { p_account_id: accountId(req), p_goal_id: id, p_expected_revision: body.expectedRevision, p_patch: body.patch })
    if (error) throw error
    res.json({ revision: data })
  } catch (error) { next(error) }
})

router.post('/goals/:id/milestones', async (req, res, next) => {
  try {
    const goalId = z.string().uuid().parse(req.params.id); const owner = accountId(req)
    const input = z.object({ title: z.string().trim().min(1).max(240), weight: z.number().nonnegative().default(1), manualOrder: z.number().int().default(0) }).parse(req.body)
    const { data: goal, error: ge } = await admin.from('vh_goals').select('id').eq('account_id', owner).eq('id', goalId).is('trashed_at', null).single(); if (ge) throw ge
    const { data, error } = await admin.from('vh_goal_milestones').insert({ account_id: owner, goal_id: goal.id, title: input.title, weight: input.weight, manual_order: input.manualOrder }).select('*').single(); if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})

router.post('/goals/:goalId/todos/:todoId', async (req, res, next) => {
  try {
    const owner = accountId(req); const goalId = z.string().uuid().parse(req.params.goalId); const todoId = z.string().uuid().parse(req.params.todoId); const weight = z.object({ weight: z.number().nonnegative().default(1) }).parse(req.body ?? {}).weight
    const [{ data: g, error: ge }, { data: t, error: te }] = await Promise.all([admin.from('vh_goals').select('id').eq('account_id', owner).eq('id', goalId).is('trashed_at', null).single(), admin.from('vh_todos').select('id').eq('account_id', owner).eq('id', todoId).is('trashed_at', null).single()]); if (ge) throw ge; if (te) throw te
    const { error } = await admin.from('vh_goal_todo_links').upsert({ account_id: owner, goal_id: g.id, todo_id: t.id, weight }, { onConflict: 'goal_id,todo_id' }); if (error) throw error
    const { data: progress, error: pe } = await admin.rpc('vh_recompute_goal_progress', { p_account_id: owner, p_goal_id: goalId }); if (pe) throw pe
    res.json({ linked: true, progressBasisPoints: progress })
  } catch (error) { next(error) }
})

router.post('/todos', async (req, res, next) => {
  try {
    const input = z.object({ title: z.string().trim().min(1).max(240), description: z.string().max(10_000).optional(), deadline: z.string().datetime({ offset: true }).nullable().optional(), priority: prioritySchema.default('NORMAL'), pinned: z.boolean().default(false), manualOrder: z.number().int().default(0) }).parse(req.body)
    const { data, error } = await admin.from('vh_todos').insert({ account_id: accountId(req), title: input.title, description: input.description ?? null, deadline: input.deadline ?? null, priority: input.priority, pinned: input.pinned, manual_order: input.manualOrder }).select('*').single(); if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})

router.get('/todos', async (req, res, next) => {
  try {
    const owner = accountId(req); const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
    let q = admin.from('vh_todos').select('*').eq('account_id', owner).is('trashed_at', null)
    if (typeof req.query.status === 'string') q = q.eq('status', todoStatusSchema.parse(req.query.status))
    const { data, error } = await q.order('pinned', { ascending: false }).order('manual_order').order('deadline', { ascending: true, nullsFirst: false }).limit(limit); if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.patch('/todos/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const body = z.object({ expectedRevision: z.number().int().positive(), patch: z.record(z.unknown()) }).parse(req.body)
    const { data, error } = await admin.rpc('vh_patch_todo', { p_account_id: accountId(req), p_todo_id: id, p_expected_revision: body.expectedRevision, p_patch: body.patch }); if (error) throw error
    res.json({ revision: data })
  } catch (error) { next(error) }
})

router.post('/todos/:id/checklist', async (req, res, next) => {
  try {
    const todoId = z.string().uuid().parse(req.params.id); const owner = accountId(req); const input = z.object({ title: z.string().trim().min(1).max(500), manualOrder: z.number().int().default(0) }).parse(req.body)
    const { data: todo, error: te } = await admin.from('vh_todos').select('id').eq('account_id', owner).eq('id', todoId).is('trashed_at', null).single(); if (te) throw te
    const { data, error } = await admin.from('vh_todo_check_items').insert({ account_id: owner, todo_id: todo.id, title: input.title, manual_order: input.manualOrder }).select('*').single(); if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})

router.post('/notes', async (req, res, next) => {
  try {
    const input = z.object({ title: z.string().trim().min(1).max(240).default('Untitled Note'), blocks: z.unknown(), retentionVersions: z.number().int().min(20).max(5000).default(200) }).parse(req.body)
    const blocks = validateNoteDocument(input.blocks); const fp = fingerprint(blocks)
    const { data, error } = await admin.rpc('vh_create_note', { p_account_id: accountId(req), p_title: input.title, p_blocks: blocks, p_blocks_fingerprint: fp, p_retention_versions: input.retentionVersions }); if (error) throw error
    res.status(201).json(Array.isArray(data) ? data[0] : data)
  } catch (error) { next(error) }
})

router.get('/notes', async (req, res, next) => {
  try {
    const owner = accountId(req); const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
    const { data, error } = await admin.from('vh_notes').select('*').eq('account_id', owner).is('trashed_at', null).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(limit); if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.put('/notes/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const input = z.object({ expectedRevision: z.number().int().positive(), sourceKind: z.enum(['USER','AUTOSAVE']).default('USER'), blocks: z.unknown() }).parse(req.body)
    const blocks = validateNoteDocument(input.blocks); const { data, error } = await admin.rpc('vh_save_note_revision', { p_account_id: accountId(req), p_note_id: id, p_expected_revision: input.expectedRevision, p_source_kind: input.sourceKind, p_blocks: blocks, p_blocks_fingerprint: fingerprint(blocks) }); if (error) throw error
    res.json(Array.isArray(data) ? data[0] : data)
  } catch (error) { next(error) }
})

router.get('/notes/:id/versions', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const owner = accountId(req)
    const { data, error } = await admin.from('vh_note_versions').select('id,revision_no,parent_revision_id,source_kind,blocks_fingerprint,created_at').eq('account_id', owner).eq('note_id', id).order('revision_no', { ascending: false }).limit(5000); if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/notes/:id/restore/:versionId', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const versionId = z.string().uuid().parse(req.params.versionId); const expectedRevision = z.object({ expectedRevision: z.number().int().positive() }).parse(req.body).expectedRevision
    const { data, error } = await admin.rpc('vh_restore_note_version', { p_account_id: accountId(req), p_note_id: id, p_version_id: versionId, p_expected_revision: expectedRevision }); if (error) throw error
    res.status(201).json(Array.isArray(data) ? data[0] : data)
  } catch (error) { next(error) }
})

router.post('/notes/:id/duplicate', async (req, res, next) => {
  try {
    const owner = accountId(req); const id = z.string().uuid().parse(req.params.id)
    const { data: note, error: ne } = await admin.from('vh_notes').select('title,current_revision_id,retention_versions').eq('account_id', owner).eq('id', id).is('trashed_at', null).single(); if (ne) throw ne
    if (!note.current_revision_id) throw new ApiError(409, 'NOTE_EMPTY', 'Note has no current revision.')
    const { data: version, error: ve } = await admin.from('vh_note_versions').select('blocks,blocks_fingerprint').eq('account_id', owner).eq('id', note.current_revision_id).single(); if (ve) throw ve
    const { data, error } = await admin.rpc('vh_create_note', { p_account_id: owner, p_title: `${note.title} copy`, p_blocks: version.blocks, p_blocks_fingerprint: version.blocks_fingerprint, p_retention_versions: note.retention_versions }); if (error) throw error
    res.status(201).json(Array.isArray(data) ? data[0] : data)
  } catch (error) { next(error) }
})

const noteAiOperations = z.enum(['rewrite','expand','shorten','summarize','explain','restructure','insert','selection_transform','table','checklist','formula','code','template'])
router.post('/notes/:id/ai/proposals', async (req, res, next) => {
  try {
    const owner = accountId(req); const noteId = z.string().uuid().parse(req.params.id); const input = z.object({ operation: noteAiOperations, instruction: z.string().max(10_000).default('') }).parse(req.body)
    const { data: note, error: ne } = await admin.from('vh_notes').select('revision,current_revision_id').eq('account_id', owner).eq('id', noteId).is('trashed_at', null).single(); if (ne) throw ne
    const { data: version, error: ve } = await admin.from('vh_note_versions').select('blocks').eq('account_id', owner).eq('id', note.current_revision_id).single(); if (ve) throw ve
    const ai = await defaultAiRouter.generate({ taskClass: 'structured', system: 'Return only JSON {"blocks": [...]} using the existing Veltrix structured-note block vocabulary. Never return HTML or scripts.', prompt: `Operation=${input.operation}\nInstruction=${input.instruction}\nCurrent blocks=${JSON.stringify(version.blocks)}` })
    const proposalRaw = parseAiJson(ai.text) as any; const blocks = validateNoteDocument(proposalRaw?.blocks)
    const { data, error } = await admin.from('vh_ai_change_proposals').insert({ account_id: owner, target_kind: 'note', target_id: noteId, operation: input.operation, base_revision: note.revision, proposal: { blocks }, status: 'PENDING' }).select('*').single(); if (error) throw error
    res.status(201).json({ ...data, aiRoute: { providerId: ai.providerId, modelId: ai.modelId } })
  } catch (error) { next(error) }
})

router.post('/ai/proposals/:id/accept', async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const { data, error } = await admin.rpc('vh_accept_ai_change_proposal', { p_account_id: accountId(req), p_proposal_id: id }); if (error) throw error; res.json({ accepted: true, revision: data }) } catch (error) { next(error) }
})
router.post('/ai/proposals/:id/reject', async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const { data, error } = await admin.from('vh_ai_change_proposals').update({ status: 'REJECTED', resolved_at: new Date().toISOString() }).eq('account_id', accountId(req)).eq('id', id).eq('status', 'PENDING').select('id').maybeSingle(); if (error) throw error; if (!data) throw new ApiError(409, 'PROPOSAL_NOT_PENDING', 'Proposal is not pending.'); res.json({ rejected: true }) } catch (error) { next(error) }
})

export { router as v1Part4ProductivityRouter }
