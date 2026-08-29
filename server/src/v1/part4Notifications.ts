import type { Request } from 'express'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { digestSecret } from './crypto.js'
import { ApiError } from './errors.js'
import { enqueueJob, registerJobHandler } from './jobs.js'

type CanonicalRequest = Request & { accountId?: string }
function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

export type PushProviderId = 'FCM' | 'OTHER'
export type SafePushPayload = {
  notificationId: string
  eventType: string
  category: string
  titleKey: string
  target: Record<string, unknown>
  priority: 'LOW' | 'NORMAL' | 'HIGH'
  progress?: number
  imageObjectId?: string
}

export interface PushProvider {
  id: PushProviderId
  send(token: string, payload: SafePushPayload, signal?: AbortSignal): Promise<{ messageId?: string }>
}

const pushProviders = new Map<PushProviderId, PushProvider>()
export function registerPushProvider(provider: PushProvider, replace = false) {
  if (pushProviders.has(provider.id) && !replace) throw new Error(`duplicate_push_provider:${provider.id}`)
  pushProviders.set(provider.id, provider)
}

function tokenKey() {
  const secret = process.env.APP_HMAC_SECRET
  if (!secret || secret.length < 32) throw new Error('APP_HMAC_SECRET must be at least 32 characters')
  return createHash('sha256').update(`part4.push-token\0${secret}`).digest()
}

export function encryptPushToken(token: string) {
  if (token.length < 8 || token.length > 4096) throw new ApiError(400, 'PUSH_TOKEN_INVALID', 'Push token is invalid.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptPushToken(envelope: string) {
  const [version, ivText, tagText, ciphertextText] = envelope.split('.')
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) throw new Error('push_token_envelope_invalid')
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')
}

export function parseSafePushPayload(input: unknown): SafePushPayload {
  return z.object({
    notificationId: z.string().uuid(),
    eventType: z.string().min(1).max(120),
    category: z.string().min(1).max(80),
    titleKey: z.string().min(1).max(160),
    target: z.record(z.unknown()).default({}),
    priority: z.enum(['LOW','NORMAL','HIGH']),
    progress: z.number().min(0).max(1).optional(),
    imageObjectId: z.string().uuid().optional(),
  }).strict().parse(input)
}

async function enqueueNotificationDelivery(account: string, notificationId: string) {
  const { data, error } = await admin.from('vh_notifications')
    .select('id,outside_state').eq('id', notificationId).eq('account_id', account).maybeSingle()
  if (error) throw error
  if (data?.outside_state !== 'QUEUED') return null
  return enqueueJob({
    accountId: account,
    kind: 'notification.deliver',
    payload: { notificationId },
    idempotencyKey: `notification:${notificationId}`,
    maxAttempts: 5,
    provenance: { source: 'part4.notification', notificationId },
  })
}

export async function claimNotificationDelivery(account: string, notificationId: string, deviceTokenId: string, provider: PushProviderId) {
  const { data, error } = await admin.rpc('vh_claim_notification_delivery', {
    p_account_id: account,
    p_notification_id: notificationId,
    p_device_token_id: deviceTokenId,
    p_provider: provider,
  })
  if (error) throw error
  return Boolean(data)
}

export async function emitNotification(input: {
  accountId: string
  eventType: string
  category: string
  severity: 'info'|'success'|'warning'|'error'|'progress'|'action-needed'
  titleKey: string
  bodyData?: Record<string, unknown>
  target?: Record<string, unknown>
  priority?: 'LOW'|'NORMAL'|'HIGH'
  safeMetadata?: { progress?: number; imageObjectId?: string }
}) {
  const { data, error } = await admin.rpc('vh_emit_notification', {
    p_account_id: input.accountId,
    p_event_type: input.eventType,
    p_category: input.category,
    p_severity: input.severity,
    p_title_key: input.titleKey,
    p_body_data: input.bodyData ?? {},
    p_target: input.target ?? {},
    p_priority: input.priority ?? 'NORMAL',
    p_safe_metadata: input.safeMetadata ?? {},
  })
  if (error) throw error
  const notificationId = String(data)
  await enqueueNotificationDelivery(input.accountId, notificationId)
  return notificationId
}

