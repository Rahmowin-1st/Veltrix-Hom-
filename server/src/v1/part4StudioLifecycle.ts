import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { defaultAiRouter } from './aiRouter.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'
import { registerJobHandler } from './jobs.js'
import { artifactOutputSchemas, refreshGenerationContext } from './part4Studio.js'

type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

function parseStructuredOutput(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try { parsed = JSON.parse(clean) } catch { throw new ApiError(502, 'STUDIO_AI_OUTPUT_INVALID', 'Studio revision returned invalid structured output.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(502, 'STUDIO_AI_OUTPUT_INVALID', 'Studio revision returned invalid structured output.')
  return parsed
}

export function studioRevisionSourceKind(mode: string) {
  if (mode === 'REGENERATE') return 'REGENERATED' as const
  if (mode === 'REVISE') return 'PROMPT_REVISION' as const
  throw new Error('studio_revision_mode_invalid')
}

registerJobHandler('studio.revise', async ({ job, checkpoint, signal }) => {
  const owner = job.account_id
  const generationId = (job.payload as any)?.generationId
  if (!owner || typeof generationId !== 'string') throw new Error('studio_revision_job_payload_invalid')

  try {
    const { data: generation, error: ge } = await admin.from('vh_studio_generations').select('*')
      .eq('account_id', owner).eq('id', generationId).single()
    if (ge) throw ge
    if (!generation.target_artifact_id || !['REGENERATE','REVISE'].includes(generation.generation_mode)) throw new Error('studio_revision_target_missing')

    const { data: artifact, error: ae } = await admin.from('vh_studio_artifacts')
      .select('id,title,artifact_type,artifact_type_version,current_version,revision')
      .eq('account_id', owner).eq('id', generation.target_artifact_id).is('trashed_at', null).single()
    if (ae) throw ae
    const schema = artifactOutputSchemas[artifact.artifact_type]
    if (!schema) throw new Error('studio_output_schema_unavailable')

    const { data: current, error: ve } = await admin.from('vh_studio_artifact_versions')
      .select('content').eq('account_id', owner).eq('artifact_id', artifact.id).eq('version_no', artifact.current_version).single()
    if (ve) throw ve

    await admin.from('vh_studio_generations').update({ status: 'RUNNING', progress: 5, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('account_id', owner).eq('id', generationId)
    await checkpoint({ phase: 'resolve-context' }, 0.1)
    const latest = await refreshGenerationContext(owner, generationId)
    await checkpoint({ phase: 'generate-revision', fingerprint: latest.fingerprint }, 0.35)

    const result = await defaultAiRouter.generate({
      taskClass: 'structured', signal,
      system: 'Return ONLY valid JSON. Never return HTML or executable script. Preserve the requested typed Studio artifact shape exactly.',
      prompt: [
        `Revise Veltrix Hom Studio artifact type=${artifact.artifact_type}.`,
        `Mode=${generation.generation_mode}. User prompt: ${generation.prompt}`,
        `CURRENT ARTIFACT:\n${JSON.stringify(current.content).slice(0, 100_000)}`,
        `AUTHORIZED CURRENT CONTEXT:\n${latest.context}`,
      ].join('\n\n'),
    })
    const content = schema.parse(parseStructuredOutput(result.text))
    await checkpoint({ phase: 'persist-revision', providerId: result.providerId, modelId: result.modelId }, 0.8)

    const sourceKind = studioRevisionSourceKind(generation.generation_mode)
    const { data: appended, error: pe } = await admin.rpc('vh_append_studio_artifact_version', {
      p_account_id: owner,
      p_artifact_id: artifact.id,
      p_expected_revision: artifact.revision,
      p_source_kind: sourceKind,
      p_content: content,
      p_binary_object_id: null,
      p_generation_id: generationId,
      p_provenance: {
        providerId: result.providerId,
        modelId: result.modelId,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        resolvedContextFingerprint: latest.fingerprint,
        operation: generation.generation_mode,
      },
    })
    if (pe) throw pe
    const row = Array.isArray(appended) ? appended[0] : appended
    await admin.from('vh_studio_generations').update({
      status: 'COMPLETED', progress: 100, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      ai_route: { providerId: result.providerId, modelId: result.modelId },
      provenance: { resolvedContextFingerprint: latest.fingerprint, operation: generation.generation_mode },
    }).eq('account_id', owner).eq('id', generationId)
    return { result: { artifactId: artifact.id, versionNo: row?.version_no, revision: row?.new_revision, resolvedContextFingerprint: latest.fingerprint }, resultRef: artifact.id }
  } catch (error) {
    await admin.from('vh_studio_generations').update({ status: 'FAILED', safe_error_code: 'STUDIO_REVISION_FAILED', updated_at: new Date().toISOString() })
      .eq('account_id', owner).eq('id', generationId)
    throw error
  }
})

const router = Router()
router.use(canonicalAuth)

router.get('/studio/artifacts/:id', async (req, res, next) => {
  try {
    const owner = accountId(req)
    const id = z.string().uuid().parse(req.params.id)
    const { data: artifact, error: ae } = await admin.from('vh_studio_artifacts').select('*')
      .eq('account_id', owner).eq('id', id).is('trashed_at', null).single()
    if (ae) throw ae
    const { data: version, error: ve } = await admin.from('vh_studio_artifact_versions').select('*')
      .eq('account_id', owner).eq('artifact_id', id).eq('version_no', artifact.current_version).single()
    if (ve) throw ve
    res.json({ artifact, currentVersion: version })
  } catch (error) { next(error) }
})

router.patch('/studio/artifacts/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const input = z.object({ expectedRevision: z.number().int().positive(), title: z.string().trim().min(1).max(240) }).parse(req.body)
    const { data, error } = await admin.rpc('vh_rename_studio_artifact', {
      p_account_id: accountId(req), p_artifact_id: id, p_expected_revision: input.expectedRevision, p_title: input.title,
    })
    if (error) throw error
    res.json({ revision: data, title: input.title })
  } catch (error) { next(error) }
})

router.post('/studio/artifacts/:id/duplicate', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const input = z.object({ title: z.string().trim().min(1).max(240).optional() }).parse(req.body ?? {})
    const { data, error } = await admin.rpc('vh_duplicate_studio_artifact', {
      p_account_id: accountId(req), p_artifact_id: id, p_title: input.title ?? null,
    })
    if (error) throw error
    res.status(201).json({ artifactId: data })
  } catch (error) { next(error) }
})

router.post('/studio/artifacts/:id/regenerate', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const input = z.object({ idempotencyKey: z.string().trim().min(1).max(200) }).parse(req.body)
    const { data, error } = await admin.rpc('vh_create_studio_revision_generation', {
      p_account_id: accountId(req), p_artifact_id: id, p_idempotency_key: input.idempotencyKey,
      p_mode: 'REGENERATE', p_prompt_override: null,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    res.status(row?.replayed ? 200 : 202).json(row)
  } catch (error) { next(error) }
})

router.post('/studio/artifacts/:id/revise', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const input = z.object({ idempotencyKey: z.string().trim().min(1).max(200), prompt: z.string().trim().min(1).max(20_000) }).parse(req.body)
    const { data, error } = await admin.rpc('vh_create_studio_revision_generation', {
      p_account_id: accountId(req), p_artifact_id: id, p_idempotency_key: input.idempotencyKey,
      p_mode: 'REVISE', p_prompt_override: input.prompt,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    res.status(row?.replayed ? 200 : 202).json(row)
  } catch (error) { next(error) }
})

export { router as v1Part4StudioLifecycleRouter }
