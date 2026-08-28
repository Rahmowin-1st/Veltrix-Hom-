import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

function normalizeNotebookName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > 160) throw new ApiError(400, 'NOTEBOOK_NAME_INVALID', 'Notebook name is invalid.')
  return normalized
}

function notebookResource(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    aiConfig: row.ai_config ?? {},
    archivedAt: row.archived_at,
    trashedAt: row.trashed_at,
    purgeAfter: row.purge_after,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

router.get('/notebooks', async (req, res, next) => {
  try {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      archived: z.enum(['true', 'false']).optional(),
    }).parse(req.query)
    let query = admin.from('vh_notebooks').select('*').eq('account_id', accountId(req)).is('trashed_at', null)
    if (parsed.archived === 'true') query = query.not('archived_at', 'is', null)
    if (parsed.archived === 'false') query = query.is('archived_at', null)
    const { data, error } = await query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(parsed.limit)
    if (error) throw error
    res.json({ items: (data ?? []).map(notebookResource) })
  } catch (error) { next(error) }
})

router.get('/notebooks/:notebookId', async (req, res, next) => {
  try {
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const { data, error } = await admin.from('vh_notebooks').select('*')
      .eq('id', notebookId).eq('account_id', accountId(req)).is('trashed_at', null).maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'NOTEBOOK_NOT_FOUND', 'Notebook was not found.')
    res.json(notebookResource(data))
  } catch (error) { next(error) }
})

router.patch('/notebooks/:notebookId', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const input = z.object({
      name: z.string().optional(),
      description: z.string().max(4000).nullable().optional(),
      icon: z.string().max(64).nullable().optional(),
      accent: z.string().max(64).nullable().optional(),
      aiConfig: z.record(z.unknown()).optional(),
      archived: z.boolean().optional(),
      expectedRevision: z.number().int().positive(),
    }).parse(req.body)
    const patch: Record<string, unknown> = {
      revision: input.expectedRevision + 1,
      updated_at: new Date().toISOString(),
    }
    if (input.name !== undefined) patch.name = normalizeNotebookName(input.name)
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.icon !== undefined) patch.icon = input.icon
    if (input.accent !== undefined) patch.accent = input.accent
    if (input.aiConfig !== undefined) patch.ai_config = input.aiConfig
    if (input.archived !== undefined) patch.archived_at = input.archived ? new Date().toISOString() : null
    const { data, error } = await admin.from('vh_notebooks').update(patch)
      .eq('id', notebookId).eq('account_id', id).eq('revision', input.expectedRevision).is('trashed_at', null)
      .select('*').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(409, 'REVISION_CONFLICT', 'Notebook revision changed. Reload before updating.')
    res.json(notebookResource(data))
  } catch (error) { next(error) }
})

router.get('/notebooks/:notebookId/sources', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const limit = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.limit)
    const { data: notebook, error: notebookError } = await admin.from('vh_notebooks').select('id')
      .eq('id', notebookId).eq('account_id', id).is('trashed_at', null).maybeSingle()
    if (notebookError) throw notebookError
    if (!notebook) throw new ApiError(404, 'NOTEBOOK_NOT_FOUND', 'Notebook was not found.')
    const { data, error } = await admin.from('vh_notebook_sources')
      .select('id,asset_id,source_size_bytes,enabled,manual_order,group_key,added_via,discovery_provenance,created_at,updated_at,vh_library_assets!inner(id,display_title,source_kind,detected_mime,processing_status,extraction_status,safe_failure_code,original_size_bytes,source_revision)')
      .eq('account_id', id).eq('notebook_id', notebookId)
      .order('manual_order', { ascending: true }).order('id', { ascending: true }).limit(limit)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.get('/notebooks/:notebookId/projects', async (req, res, next) => {
  try {
    const id = accountId(req)
    const notebookId = z.string().uuid().parse(req.params.notebookId)
    const { data: notebook, error: notebookError } = await admin.from('vh_notebooks').select('id')
      .eq('id', notebookId).eq('account_id', id).is('trashed_at', null).maybeSingle()
    if (notebookError) throw notebookError
    if (!notebook) throw new ApiError(404, 'NOTEBOOK_NOT_FOUND', 'Notebook was not found.')
    const { data: links, error: linksError } = await admin.from('vh_project_notebooks').select('project_id')
      .eq('account_id', id).eq('notebook_id', notebookId).limit(500)
    if (linksError) throw linksError
    const ids = (links ?? []).map(row => row.project_id)
    if (!ids.length) return res.json({ items: [] })
    const { data, error } = await admin.from('vh_projects').select('id,name,icon,accent,purpose,archived_at,revision,updated_at')
      .eq('account_id', id).in('id', ids).is('trashed_at', null).order('updated_at', { ascending: false })
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.get('/projects/:projectId/notebooks', async (req, res, next) => {
  try {
    const id = accountId(req)
    const projectId = z.string().uuid().parse(req.params.projectId)
    const { data: project, error: projectError } = await admin.from('vh_projects').select('id')
      .eq('id', projectId).eq('account_id', id).is('trashed_at', null).maybeSingle()
    if (projectError) throw projectError
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
    const { data: links, error: linksError } = await admin.from('vh_project_notebooks').select('notebook_id')
      .eq('account_id', id).eq('project_id', projectId).limit(500)
    if (linksError) throw linksError
    const ids = (links ?? []).map(row => row.notebook_id)
    if (!ids.length) return res.json({ items: [] })
    const { data, error } = await admin.from('vh_notebooks').select('*')
      .eq('account_id', id).in('id', ids).is('trashed_at', null).order('updated_at', { ascending: false })
    if (error) throw error
    res.json({ items: (data ?? []).map(notebookResource) })
  } catch (error) { next(error) }
})

export { router as v1Part2NotebookRouter }