export async function evaluateLibraryAttention(account: string, bytesUsed: number, warningBytes: number) {
  const { data, error } = await admin.rpc('vh_update_library_attention', {
    p_account_id: account,
    p_bytes_used: bytesUsed,
    p_warning_bytes: warningBytes,
    p_cooldown_seconds: 7 * 24 * 60 * 60,
  })
  if (error) throw error
  const notificationId = data ? String(data) : null
  if (notificationId) await enqueueNotificationDelivery(account, notificationId)
  return notificationId
}

export async function deliverQueuedNotification(account: string, notificationId: string, signal?: AbortSignal, providers = pushProviders) {
  const { data: notification, error } = await admin.from('vh_notifications')
    .select('id,account_id,outside_state,outside_payload').eq('id', notificationId).eq('account_id', account).maybeSingle()
  if (error) throw error
  if (!notification) throw new Error('notification_not_found')
  if (notification.outside_state !== 'QUEUED') return { state: notification.outside_state, sent: 0, failed: 0, skipped: 0 }
  const payload = parseSafePushPayload(notification.outside_payload)
  const { data: tokens, error: tokenError } = await admin.from('vh_device_tokens')
    .select('id,provider,encrypted_token').eq('account_id', account).eq('active', true).is('revoked_at', null).limit(50)
  if (tokenError) throw tokenError
  if (!tokens?.length) {
    await admin.from('vh_notifications').update({ outside_state: 'NOT_ELIGIBLE', outside_updated_at: new Date().toISOString() }).eq('id', notificationId).eq('account_id', account)
    return { state: 'NOT_ELIGIBLE', sent: 0, failed: 0, skipped: 0 }
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  for (const tokenRow of tokens) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted','AbortError')
    const providerId = z.enum(['FCM','OTHER']).parse(tokenRow.provider)
    const claimed = await claimNotificationDelivery(account, notificationId, tokenRow.id, providerId)
    if (!claimed) {
      skipped++
      continue
    }

    const provider = providers.get(providerId)
    const base = { provider: providerId, updated_at: new Date().toISOString() }
    if (!provider) {
      failed++
      const { error: deliveryUpdateError } = await admin.from('vh_notification_deliveries')
        .update({ ...base, state: 'FAILED', safe_error_code: 'PROVIDER_UNAVAILABLE' })
        .eq('account_id', account).eq('notification_id', notificationId).eq('device_token_id', tokenRow.id)
      if (deliveryUpdateError) throw deliveryUpdateError
      continue
    }
    try {
      const rawToken = decryptPushToken(tokenRow.encrypted_token)
      const result = await provider.send(rawToken, payload, signal)
      sent++
      const { error: deliveryUpdateError } = await admin.from('vh_notification_deliveries')
        .update({ ...base, state: 'SENT', safe_error_code: null, provider_message_id: result.messageId ?? null, sent_at: new Date().toISOString() })
        .eq('account_id', account).eq('notification_id', notificationId).eq('device_token_id', tokenRow.id)
      if (deliveryUpdateError) throw deliveryUpdateError
    } catch (deliveryError) {
      failed++
      const code = deliveryError instanceof Error ? deliveryError.name.slice(0,120) : 'DELIVERY_ERROR'
      const { error: deliveryUpdateError } = await admin.from('vh_notification_deliveries')
        .update({ ...base, state: 'FAILED', safe_error_code: code })
        .eq('account_id', account).eq('notification_id', notificationId).eq('device_token_id', tokenRow.id)
      if (deliveryUpdateError) throw deliveryUpdateError
    }
  }

  if (sent === 0 && failed === 0) {
    const { data: current, error: currentError } = await admin.from('vh_notifications')
      .select('outside_state').eq('id', notificationId).eq('account_id', account).maybeSingle()
    if (currentError) throw currentError
    return { state: current?.outside_state ?? 'QUEUED', sent, failed, skipped }
  }

  const finalState = sent > 0 ? 'SENT' : 'FAILED'
  if (finalState === 'SENT') {
    const { error: updateError } = await admin.from('vh_notifications')
      .update({ outside_state: 'SENT', outside_updated_at: new Date().toISOString() })
      .eq('id', notificationId).eq('account_id', account).in('outside_state', ['QUEUED','FAILED'])
    if (updateError) throw updateError
  } else {
    const { error: updateError } = await admin.from('vh_notifications')
      .update({ outside_state: 'FAILED', outside_updated_at: new Date().toISOString() })
      .eq('id', notificationId).eq('account_id', account).eq('outside_state','QUEUED')
    if (updateError) throw updateError
  }
  return { state: finalState, sent, failed, skipped }
}

