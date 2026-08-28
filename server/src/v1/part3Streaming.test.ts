import { describe, expect, it } from 'vitest'
import { PART3_STREAM_PROTOCOL, Part3StreamError, formatPart3Sse, runTypedAnswerStream, type StreamEventDraft } from './part3Streaming.js'

async function* chunks(values: string[]) {
  for (const delta of values) yield { delta, providerId: 'provider-a', modelId: 'fast-model' }
}

describe('Part 3 typed Conversation streaming', () => {
  it('persists monotonic typed partial events before one coherent final block', async () => {
    const drafts: StreamEventDraft[] = []
    const delivered: Array<{ seq: number; type: string }> = []
    let finalized: unknown = null
    const result = await runTypedAnswerStream({
      requestId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      chunks: chunks(['Hello ', 'world']),
      persist: async draft => { drafts.push(draft); return drafts.length },
      deliver: async event => { delivered.push({ seq: event.seq, type: event.type }) },
      finalize: async input => { finalized = input; return drafts.length + 1 },
    })

    expect(drafts.map(event => event.type)).toEqual([
      'message.started','block.started','block.delta','block.delta','block.completed',
    ])
    expect(delivered.map(event => event.seq)).toEqual([1,2,3,4,5,6])
    expect(delivered.at(-1)?.type).toBe('message.completed')
    expect(result.block).toEqual({ id: 'answer-1', type: 'answer', version: 1, text: 'Hello world' })
    expect(finalized).toMatchObject({ plainText: 'Hello world', characters: 11, providerId: 'provider-a', modelId: 'fast-model' })
  })

  it('does not finalize an aborted partial stream', async () => {
    const controller = new AbortController()
    let seq = 0
    let finalized = false
    async function* interrupted() {
      yield { delta: 'partial', providerId: 'provider-a', modelId: 'fast-model' }
      controller.abort(new DOMException('Client disconnected', 'AbortError'))
      yield { delta: 'never', providerId: 'provider-a', modelId: 'fast-model' }
    }
    await expect(runTypedAnswerStream({
      requestId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      chunks: interrupted(),
      signal: controller.signal,
      persist: async () => ++seq,
      deliver: async () => undefined,
      finalize: async () => { finalized = true; return ++seq },
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(finalized).toBe(false)
  })

  it('fails closed on an empty provider result', async () => {
    let seq = 0
    await expect(runTypedAnswerStream({
      requestId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      chunks: chunks([]),
      persist: async () => ++seq,
      deliver: async () => undefined,
      finalize: async () => ++seq,
    })).rejects.toMatchObject({ code: 'STREAM_EMPTY' })
  })

  it('fails closed on malformed and partial provider chunks without finalizing', async () => {
    let finalized = false
    async function* malformed() {
      yield { delta: 'valid prefix', providerId: 'provider-a', modelId: 'fast-model' }
      yield { delta: 42, providerId: 'provider-a', modelId: 'fast-model' } as never
    }
    await expect(runTypedAnswerStream({
      requestId: '11111111-1111-4111-8111-111111111111', messageId: '22222222-2222-4222-8222-222222222222',
      chunks: malformed(), persist: async () => 1, deliver: async () => undefined,
      finalize: async () => { finalized = true; return 2 },
    })).rejects.toMatchObject({ code: 'STREAM_PROVIDER_OUTPUT_INVALID' })
    expect(finalized).toBe(false)
  })

  it('propagates stale-writer rejection and never emits a false completion', async () => {
    const delivered: string[] = []
    await expect(runTypedAnswerStream({
      requestId: '11111111-1111-4111-8111-111111111111', messageId: '22222222-2222-4222-8222-222222222222',
      chunks: chunks(['complete candidate']), persist: async () => delivered.length + 1,
      deliver: async event => { delivered.push(event.type) },
      finalize: async () => { throw new Error('conversation_message_not_streaming') },
    })).rejects.toThrow('conversation_message_not_streaming')
    expect(delivered).not.toContain('message.completed')
  })

  it('formats sequence-addressable protocol-v1 SSE without flattening event type', () => {
    const event = {
      protocol: PART3_STREAM_PROTOCOL,
      requestId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      seq: 7,
      type: 'block.delta' as const,
      blockId: 'answer-1',
      blockType: 'answer',
      blockVersion: 1,
      payload: { path: ['text'], delta: 'x' },
    }
    const wire = formatPart3Sse(event)
    expect(wire).toContain('id: 7\n')
    expect(wire).toContain('event: block.delta\n')
    expect(wire).toContain('"protocol":"vh.stream.v1"')
  })

  it('exposes bounded-output failures as typed backend errors', () => {
    const error = new Part3StreamError('STREAM_OUTPUT_TOO_LARGE', 'bounded')
    expect(error.code).toBe('STREAM_OUTPUT_TOO_LARGE')
  })
})
