import { getAccessToken } from '@/lib/supabase'
import type { AnswerBlock, Citation, SourceMode } from '@/types'

const BASE = import.meta.env.VITE_API_URL || ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? uzbekStatus(res.status))
  }
  return res.json() as Promise<T>
}

function uzbekStatus(status: number): string {
  if (status === 401) return 'Sessiya tugadi. Qayta kiring.'
  if (status === 429) return '⏳ Juda tez. Bir daqiqa kuting.'
  if (status >= 500) return '⚠️ Serverda xatolik. Birozdan keyin urinib ko\'ring.'
  return '⚠️ So\'rov bajarilmadi.'
}

export interface ChatResponse {
  messageId: string | null
  chatId: string
  blocks: AnswerBlock[]
  subject?: string | null
  topic?: string
  citations?: Citation[]
  stickers?: string[]
  followups?: string[]
  confidence?: number
  sourceMode?: SourceMode
  pagesUsed?: number[]
  latencyMs: number
  cached?: boolean
  quotaPercent?: number
}

export const api = {
  sendMessage: (input: {
    chatId?: string | null
    text: string
    lockedSourceId?: string | null
    image?: { mimeType: string; data: string } | null
  }) => request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(input) }),

  history: (chatId: string) =>
    request<{ messages: unknown[] }>(`/api/chat/${chatId}`),

  chats: () =>
    request<{ chats: { id: string; title: string; updated_at: string }[] }>('/api/chat/list'),

  quota: () => request<{ percent: number }>('/api/quota'),
}
