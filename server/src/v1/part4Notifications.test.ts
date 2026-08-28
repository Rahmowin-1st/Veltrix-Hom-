import { describe, expect, it } from 'vitest'
import { registeredJobKinds } from './jobs.js'
import { decryptPushToken, encryptPushToken, parseSafePushPayload, registerPushProvider, type PushProvider } from './part4Notifications.js'

process.env.APP_HMAC_SECRET ??= 'ci-only-placeholder-secret-0123456789abcdef0123456789abcdef'

describe('Part4 notifications and outside delivery infrastructure', () => {
  it('encrypts push tokens at rest with authenticated encryption', () => {
    const token = 'fcm-device-token-secret-value-123456789'
    const envelope = encryptPushToken(token)
    expect(envelope).toMatch(/^v1\./)
    expect(envelope).not.toContain(token)
    expect(decryptPushToken(envelope)).toBe(token)
    const parts = envelope.split('.')
    parts[3] = `${parts[3]!.slice(0,-1)}${parts[3]!.endsWith('A') ? 'B' : 'A'}`
    expect(() => decryptPushToken(parts.join('.'))).toThrow()
  })

  it('accepts only the bounded safe outside payload contract', () => {
    const payload = parseSafePushPayload({
      notificationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      eventType: 'library.storage.warning', category: 'library_attention', titleKey: 'library.storage.warning',
      target: { route: 'library' }, priority: 'HIGH', progress: 0.5,
    })
    expect(payload.target).toEqual({ route: 'library' })
    expect(() => parseSafePushPayload({ ...payload, body: 'private full content' })).toThrow()
    expect(() => parseSafePushPayload({ ...payload, progress: 2 })).toThrow()
  })

  it('registers durable delivery worker and provider abstraction', async () => {
    expect(registeredJobKinds()).toContain('notification.deliver')
    let observed: { token: string; titleKey: string } | null = null
    const fake: PushProvider = {
      id: 'OTHER',
      async send(token, payload) {
        observed = { token, titleKey: payload.titleKey }
        return { messageId: 'fake-message-1' }
      },
    }
    registerPushProvider(fake, true)
    const token = decryptPushToken(encryptPushToken('fake-provider-token-123456'))
    const payload = parseSafePushPayload({
      notificationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', eventType: 'test', category: 'test',
      titleKey: 'test.title', target: {}, priority: 'NORMAL',
    })
    const result = await fake.send(token, payload)
    expect(result.messageId).toBe('fake-message-1')
    expect(observed).toEqual({ token: 'fake-provider-token-123456', titleKey: 'test.title' })
  })
})
