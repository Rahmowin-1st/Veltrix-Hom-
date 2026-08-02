import { getAccessToken } from '@/lib/supabase'
import type { AnswerBlock, ChatSearchHit, ChatSummary, Citation, Project, Source, SourceMode, Subject } from '@/types'

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

  chats: () => request<{ chats: ChatSummary[] }>('/api/chat/list'),

  patchChat: (id: string, patch: {
    title?: string; pinned?: boolean; archived?: boolean
    draft?: string | null; project_id?: string | null
  }) => request<{ ok: true }>(`/api/chat/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  searchChats: (query: string) =>
    request<{ results: ChatSearchHit[] }>(`/api/chat/search/${encodeURIComponent(query)}`),

  deleteChat: (id: string) =>
    request<{ ok: true }>(`/api/chat/${id}`, { method: 'DELETE' }),

  quota: () => request<{ percent: number }>('/api/quota'),
}

/* --- projects ------------------------------------------------------- */
export const projectApi = {
  list: () => request<{ projects: Project[] }>('/api/projects'),

  create: (body: Partial<Project> & { name: string }) =>
    request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<Project>) =>
    request<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  remove: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),

  sources: (id: string) => request<{ sources: Source[] }>(`/api/projects/${id}/sources`),

  setSources: (id: string, sourceIds: string[]) =>
    request<{ ok: true }>(`/api/projects/${id}/sources`, {
      method: 'PUT', body: JSON.stringify({ sourceIds }),
    }),
}

/* --- sources & subjects ---------------------------------------------- */
export const sourceApi = {
  list: () => request<{ sources: Source[] }>('/api/sources'),

  update: (id: string, body: Partial<Pick<Source, 'title' | 'subject_id' | 'grade' | 'is_active'>>) =>
    request<{ source: Source }>(`/api/sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  remove: (id: string) => request<{ ok: true }>(`/api/sources/${id}`, { method: 'DELETE' }),

  subjects: () => request<{ subjects: Subject[] }>('/api/sources/subjects'),
}
