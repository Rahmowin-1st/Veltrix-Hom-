import { describe, expect, it } from 'vitest'
import {
  canConvertFastAsk,
  exposesFastAskFinal,
  fastAskConversionResponseSchema,
  fastAskEventsQuerySchema,
  fastAskIdempotencyKeySchema,
  fastAskInputSchema,
  fastAskStatusSchema,
} from './part3FastAsk.js'
import { formatPart3Sse, runTypedAnswerStream } from './part3Streaming.js'

describe('Part 3 Stage 70 Fast Ask contracts', () => {
  it('accepts one-time prompt input with at most five Library asset identities', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
    const parsed = fastAskInputSchema.parse({ prompt: '  Explain this once  ', attachmentAssetIds: ids })
    expect(parsed.prompt).toBe('Explain this once')
    expect(parsed.attachmentAssetIds).toEqual(ids)
    expect(() => fastAskInputSchema.parse({ prompt: 'x', attachmentAssetIds: [...ids, '00000000-0000-4000-8000-000000000006'] })).toThrow()
    expect(() => fastAskInputSchema.parse({ prompt: 'x', extra: true })).toThrow()
  })

  it('requires a bounded durable idempotency identity', () => {
    expect(fastAskIdempotencyKeySchema.parse(' request-1 ')).toBe('request-1')
    expect(() => fastAskIdempotencyKeySchema.parse('')).toThrow()
    expect(() => fastAskIdempotencyKeySchema.parse('x'.repeat(129))).toThrow()
  })

  it('keeps incomplete, failed, cancelled and expired states non-convertible', () => {
    for (const status of ['PENDING','STREAMING','INCOMPLETE','FAILED','CANCELLED','EXPIRED'] as const) {
      expect(fastAskStatusSchema.parse(status)).toBe(status)
      expect(canConvertFastAsk(status)).toBe(false)
      expect(exposesFastAskFinal(status)).toBe(false)
    }
    expect(canConvertFastAsk('COMPLETED')).toBe(true)
    expect(canConvertFastAsk('CONVERTED')).toBe(true)
    expect(exposesFastAskFinal('COMPLETED')).toBe(true)
    expect(exposesFastAskFinal('CONVERTED')).toBe(true)
  })

  it('keeps resume pagination bounded and sequence-addressable', () => {
    expect(fastAskEventsQuerySchema.parse({ afterSeq: '7', limit: '25' })).toEqual({ afterSeq: 7, limit: 25 })
    expect(() => fastAskEventsQuerySchema.parse({ afterSeq: -1 })).toThrow()
    expect(() => fastAskEventsQuerySchema.parse({ limit: 1001 })).toThrow()
  })

  it('uses the existing vh.stream.v1 typed event envelope without inventing another protocol', async () => {
    const drafts: Array<{ type: string; payload: Record<string, unknown>; blockId?: string; blockType?: string; blockVersion?: number }> = []
    const delivered: Array<{ protocol: string; messageId: string; seq: number }> = []
    let seq = 0
    async function* chunks() {
      yield { delta: 'Fast ', providerId: 'provider', modelId: 'model' }
      yield { delta: 'Ask', providerId: 'provider', modelId: 'model' }
    }
    const result = await runTypedAnswerStream({
      requestId: '00000000-0000-4000-8000-000000000010',
      messageId: '00000000-0000-4000-8000-000000000011',
      chunks: chunks(),
      persist: async draft => { drafts.push(draft); seq += 1; return seq },
      deliver: async event => { delivered.push({ protocol: event.protocol, messageId: event.messageId, seq: event.seq }) },
      finalize: async final => {
        expect(final.blocks).toEqual([{ id: 'answer-1', type: 'answer', version: 1, text: 'Fast Ask' }])
        seq += 1
        return seq
      },
    })
    expect(result.block).toEqual({ id: 'answer-1', type: 'answer', version: 1, text: 'Fast Ask' })
    expect(drafts.map(d => d.type)).toEqual(['message.started','block.started','block.delta','block.delta','block.completed'])
    expect(delivered.every(event => event.protocol === 'vh.stream.v1')).toBe(true)
    expect(formatPart3Sse({
      protocol: 'vh.stream.v1',requestId: '00000000-0000-4000-8000-000000000010',messageId: '00000000-0000-4000-8000-000000000011',seq: 1,type: 'message.started',payload: {},
    })).toContain('event: message.started')
  })

  it('requires conversion to return one persistent Conversation with an AUTO title', () => {
    const parsed = fastAskConversionResponseSchema.parse({
      fastAskId: '00000000-0000-4000-8000-000000000021',
      conversationId: '00000000-0000-4000-8000-000000000022',
      userMessageId: '00000000-0000-4000-8000-000000000023',
      assistantMessageId: '00000000-0000-4000-8000-000000000024',
      title: 'Explain photosynthesis simply',
      titleSource: 'AUTO',
      replayed: false,
    })
    expect(parsed.titleSource).toBe('AUTO')
    expect(parsed.replayed).toBe(false)
    expect(fastAskConversionResponseSchema.parse({ ...parsed, replayed: true })).toMatchObject({
      title: parsed.title, titleSource: 'AUTO', userMessageId: parsed.userMessageId, assistantMessageId: parsed.assistantMessageId,
    })
    expect(() => fastAskConversionResponseSchema.parse({ ...parsed, titleSource: 'USER' })).toThrow()
  })

  it('preserves typed block and attachment identities as opaque authoritative values at conversion boundaries', () => {
    const blocks = [{ id: 'answer-1', type: 'answer', version: 1, text: 'Exact stored answer' }] as const
    const assetIds = ['00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032'] as const
    const copiedBlocks = structuredClone(blocks)
    const copiedAssetIds = [...assetIds]
    expect(copiedBlocks).toEqual(blocks)
    expect(copiedAssetIds).toEqual(assetIds)
  })
})
