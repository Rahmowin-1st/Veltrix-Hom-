import { PART3_BLOCK_MAX_TEXT, answerBlockSchema, type AnswerBlock } from './part3Blocks.js'

export const PART3_STREAM_PROTOCOL = 'vh.stream.v1' as const
export const PART3_STREAM_MAX_TEXT = PART3_BLOCK_MAX_TEXT
export { answerBlockSchema }
export type { AnswerBlock }

export type Part3StreamEventType =
  | 'message.started'
  | 'block.started'
  | 'block.delta'
  | 'block.completed'
  | 'tool.started'
  | 'tool.progress'
  | 'tool.completed'
  | 'citation.added'
  | 'message.completed'
  | 'message.failed'
  | 'message.cancelled'
  | 'heartbeat'

export type StreamEventDraft = {
  type: Part3StreamEventType
  payload: Record<string, unknown>
  blockId?: string
  blockType?: string
  blockVersion?: number
}

export type PersistedStreamEvent = StreamEventDraft & {
  protocol: typeof PART3_STREAM_PROTOCOL
  requestId: string
  messageId: string
  seq: number
}

export class Part3StreamError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'Part3StreamError'
  }
}

type ProviderChunk = { delta: string; providerId: string; modelId: string }

type RunAnswerStreamInput = {
  requestId: string
  messageId: string
  chunks: AsyncIterable<ProviderChunk>
  signal?: AbortSignal
  persist: (draft: StreamEventDraft) => Promise<number>
  deliver: (event: PersistedStreamEvent) => Promise<void>
  finalize: (input: {
    plainText: string
    blocks: AnswerBlock[]
    providerId: string
    modelId: string
    characters: number
  }) => Promise<number>
}

function aborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

export async function runTypedAnswerStream(input: RunAnswerStreamInput) {
  const blockId = 'answer-1'
  const emit = async (draft: StreamEventDraft) => {
    aborted(input.signal)
    const seq = await input.persist(draft)
    const event: PersistedStreamEvent = {
      ...draft,
      protocol: PART3_STREAM_PROTOCOL,
      requestId: input.requestId,
      messageId: input.messageId,
      seq,
    }
    await input.deliver(event)
    return event
  }

  await emit({ type: 'message.started', payload: { status: 'STREAMING' } })
  await emit({
    type: 'block.started',
    blockId,
    blockType: 'answer',
    blockVersion: 1,
    payload: { id: blockId, type: 'answer', version: 1 },
  })

  let text = ''
  let providerId = ''
  let modelId = ''
  for await (const chunk of input.chunks) {
    aborted(input.signal)
    if (!chunk || typeof chunk.delta !== 'string' || typeof chunk.providerId !== 'string' ||
      typeof chunk.modelId !== 'string' || !chunk.providerId.trim() || !chunk.modelId.trim()) {
      throw new Part3StreamError('STREAM_PROVIDER_OUTPUT_INVALID', 'The AI route returned a malformed stream chunk.')
    }
    if (!chunk.delta) continue
    if (text.length + chunk.delta.length > PART3_STREAM_MAX_TEXT) {
      throw new Part3StreamError('STREAM_OUTPUT_TOO_LARGE', 'The streamed answer exceeded the supported final-message size.')
    }
    text += chunk.delta
    providerId = chunk.providerId
    modelId = chunk.modelId
    await emit({
      type: 'block.delta',
      blockId,
      blockType: 'answer',
      blockVersion: 1,
      payload: { path: ['text'], delta: chunk.delta },
    })
  }

  const clean = text.trim()
  if (!clean) throw new Part3StreamError('STREAM_EMPTY', 'The AI route returned no usable answer content.')
  const block = answerBlockSchema.parse({ id: blockId, type: 'answer', version: 1, text: clean })
  await emit({
    type: 'block.completed',
    blockId,
    blockType: 'answer',
    blockVersion: 1,
    payload: { id: block.id, type: block.type, version: block.version, characters: clean.length },
  })
  const completedSeq = await input.finalize({
    plainText: clean,
    blocks: [block],
    providerId,
    modelId,
    characters: clean.length,
  })
  const completed: PersistedStreamEvent = {
    protocol: PART3_STREAM_PROTOCOL,
    requestId: input.requestId,
    messageId: input.messageId,
    seq: completedSeq,
    type: 'message.completed',
    payload: { messageId: input.messageId, status: 'COMPLETED' },
  }
  await input.deliver(completed)
  return { block, characters: clean.length, providerId, modelId, completedSeq }
}

export function formatPart3Sse(event: PersistedStreamEvent) {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
