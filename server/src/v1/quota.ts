import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'
import { evaluateLibraryAttention } from './part4Notifications.js'

export const MiB = 1024 * 1024
export const GiB = 1024 * MiB

export const QUOTA_CONTRACTS = {
  library: { policyKey: 'library.storage', hardBytes: 1 * GiB, warningBytes: 900 * MiB },
  projectReference: { policyKey: 'project.references', maxItems: 20, maxTotalBytes: 50 * MiB },
  conversationReference: { policyKey: 'conversation.reference', maxItems: 1, maxTotalBytes: 20 * MiB },
  conversationMessageAttachments: { policyKey: 'conversation.message_attachments', maxItems: 5, maxTotalBytes: 10 * MiB },
  fastAskAttachments: { policyKey: 'fast_ask.attachments', maxItems: 5, maxTotalBytes: 10 * MiB },
  studioCustomAttachments: { policyKey: 'studio.custom_attachments', maxItems: 5, maxTotalBytes: 20 * MiB },
  notebookPlan: { policyKey: 'notebook.plan', planConfigurable: true },
} as const

export type QuotaPolicy = {
  policyKey: string
  hardBytes: number | null
  warningBytes: number | null
  maxItems: number | null
  config: Record<string, unknown>
}

export async function getQuotaPolicy(accountId: string, policyKey: string): Promise<QuotaPolicy> {
  const [{ data: policy, error: policyError }, { data: override, error: overrideError }] = await Promise.all([
    admin.from('vh_quota_policies').select('policy_key,hard_bytes,warning_bytes,max_items,config,enabled').eq('policy_key', policyKey).single(),
    admin.from('vh_quota_overrides').select('hard_bytes,warning_bytes,max_items,config,expires_at').eq('account_id', accountId).eq('policy_key', policyKey).maybeSingle(),
  ])
  if (policyError) throw policyError
  if (overrideError) throw overrideError
  if (!policy.enabled) throw new ApiError(503, 'QUOTA_POLICY_DISABLED', 'This quota policy is currently disabled.')
  const overrideActive = Boolean(override && (!override.expires_at || Date.parse(override.expires_at) > Date.now()))
  return {
    policyKey,
    hardBytes: Number(overrideActive && override?.hard_bytes != null ? override.hard_bytes : policy.hard_bytes ?? 0) || null,
    warningBytes: Number(overrideActive && override?.warning_bytes != null ? override.warning_bytes : policy.warning_bytes ?? 0) || null,
    maxItems: Number(overrideActive && override?.max_items != null ? override.max_items : policy.max_items ?? 0) || null,
    config: { ...(policy.config ?? {}), ...(overrideActive ? (override?.config ?? {}) : {}) },
  }
}

export async function libraryQuotaStatus(accountId: string) {
  const [{ data, error }, policy] = await Promise.all([
    admin.from('vh_quota_usage').select('bytes_used,bytes_reserved').eq('account_id', accountId).eq('scope', 'library').maybeSingle(),
    getQuotaPolicy(accountId, QUOTA_CONTRACTS.library.policyKey),
  ])
  if (error) throw error
  const used = Number(data?.bytes_used ?? 0)
  const reserved = Number(data?.bytes_reserved ?? 0)
  const hard = policy.hardBytes ?? QUOTA_CONTRACTS.library.hardBytes
  const warning = policy.warningBytes ?? QUOTA_CONTRACTS.library.warningBytes
  return {
    bytesUsed: used,
    bytesReserved: reserved,
    hardLimitBytes: hard,
    warningAtBytes: warning,
    warning: used + reserved >= warning,
    remainingBytes: Math.max(0, hard - used - reserved),
    policyKey: policy.policyKey,
  }
}

export async function reserveLibraryQuota(accountId: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ApiError(400, 'INVALID_SIZE', 'Upload size is invalid.')
  const policy = await getQuotaPolicy(accountId, QUOTA_CONTRACTS.library.policyKey)
  const hard = policy.hardBytes ?? QUOTA_CONTRACTS.library.hardBytes
  const { data, error } = await admin.rpc('vh_reserve_quota', {
    p_account_id: accountId,
    p_scope: 'library',
    p_bytes: bytes,
    p_hard_limit: hard,
  })
  if (error) {
    if (String(error.message).includes('quota_exceeded')) {
      throw new ApiError(413, 'LIBRARY_QUOTA_EXCEEDED', 'Library storage limit reached.', await libraryQuotaStatus(accountId))
    }
    throw error
  }
  return String(data)
}

export async function finalizeLibraryQuota(reservationId: string, commit: boolean) {
  const { data: reservation, error: reservationError } = await admin.from('vh_quota_reservations')
    .select('account_id,scope').eq('id', reservationId).maybeSingle()
  if (reservationError) throw reservationError
  const { data, error } = await admin.rpc('vh_finalize_quota_reservation', {
    p_reservation_id: reservationId,
    p_commit: commit,
  })
  if (error) throw error
  if (!data) throw new ApiError(409, 'RESERVATION_NOT_PENDING', 'The storage reservation is no longer pending.')
  if (commit && reservation?.account_id && reservation.scope === 'library') {
    const status = await libraryQuotaStatus(String(reservation.account_id))
    await evaluateLibraryAttention(String(reservation.account_id), status.bytesUsed, status.warningAtBytes)
  }
}

export async function reconcileLibraryUsage(accountId: string) {
  const { data: rows, error } = await admin.from('vh_storage_objects')
    .select('id,size_bytes,state').eq('account_id', accountId).eq('kind', 'library').in('state', ['ready','trashed'])
  if (error) throw error
  const bytesUsed = (rows ?? []).reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0)
  const { error: usageError } = await admin.from('vh_quota_usage').upsert({
    account_id: accountId,
    scope: 'library',
    bytes_used: bytesUsed,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,scope' })
  if (usageError) throw usageError
  const policy = await getQuotaPolicy(accountId, QUOTA_CONTRACTS.library.policyKey)
  await evaluateLibraryAttention(accountId, bytesUsed, policy.warningBytes ?? QUOTA_CONTRACTS.library.warningBytes)
  return { bytesUsed, objectCount: rows?.length ?? 0 }
}

export async function releaseExpiredReservations() {
  const now = new Date().toISOString()
  const { data: rows, error } = await admin.from('vh_quota_reservations')
    .select('id').eq('status', 'pending').lt('expires_at', now).limit(500)
  if (error) throw error
  let released = 0
  for (const row of rows ?? []) {
    const { data } = await admin.rpc('vh_finalize_quota_reservation', { p_reservation_id: row.id, p_commit: false })
    if (data) released++
  }
  return released
}