registerJobHandler('notification.deliver', async ({ job, signal, checkpoint }) => {
  const owner = job.account_id
  if (!owner) throw new Error('notification_job_owner_required')
  const payload = z.object({ notificationId: z.string().uuid() }).parse(job.payload)
  await checkpoint({ phase: 'delivery' }, 0.2)
  const result = await deliverQueuedNotification(owner, payload.notificationId, signal)
  return { result }
})

const router = Router()
router.use(canonicalAuth)

router.get('/notifications/preferences', async (req, res, next) => {
  try {
    const { data, error } = await admin.from('vh_notification_preferences')
      .select('category,inside_enabled,outside_enabled,updated_at').eq('account_id', accountId(req)).order('category')
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.put('/notifications/preferences/:category', async (req, res, next) => {
  try {
    const category = z.string().trim().min(1).max(80).parse(req.params.category)
    const input = z.object({ insideEnabled: z.boolean(), outsideEnabled: z.boolean() }).parse(req.body)
    const { error } = await admin.rpc('vh_set_notification_preference', {
      p_account_id: accountId(req), p_category: category,
      p_inside_enabled: input.insideEnabled, p_outside_enabled: input.outsideEnabled,
    })
    if (error) throw error
    res.json({ category, ...input })
  } catch (error) { next(error) }
})

router.post('/notifications/devices', async (req, res, next) => {
  try {
    const owner = accountId(req)
    const input = z.object({
      provider: z.enum(['FCM','OTHER']).default('FCM'),
      token: z.string().min(8).max(4096),
      deviceLabel: z.string().max(160).optional(),
      replaceTokenId: z.string().uuid().optional(),
    }).parse(req.body)
    const digest = digestSecret(input.token, `part4.push-token:${input.provider}`)
    const encrypted = encryptPushToken(input.token)
    if (input.replaceTokenId) {
      const { error: revokeError } = await admin.from('vh_device_tokens').update({ active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('account_id', owner).eq('id', input.replaceTokenId)
      if (revokeError) throw revokeError
    }
    const { data, error } = await admin.from('vh_device_tokens').upsert({
      account_id: owner, provider: input.provider, token_digest: digest, encrypted_token: encrypted,
      device_label: input.deviceLabel ?? null, active: true, revoked_at: null,
      last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,provider,token_digest' }).select('id,provider,device_label,active,last_seen_at,created_at,updated_at').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (error) { next(error) }
})

router.delete('/notifications/devices/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const { data, error } = await admin.from('vh_device_tokens').update({ active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('account_id', accountId(req)).eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404, 'DEVICE_TOKEN_NOT_FOUND', 'Device token was not found.')
    res.json({ removed: true })
  } catch (error) { next(error) }
})

router.get('/notifications', async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
    const { data, error } = await admin.from('vh_notifications')
      .select('id,event_type,category,severity,title_key,body_data,target,priority,inside_state,outside_state,created_at,read_at,dismissed_at')
      .eq('account_id', accountId(req)).neq('inside_state','SUPPRESSED').order('created_at',{ ascending:false }).limit(limit)
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (error) { next(error) }
})

router.post('/notifications/:id/read', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const { data, error } = await admin.from('vh_notifications').update({ inside_state:'READ', read_at:new Date().toISOString() })
      .eq('account_id',accountId(req)).eq('id',id).in('inside_state',['VISIBLE','READ']).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404,'NOTIFICATION_NOT_FOUND','Notification was not found.')
    res.json({ read:true })
  } catch (error) { next(error) }
})

router.post('/notifications/:id/dismiss', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const { data, error } = await admin.from('vh_notifications').update({ inside_state:'DISMISSED', dismissed_at:new Date().toISOString() })
      .eq('account_id',accountId(req)).eq('id',id).in('inside_state',['VISIBLE','READ','DISMISSED']).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new ApiError(404,'NOTIFICATION_NOT_FOUND','Notification was not found.')
    res.json({ dismissed:true })
  } catch (error) { next(error) }
})

export { router as v1Part4NotificationsRouter }
