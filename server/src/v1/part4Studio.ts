import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { defaultAiRouter } from './aiRouter.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { registerJobHandler } from './jobs.js'

type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }
function sha(value: string) { return createHash('sha256').update(value).digest('hex') }

const bindingKinds = ['project','notebook','conversation','library_asset','library_selection','collection','tag','note','direct_text','direct_attachment'] as const
const bindingSchema = z.object({
  kind: z.enum(bindingKinds),
  targetId: z.string().uuid().nullable().optional(),
  selector: z.record(z.unknown()).optional(),
  text: z.string().max(20_000).optional(),
}).superRefine((v, ctx) => {
  if (v.kind === 'direct_text') {
    if (!v.text?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'direct_text requires text' })
  } else if (v.kind !== 'library_selection' && !v.targetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${v.kind} requires targetId` })
  }
})

const artifactOutputSchemas: Record<string, z.ZodTypeAny> = {
  flashcards: z.object({ cards: z.array(z.object({ front: z.string().max(4000), back: z.string().max(8000) })).max(500) }),
  quiz: z.object({ questions: z.array(z.object({ prompt: z.string().max(8000), options: z.array(z.string().max(2000)).min(2).max(8), correctIndex: z.number().int().nonnegative(), explanation: z.string().max(8000).optional() })).max(300) }),
  practice_test: z.object({ sections: z.array(z.object({ title: z.string().max(500), questions: z.array(z.object({ prompt: z.string().max(8000), answer: z.string().max(8000).optional() })).max(200) })).max(30) }),
  study_guide: z.object({ sections: z.array(z.object({ heading: z.string().max(500), body: z.string().max(20_000), keyPoints: z.array(z.string().max(4000)).max(100).optional() })).max(100) }),
  mind_map: z.object({ nodes: z.array(z.object({ id: z.string().max(120), label: z.string().max(1000) })).max(1000), edges: z.array(z.object({ from: z.string().max(120), to: z.string().max(120), label: z.string().max(500).optional() })).max(2000) }),
  summary: z.object({ sections: z.array(z.object({ heading: z.string().max(500), text: z.string().max(20_000) })).max(100), keyPoints: z.array(z.string().max(5000)).max(200).optional() }),
  notes: z.object({ blocks: z.array(z.record(z.unknown())).max(5000) }),
  presentation: z.object({ slides: z.array(z.object({ title: z.string().max(500), bullets: z.array(z.string().max(4000)).max(30), speakerNotes: z.string().max(10_000).optional() })).max(200) }),
  infographic: z.object({ layout: z.object({ title: z.string().max(500).optional(), blocks: z.array(z.object({ kind: z.enum(['heading','text','stat','list','timeline','callout']), text: z.string().max(8000) })).max(200) }) }),
  audio_lesson: z.object({ segments: z.array(z.object({ speaker: z.string().max(120).optional(), text: z.string().max(12_000) })).max(500) }),
  cheat_sheet: z.object({ items: z.array(z.object({ label: z.string().max(1000), value: z.string().max(8000) })).max(500) }),
  question_bank: z.object({ questions: z.array(z.object({ prompt: z.string().max(8000), answer: z.string().max(8000), difficulty: z.enum(['easy','medium','hard']).optional() })).max(1000) }),
  timeline: z.object({ events: z.array(z.object({ date: z.string().max(200), title: z.string().max(1000), details: z.string().max(8000).optional() })).max(1000) }),
  concept_breakdown: z.object({ concepts: z.array(z.object({ title: z.string().max(1000), explanation: z.string().max(20_000), examples: z.array(z.string().max(8000)).max(100).optional() })).max(300) }),
}

function safeJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try { parsed = JSON.parse(trimmed) } catch { throw new ApiError(502, 'STUDIO_AI_OUTPUT_INVALID', 'Studio generation returned invalid structured output.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(502, 'STUDIO_AI_OUTPUT_INVALID', 'Studio generation returned invalid structured output.')
  return parsed
}

async function assetText(owner: string, assetIds: string[]) {
  if (!assetIds.length) return ''
  const ids = [...new Set(assetIds)].slice(0, 200)
  const { data, error } = await admin.from('vh_source_chunks').select('asset_id,chunk_index,content')
    .eq('account_id', owner).in('asset_id', ids).order('asset_id').order('chunk_index').limit(1500)
  if (error) throw error
  return (data ?? []).map(r => String(r.content ?? '')).join('\n').slice(0, 120_000)
}

async function loadBindingText(owner: string, binding: Record<string, any>): Promise<string> {
  const kind = String(binding.binding_kind)
  const targetId = binding.target_id ? String(binding.target_id) : null
  if (kind === 'direct_text') return String(binding.direct_text ?? '').slice(0, 20_000)
  if (kind === 'project' && targetId) {
    const [{ data: p, error: pe }, { data: refs, error: re }] = await Promise.all([
      admin.from('vh_projects').select('name,purpose').eq('account_id', owner).eq('id', targetId).is('trashed_at', null).single(),
      admin.from('vh_project_references').select('asset_id').eq('account_id', owner).eq('project_id', targetId).limit(200),
    ])
    if (pe) throw pe; if (re) throw re
    return [`Project: ${p.name}`, p.purpose ?? '', await assetText(owner, (refs ?? []).map(r => r.asset_id))].join('\n')
  }
  if (kind === 'notebook' && targetId) {
    const [{ data: n, error: ne }, { data: refs, error: re }] = await Promise.all([
      admin.from('vh_notebooks').select('name,description').eq('account_id', owner).eq('id', targetId).is('trashed_at', null).single(),
      admin.from('vh_notebook_sources').select('asset_id').eq('account_id', owner).eq('notebook_id', targetId).eq('enabled', true).limit(200),
    ])
    if (ne) throw ne; if (re) throw re
    return [`Notebook: ${n.name}`, n.description ?? '', await assetText(owner, (refs ?? []).map(r => r.asset_id))].join('\n')
  }
  if (kind === 'conversation' && targetId) {
    const { data, error } = await admin.from('vh_conversation_messages').select('role,plain_text').eq('account_id', owner).eq('conversation_id', targetId).eq('status', 'COMPLETED').order('created_at').limit(600)
    if (error) throw error
    return (data ?? []).map(m => `${m.role}: ${m.plain_text}`).join('\n').slice(0, 120_000)
  }
  if ((kind === 'library_asset' || kind === 'direct_attachment') && targetId) return assetText(owner, [targetId])
  if (kind === 'collection' && targetId) {
    const { data, error } = await admin.from('vh_collection_assets').select('asset_id').eq('account_id', owner).eq('collection_id', targetId).order('manual_order').limit(200)
    if (error) throw error
    return assetText(owner, (data ?? []).map(r => r.asset_id))
  }
  if (kind === 'tag' && targetId) {
    const { data, error } = await admin.from('vh_library_asset_tags').select('asset_id').eq('account_id', owner).eq('tag_id', targetId).limit(200)
    if (error) throw error
    return assetText(owner, (data ?? []).map(r => r.asset_id))
  }
  if (kind === 'note' && targetId) {
    const { data: note, error: ne } = await admin.from('vh_notes').select('current_revision_id,title').eq('account_id', owner).eq('id', targetId).is('trashed_at', null).single()
    if (ne) throw ne
    if (!note.current_revision_id) return `Note: ${note.title}`
    const { data: version, error: ve } = await admin.from('vh_note_versions').select('blocks').eq('account_id', owner).eq('id', note.current_revision_id).single()
    if (ve) throw ve
    return `Note: ${note.title}\n${JSON.stringify(version.blocks)}`.slice(0, 120_000)
  }
  if (kind === 'library_selection') {
    const selector = (binding.selector ?? {}) as Record<string, unknown>
    let ids: string[] = []
    if (Array.isArray(selector.assetIds)) ids = selector.assetIds.filter((x): x is string => typeof x === 'string')
    if (typeof selector.collectionId === 'string') {
      const { data, error } = await admin.from('vh_collection_assets').select('asset_id').eq('account_id', owner).eq('collection_id', selector.collectionId).limit(200)
      if (error) throw error; ids.push(...(data ?? []).map(r => r.asset_id))
    }
    if (typeof selector.tagId === 'string') {
      const { data, error } = await admin.from('vh_library_asset_tags').select('asset_id').eq('account_id', owner).eq('tag_id', selector.tagId).limit(200)
      if (error) throw error; ids.push(...(data ?? []).map(r => r.asset_id))
    }
    return assetText(owner, ids)
  }
  throw new ApiError(422, 'STUDIO_BINDING_UNSUPPORTED', 'Studio binding is unsupported.')
}

async function refreshGenerationContext(owner: string, generationId: string) {
  const { data: bindings, error } = await admin.from('vh_studio_input_bindings').select('*').eq('account_id', owner).eq('generation_id', generationId).order('created_at').order('id')
  if (error) throw error
  const fragments: string[] = []
  const fingerprints: string[] = []
  for (const binding of bindings ?? []) {
    const { data: snap, error: snapError } = await admin.rpc('vh_resolve_studio_binding_snapshot', {
      p_account_id: owner,
      p_kind: binding.binding_kind,
      p_target_id: binding.target_id,
      p_selector: binding.selector ?? {},
      p_direct_text: binding.direct_text,
    })
    if (snapError) throw snapError
    const row = Array.isArray(snap) ? snap[0] : snap
    if (!row?.resolved_fingerprint) throw new Error('studio_snapshot_missing')
    await admin.from('vh_studio_input_bindings').update({ resolved_revision: row.resolved_revision, resolved_fingerprint: row.resolved_fingerprint, resolved_at: new Date().toISOString() })
      .eq('account_id', owner).eq('id', binding.id)
    fingerprints.push(`${binding.binding_kind}:${row.resolved_fingerprint}`)
    fragments.push(await loadBindingText(owner, binding as Record<string, any>))
  }
  const { data: attachments, error: ae } = await admin.from('vh_studio_generation_attachments').select('asset_id').eq('account_id', owner).eq('generation_id', generationId).order('asset_id')
  if (ae) throw ae
  const attachmentIds = (attachments ?? []).map(r => r.asset_id)
  if (attachmentIds.length) {
    const { data: assets, error: ase } = await admin.from('vh_library_assets').select('id,source_revision,content_sha256').eq('account_id', owner).in('id', attachmentIds).is('trashed_at', null).order('id')
    if (ase) throw ase
    for (const a of assets ?? []) fingerprints.push(`attachment:${a.id}:${a.source_revision}:${a.content_sha256}`)
    fragments.push(await assetText(owner, attachmentIds))
  }
  const fingerprint = sha(fingerprints.join('|'))
  await admin.from('vh_studio_generations').update({ resolved_context_fingerprint: fingerprint, updated_at: new Date().toISOString() }).eq('account_id', owner).eq('id', generationId)
  return { fingerprint, context: fragments.filter(Boolean).join('\n\n---\n\n').slice(0, 180_000) }
}

registerJobHandler('studio.generate', async ({ job, checkpoint, signal }) => {
  const owner = job.account_id
  const generationId = (job.payload as any)?.generationId
  if (!owner || typeof generationId !== 'string') throw new Error('studio_job_payload_invalid')
  const { data: generation, error } = await admin.from('vh_studio_generations').select('*').eq('account_id', owner).eq('id', generationId).single()
  if (error) throw error
  const schema = artifactOutputSchemas[generation.artifact_type]
  if (!schema) throw new Error('studio_output_schema_unavailable')
  await admin.from('vh_studio_generations').update({ status: 'RUNNING', progress: 5, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('account_id', owner).eq('id', generationId)
  await checkpoint({ phase: 'resolve-context' }, 0.1)
  const latest = await refreshGenerationContext(owner, generationId)
  await checkpoint({ phase: 'generate', fingerprint: latest.fingerprint }, 0.35)
  const result = await defaultAiRouter.generate({
    taskClass: 'structured', signal,
    system: 'Return ONLY valid JSON. Never return HTML or executable script. Follow the requested typed artifact shape exactly.',
    prompt: `Create Veltrix Hom Studio artifact type=${generation.artifact_type}. User prompt: ${generation.prompt}\n\nAUTHORIZED CONTEXT:\n${latest.context}`,
  })
  const content = schema.parse(safeJsonObject(result.text))
  await checkpoint({ phase: 'persist', providerId: result.providerId, modelId: result.modelId }, 0.8)
  const title = `${String(generation.artifact_type).replaceAll('_',' ')} ${new Date().toISOString().slice(0,10)}`
  const { data: artifactId, error: persistError } = await admin.rpc('vh_create_studio_artifact_from_generation', {
    p_account_id: owner,
    p_generation_id: generationId,
    p_title: title,
    p_content: content,
    p_binary_object_id: null,
    p_provenance: { providerId: result.providerId, modelId: result.modelId, latencyMs: result.latencyMs, attempts: result.attempts, resolvedContextFingerprint: latest.fingerprint },
  })
  if (persistError) throw persistError
  return { result: { artifactId, resolvedContextFingerprint: latest.fingerprint }, resultRef: String(artifactId) }
})

const router = Router()
router.use(canonicalAuth)

router.get('/studio/registry', async (_req, res, next) => {
  try {
    const { data, error } = await admin.from('vh_studio_artifact_registry').select('artifact_type,version,display_name,renderer_key,output_kind,input_schema,output_schema,capabilities').eq('active', true).order('artifact_type').order('version')
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/studio/sessions', async (req, res, next) => {
  try {
    const input = z.object({ title: z.string().trim().min(1).max(200).optional(), prompt: z.string().max(20_000).optional() }).parse(req.body ?? {})
    const { data, error } = await admin.from('vh_studio_sessions').insert({ account_id: accountId(req), title: input.title ?? null, prompt: input.prompt ?? null }).select('*').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})

router.get('/studio/recents', async (req, res, next) => {
  try {
    const owner = accountId(req)
    const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit)
    const [{ data: sessions, error: se }, { data: artifacts, error: ae }, { data: contexts, error: ce }] = await Promise.all([
      admin.from('vh_studio_sessions').select('*').eq('account_id', owner).order('last_used_at', { ascending: false }).limit(limit),
      admin.from('vh_studio_artifacts').select('*').eq('account_id', owner).is('trashed_at', null).order('updated_at', { ascending: false }).limit(limit),
      admin.from('vh_studio_input_bindings').select('binding_kind,target_id,selector,resolved_revision,resolved_fingerprint,resolved_at').eq('account_id', owner).not('resolved_at', 'is', null).order('resolved_at', { ascending: false }).limit(limit),
    ])
    if (se) throw se; if (ae) throw ae; if (ce) throw ce
    res.json({ sessions: sessions ?? [], artifacts: artifacts ?? [], recentContexts: contexts ?? [] })
  } catch (error) { next(error) }
})

router.post('/studio/generations', async (req, res, next) => {
  try {
    const input = z.object({
      sessionId: z.string().uuid().nullable().optional(), artifactType: z.string().min(1).max(80), artifactTypeVersion: z.number().int().positive().default(1),
      idempotencyKey: z.string().min(1).max(200), prompt: z.string().max(20_000).default(''), bindings: z.array(bindingSchema).max(50).default([]),
      attachmentAssetIds: z.array(z.string().uuid()).max(5).default([]),
    }).parse(req.body)
    const { data, error } = await admin.rpc('vh_create_studio_generation', {
      p_account_id: accountId(req), p_session_id: input.sessionId ?? null, p_artifact_type: input.artifactType,
      p_artifact_type_version: input.artifactTypeVersion, p_idempotency_key: input.idempotencyKey, p_prompt: input.prompt,
      p_bindings: input.bindings, p_attachment_asset_ids: input.attachmentAssetIds,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    res.status(row?.replayed ? 200 : 202).json(row)
  } catch (error) { next(error) }
})

router.get('/studio/generations/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const { data, error } = await admin.from('vh_studio_generations').select('*').eq('account_id', accountId(req)).eq('id', id).single()
    if (error) throw error
    res.json(data)
  } catch (error) { next(error) }
})

router.get('/studio/artifacts', async (req, res, next) => {
  try {
    const owner = accountId(req); const limit = z.coerce.number().int().min(1).max(100).default(40).parse(req.query.limit)
    let q = admin.from('vh_studio_artifacts').select('*').eq('account_id', owner).is('trashed_at', null)
    if (typeof req.query.type === 'string' && req.query.type) q = q.eq('artifact_type', z.string().max(80).parse(req.query.type))
    if (typeof req.query.q === 'string' && req.query.q.trim()) q = q.ilike('title', `%${z.string().max(300).parse(req.query.q.trim()).replaceAll('%','\\%').replaceAll('_','\\_')}%`)
    const { data, error } = await q.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.get('/studio/artifacts/:id/versions', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const owner = accountId(req)
    const { data: artifact, error: ae } = await admin.from('vh_studio_artifacts').select('id').eq('account_id', owner).eq('id', id).is('trashed_at', null).single()
    if (ae) throw ae; if (!artifact) throw new ApiError(404, 'STUDIO_ARTIFACT_NOT_FOUND', 'Studio artifact was not found.')
    const { data, error } = await admin.from('vh_studio_artifact_versions').select('*').eq('account_id', owner).eq('artifact_id', id).order('version_no', { ascending: false }).limit(500)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/studio/artifacts/:id/versions', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const input = z.object({ expectedRevision: z.number().int().positive(), sourceKind: z.enum(['USER_EDIT','REGENERATED','PROMPT_REVISION','RESTORED']), content: z.record(z.unknown()), binaryObjectId: z.string().uuid().nullable().optional(), generationId: z.string().uuid().nullable().optional(), provenance: z.record(z.unknown()).optional() }).parse(req.body)
    const { data, error } = await admin.rpc('vh_append_studio_artifact_version', { p_account_id: accountId(req), p_artifact_id: id, p_expected_revision: input.expectedRevision, p_source_kind: input.sourceKind, p_content: input.content, p_binary_object_id: input.binaryObjectId ?? null, p_generation_id: input.generationId ?? null, p_provenance: input.provenance ?? {} })
    if (error) throw error
    res.status(201).json(Array.isArray(data) ? data[0] : data)
  } catch (error) { next(error) }
})

export { artifactOutputSchemas, bindingSchema, refreshGenerationContext, router as v1Part4StudioRouter }
