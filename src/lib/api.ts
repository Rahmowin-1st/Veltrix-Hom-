import { getAccessToken } from '@/lib/supabase'
import type { ActivitySummary, AnswerBlock, ChatSearchHit, ChatSummary, Citation, Project, Quiz, QuizAttempt, Skill, Source, SourceMode, Subject } from '@/types'

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
    lockedSourceIds?: string[]
    image?: { mimeType: string; data: string } | null
    media?: { mimeType: string; data: string; name?: string } | null
    talentId?: string | null
  }, signal?: AbortSignal) => request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(input), signal }),

  history: (chatId: string) =>
    request<{ chat: ChatSummary; sourceIds: string[]; messages: unknown[] }>(`/api/chat/${chatId}`),

  chats: () => request<{ chats: ChatSummary[] }>('/api/chat/list'),

  patchChat: (id: string, patch: {
    title?: string; pinned?: boolean; archived?: boolean
    draft?: string | null; project_id?: string | null
    skill_id?: string | null; locked_source_id?: string | null
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

  update: (id: string, body: Partial<Pick<Source, 'title' | 'subject_id' | 'grade' | 'is_active' | 'emoji' | 'color'>>) =>
    request<{ source: Source }>(`/api/sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  remove: (id: string) => request<{ ok: true }>(`/api/sources/${id}`, { method: 'DELETE' }),

  reprocess: (id: string) => request<{ ok: true; status: string }>(`/api/sources/${id}/reprocess`, { method: 'POST' }),

  subjects: () => request<{ subjects: Subject[] }>('/api/sources/subjects'),

  /** Real multipart upload with measurable progress via XHR. */
  upload: (opts: {
    file: File
    title: string
    emoji: string
    color: string
    grade: number | null
    subject_id: string | null
    onProgress?: (percent: number) => void
  }) => {
    const form = new FormData()
    form.append('file', opts.file)
    form.append('title', opts.title)
    form.append('emoji', opts.emoji)
    form.append('color', opts.color)
    if (opts.grade !== null) form.append('grade', String(opts.grade))
    if (opts.subject_id) form.append('subject_id', opts.subject_id)
    return requestForm<{ sourceId: string; status: string }>(
      '/api/sources/upload', form, opts.onProgress
    )
  },
}

/**
 * Multipart requests go through XHR rather than fetch, because only XHR
 * reports upload progress — a real percentage instead of a fake animation.
 */
async function requestForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void
): Promise<T> {
  const token = await getAccessToken()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error page */ }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
      } else {
        const msg = (body as { message?: string } | null)?.message
        reject(new Error(msg ?? `So'rov bajarilmadi (${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new Error('Internet aloqasi uzildi.'))
    xhr.ontimeout = () => reject(new Error("So'rov vaqti tugadi."))
    xhr.send(form)
  })
}

/* --- skills ----------------------------------------------------------- */
export const skillApi = {
  list: () => request<{ skills: Skill[] }>('/api/skills'),

  create: (body: Partial<Skill> & { name: string }) =>
    request<{ skill: Skill }>('/api/skills', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<Skill>) =>
    request<{ skill: Skill }>(`/api/skills/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  duplicate: (id: string) =>
    request<{ skill: Skill }>(`/api/skills/${id}/duplicate`, { method: 'POST' }),

  remove: (id: string) => request<{ ok: true }>(`/api/skills/${id}`, { method: 'DELETE' }),

  refine: (body: { description: string; subject_slug?: string | null }) =>
    request<{ instructions: string }>('/api/skills/refine', { method: 'POST', body: JSON.stringify(body) }),
}

/* --- translation ------------------------------------------------------ */
export interface Language {
  code: string
  name: string
  native: string
  bcp47: string
}

export interface TranslateResult {
  detected: string
  original: string
  translated: string
  targetBcp47: string
  extracted: boolean
}

export const translateApi = {
  languages: () => request<{
    languages: Language[]
    accepts: Record<string, readonly string[]>
    maxBytes: number
  }>('/api/translate/languages'),

  translate: async (opts: {
    text?: string; from: string; to: string; file?: File | null
  }): Promise<TranslateResult> => {
    const form = new FormData()
    if (opts.text) form.append('text', opts.text)
    form.append('from', opts.from)
    form.append('to', opts.to)
    if (opts.file) form.append('file', opts.file)
    return requestForm<TranslateResult>('/api/translate', form)
  },
}


/* --- Personal activity ------------------------------------------------ */
export const activityApi = {
  summary: () => request<ActivitySummary>('/api/activity/summary'),
  log: (body: { kind: 'homework_done'|'source_used'|'skill_used'|'game_completed'; points: number; metadata?: Record<string, unknown> }) =>
    request<{ ok: true }>('/api/activity', { method: 'POST', body: JSON.stringify(body) }),
}

/* --- quizzes ---------------------------------------------------------- */
export interface QuizQuestionInput {
  question: string
  options: string[]
  correctIndex: number
  explanation?: string | null
  points?: number
}

export interface CreateQuizInput {
  title: string
  description?: string | null
  icon?: string
  cover_url?: string | null
  background_color?: string
  background_logo?: string | null
  source_id?: string | null
  subject_id?: string | null
  generation_mode: 'manual' | 'ai'
  prompt?: string | null
  question_count: number
  per_question_seconds?: number | null
  total_seconds?: number | null
  shuffle_questions: boolean
  shuffle_options: boolean
  questions?: QuizQuestionInput[]
}

export const quizApi = {
  list: () => request<{ quizzes: Quiz[] }>('/api/quizzes'),
  get: (id: string) => request<{ quiz: Quiz }>(`/api/quizzes/${id}`),
  create: (body: CreateQuizInput) => request<{ quiz: Quiz }>('/api/quizzes', {
    method: 'POST', body: JSON.stringify(body),
  }),
  update: (id: string, body: Partial<CreateQuizInput>) => request<{ quiz: Quiz }>(`/api/quizzes/${id}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  remove: (id: string) => request<{ ok: true }>(`/api/quizzes/${id}`, { method: 'DELETE' }),
  start: (id: string) => request<{ attempt: QuizAttempt }>(`/api/quizzes/${id}/attempts`, { method: 'POST' }),
  answer: (attemptId: string, body: {
    questionId: string; selectedIndex: number | null; timedOut: boolean; elapsedSeconds?: number | null
  }) => request<{ correct: boolean; correctIndex: number; explanation: string | null; points: number }>(
    `/api/quizzes/attempts/${attemptId}/answer`, { method: 'POST', body: JSON.stringify(body) }
  ),
  complete: (attemptId: string) => request<{ attempt: QuizAttempt }>(
    `/api/quizzes/attempts/${attemptId}/complete`, { method: 'POST' }
  ),
}
