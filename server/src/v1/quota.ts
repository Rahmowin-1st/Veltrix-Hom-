import { admin } from '../services/supabase.js'
import { ApiError } from './errors.js'

export const MiB = 1024 * 1024
export const GiB = 1024 * MiB

export const QUOTA_CONTRACTS = {
  library: { hardBytes: 1 * GiB, warningBytes: 900 * MiB },
  projectReference: { maxItems: 20, maxTotalBytes: 50 * MiB },
  conversationReference: { maxItems: 1, maxTotalBytes: 20 * MiB },
  conversationMessageAttachments: { maxItems: 5, maxTotalBytes: 10 * MiB },
  fastAskAttachments: { maxItems: 5, maxTotalBytes: 10 * MiB },
  studioCustomAttachments: { maxItems: 5, maxTotalBytes: 20 * MiB },
} as const

export async function libraryQuotaStatus(accountId: string) {
  const { data, error } = await admin.from('vh_quota_usage').select('bytes_used,bytes_reserved').eq('account_id', accountId).eq('scope', 'library').maybeSingle()
  if (error) throw error
  const used = Number(data?.bytes_used ?? 0)
  const reserved = Number(data?.bytes_reserved ?? 0)
  return {
    bytesUsed: used,
    bytesReserved: reserved,
    hardLimitBytes: QUOTA_CONTRACTS.library.hardBytes,
    warningAtBytes: QUOTA_CONTRACTS.library.warningBytes,
    warning: used + reserved >= QUOTA_CONTRACTS.library.warningBytes,
    remainingBytes: Math.max(0, QUOTA_CONTRACTS.library.hardBytes - used - reserved),
  }
}

export async function reserveLibraryQuota(accountId: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ApiError(400, 'INVALID_SIZE', 'Upload size is invalid.')
  const { data, error } = await admin.rpc('vh_reserve_quota', {
    p_account_id: accountId,
    p_scope: 'library',
    p_bytes: bytes,
    p_hard_limit: QUOTA_CONTRACTS.library.hardBytes,
  })
  if (error) {
    if (String(error.message).includes('quota_exceeded')) throw new ApiError(413, 'LIBRARY_QUOTA_EXCEEDED', 'Library storage limit reached.', await libraryQuotaStatus(accountId))
    throw error
  }
  return String(data)
}

export async function finalizeLibraryQuota(reservationId: string, commit: boolean) {
  const { data, error } = await admin.rpc('vh_finalize_quota_reservation', { p_reservation_id: reservationId, p_commit: commit })
  if (error) throw error
  if (!data) throw new ApiError(409, 'RESERVATION_NOT_PENDING', 'The storage reservation is no longer pending.')
}
