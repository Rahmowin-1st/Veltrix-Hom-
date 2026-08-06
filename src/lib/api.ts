import { getAccessToken } from '@/lib/supabase'
import type { ActivitySummary, AnswerBlock, ChatSearchHit, ChatSummary, Citation, Project, Quiz, QuizAttempt, Skill, Source, SourceMode, Subject } from '@/types'

const BASE = import.meta.env.VITE_API_URL || ''

/** Requests that transiently fail are worth retrying; these are not. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 409, 413, 422])
/** AI generation legitimately takes a while; everything else should be quick. */
const DEFAULT_TIMEOUT_MS = 30_000
const LONG_TIMEOUT_MS = 120_000

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  opts: { timeoutMs?: number; retries?: number } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? (path === '/api/chat' ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)
  const maxAttempts = (opts.retries ?? 2) + 1
  let lastError: unknown
  let authRetried = false

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Every attempt gets its own timeout, linked to any caller-supplied
    // signal so switching chats or unmounting still aborts immediately.
    const timeoutController = new AbortController()
    const timer = window.setTimeout(() => timeoutController.abort(), timeoutMs)
    const onCallerAbort = () => timeoutController.abort()
    init?.signal?.addEventListener('abort', onCallerAbort)

    try {
      const token = await getAccessToken()
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        signal: timeoutController.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      })

      if (!res.ok) {
        if (res.status === 401 && !authRetried) {
          authRetried = true
          await getAccessToken(true)
          attempt -= 1
          continue
        }
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        const error = new ApiError(body?.message ?? uzbekStatus(res.status), res.status)
        // Client errors are the caller's problem and will fail identically
        // on every retry, so surface them straight away.
        if (NO_RETRY_STATUS.has(res.status) || attempt === maxAttempts - 1) throw error
        lastError = error
      } else {
        return await res.json() as T
      }
    } catch (e) {
      // A caller-initiated abort is intentional and must never be retried.
      if (init?.signal?.aborted) throw new ApiError('So\'rov bekor qilindi.', 0)
      if (e instanceof ApiError && NO_RETRY_STATUS.has(e.status)) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt === maxAttempts - 1) {
        throw lastError instanceof ApiError
          ? lastError
          : new ApiError('⚠️ Ulanish uzildi. Qayta urinib ko\'ring.', 0)
      }
    } finally {
      window.clearTimeout(timer)
      init?.signal?.removeEventListener('abort', onCallerAbort)
    }

    // Exponential backoff before the next attempt: 400ms, 800ms.
    await new Promise((resolve) => window.setTimeout(resolve, 400 * 2 ** attempt))
  }

  throw lastError instanceof Error ? lastError : new ApiError('⚠️ So\'rov bajarilmadi.', 0)
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

/**
 * The outcome of submitting a message. A plain `ChatResponse` is NOT enough:
 * the server answers 202 when another attempt already owns the request, and
 * 409 when the previous attempt's state is uncertain or the lease was lost.
 * V8 cast every 2xx body straight to ChatResponse, so a 202 "still working"
 * body was rendered as a finished (empty) answer. This union forces the
 * caller to branch on what actually happened.  (V9 2.7)
 */
export type SubmitResult =
  | { kind: 'completed'; response: ChatResponse }
  | { kind: 'processing'; chatId: string | null; clientRequestId: string; retryAfterMs?: number }
  | { kind: 'uncertain'; chatId: string | null; clientRequestId: string; message?: string }
  | { kind: 'failed'; status: number; code?: string; message: string }

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const api = {
  sendMessage: async (input: {
    chatId?: string | null
    text: string
    lockedSourceId?: string | null
    lockedSourceIds?: string[]
    image?: { mimeType: string; data: string } | null
    media?: { mimeType: string; data: string; name?: string } | null
    talentId?: string | null
    /** Stable per-attempt id so a double-tap or retry cannot duplicate the
     *  message. The server replays the stored answer instead. */
    clientMessageId?: string
    /** Global idempotency key, reused unchanged by every retry. */
    clientRequestId?: string
  }, signal?: AbortSignal): Promise<SubmitResult> => {
    // One safe auth refresh is allowed, but the idempotency key is reused,
    // so a retry can never create a duplicate user message or model answer.
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), LONG_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort)
    try {
      for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
        const token = await getAccessToken(authAttempt === 1)
        const res = await fetch(`${BASE}/api/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(input),
        })
        const responseBody = (await res.json().catch(() => null)) as Record<string, unknown> | null
        if (res.status === 401 && authAttempt === 0) continue

        if (res.status === 202) {
          const retryHeader = Number(res.headers.get('Retry-After'))
          return {
            kind: 'processing',
            chatId: (responseBody?.chatId as string | undefined) ?? input.chatId ?? null,
            clientRequestId: (responseBody?.clientRequestId as string | undefined) ?? input.clientRequestId ?? '',
            retryAfterMs: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : undefined,
          }
        }
        if (res.status === 409 && (responseBody?.code === 'uncertain' || responseBody?.code === 'lease_lost')) {
          return {
            kind: 'uncertain',
            chatId: (responseBody?.chatId as string | undefined) ?? null,
            clientRequestId: (responseBody?.clientRequestId as string | undefined) ?? input.clientRequestId ?? '',
            message: responseBody?.message as string | undefined,
          }
        }
        if (res.ok) return { kind: 'completed', response: responseBody as unknown as ChatResponse }
        return {
          kind: 'failed', status: res.status,
          code: responseBody?.code as string | undefined,
          message: (responseBody?.message as string | undefined) ?? uzbekStatus(res.status),
        }
      }
      return { kind: 'failed', status: 401, message: uzbekStatus(401) }
    } catch (error) {
      if (signal?.aborted) return { kind: 'failed', status: 0, message: 'So\'rov bekor qilindi.' }
      return { kind: 'failed', status: 0, message: error instanceof Error ? error.message : '⚠️ Ulanish uzildi. Qayta urinib ko\'ring.' }
    } finally {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  },

  history: (chatId: string, opts?: { limit?: number; before?: string }) => {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.before) params.set('before', opts.before)
    const qs = params.toString()
    return request<{
      chat: ChatSummary; sourceIds: string[]; messages: unknown[]
      hasMore?: boolean; oldestCursor?: string | null
    }>(`/api/chat/${chatId}${qs ? `?${qs}` : ''}`)
  },

  /**
   * Recovers a request whose HTTP response was lost. Returns the persisted
   * answer if it completed, so the client never has to re-ask the model.
   */
  requestStatus: (clientRequestId: string) =>
    request<{
      code: 'completed' | 'processing' | 'uncertain' | 'failed'
      chatId: string | null; messageId?: string | null
      blocks?: AnswerBlock[]; subject?: string | null
      sourceMode?: SourceMode; message?: string; errorCode?: string
    }>(`/api/chat/requests/${clientRequestId}`, undefined, { retries: 0 }),

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

  /**
   * Correct the printed-page mapping for a source. The user is the highest-
   * trust signal we have: this anchor outranks every inferred mapping and the
   * page segments are rebuilt around it.
   */
  setPageAnchor: (id: string, pdfPage: number, printedPage: number) =>
    request<{ ok: true; pdfPage: number; printedPage: number }>(
      `/api/sources/${id}/page-anchor`,
      { method: 'POST', body: JSON.stringify({ pdfPage, printedPage }) },
    ),

  /** Release source reservations whose upload never completed. */
  cleanupAbandonedUploads: () =>
    request<{ ok: true; removed: number }>('/api/sources/cleanup-uploads', { method: 'POST' }),

  /** Resume a source whose indexing paused when the AI quota ran out. */
  resume: (id: string) => request<{ ok: true; status: string }>(`/api/sources/${id}/resume`, { method: 'POST' }),

  /** Cancel an in-flight or queued processing job. */
  cancel: (id: string) => request<{ ok: true; status: string }>(`/api/sources/${id}/cancel`, { method: 'POST' }),

  subjects: () => request<{ subjects: Subject[] }>('/api/sources/subjects'),

  /**
   * Resumable, memory-safe upload (preferred path).
   *
   * Bytes travel device → Supabase Storage over TUS, so the API server never
   * buffers the PDF, and a dropped mobile connection resumes from the last
   * acknowledged chunk instead of restarting. Falls back to the signed-URL
   * XHR path if TUS is unavailable.
   */
  uploadResumable: async (opts: {
    file: File
    title: string
    emoji: string
    color: string
    grade: number | null
    subject_id: string | null
    userId: string
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  }): Promise<{ sourceId: string; status: string }> => {
    const bytes = await opts.file.arrayBuffer()
    const fileHash = await sha256Hex(bytes)
    const created = await request<{ sourceId: string; storagePath: string; uploadUrl: string }>(
      '/api/sources/upload/create',
      { method: 'POST', signal: opts.signal, body: JSON.stringify({
        title: opts.title, emoji: opts.emoji, color: opts.color,
        grade: opts.grade, subject_id: opts.subject_id,
        file_hash: fileHash, file_size: opts.file.size, protocol: 'tus',
      }) },
      { retries: 0 },
    )
    try {
      const { tusUpload } = await import('./tusUpload')
      await tusUpload({
        file: opts.file,
        storagePath: created.storagePath,
        userId: opts.userId,
        onProgress: opts.onProgress,
        signal: opts.signal,
      })
    } catch (e) {
      // Release the reservation so the duplicate-hash guard does not block a
      // retry of the same file.
      await request(`/api/sources/upload/${created.sourceId}/abort`, { method: 'POST' }, { retries: 0 }).catch(() => undefined)
      throw e
    }
    return request<{ sourceId: string; status: string }>(
      `/api/sources/upload/${created.sourceId}/finalize`, { method: 'POST', signal: opts.signal }, { retries: 0 },
    )
  },

  /**
   * Signed-URL upload with XHR progress. Fallback when TUS is unavailable.
   */
  uploadSigned: async (opts: {
    file: File
    title: string
    emoji: string
    color: string
    grade: number | null
    subject_id: string | null
    onProgress?: (percent: number) => void
  }): Promise<{ sourceId: string; status: string }> => {
    const bytes = await opts.file.arrayBuffer()
    const fileHash = await sha256Hex(bytes)
    const created = await request<{ sourceId: string; uploadUrl: string; token: string; storagePath: string }>(
      '/api/sources/upload/create',
      { method: 'POST', body: JSON.stringify({
        title: opts.title, emoji: opts.emoji, color: opts.color,
        grade: opts.grade, subject_id: opts.subject_id,
        file_hash: fileHash, file_size: opts.file.size,
      }) },
      { retries: 0 },
    )
    try {
      await putSignedUpload(created.uploadUrl, opts.file, opts.onProgress)
    } catch (e) {
      // The reservation exists but no bytes landed — release it so a retry
      // is not blocked by the duplicate-hash guard.
      await request(`/api/sources/upload/${created.sourceId}/abort`, { method: 'POST' }, { retries: 0 }).catch(() => undefined)
      throw e
    }
    return request<{ sourceId: string; status: string }>(
      `/api/sources/upload/${created.sourceId}/finalize`, { method: 'POST' }, { retries: 0 },
    )
  },

  /** Real multipart upload with measurable progress via XHR. */
  upload: (opts: {
    file: File
    title: string
    emoji: string
    color: string
    grade: number | null
    subject_id: string | null
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  }) => {
    const form = new FormData()
    form.append('file', opts.file)
    form.append('title', opts.title)
    form.append('emoji', opts.emoji)
    form.append('color', opts.color)
    if (opts.grade !== null) form.append('grade', String(opts.grade))
    if (opts.subject_id) form.append('subject_id', opts.subject_id)
    return requestForm<{ sourceId: string; status: string }>(
      '/api/sources/upload', form, opts.onProgress, opts.signal
    )
  },
}

/**
 * PUTs raw file bytes to a Supabase signed upload URL with real progress.
 * The auth token is embedded in the signed URL's query string, so a bare
 * PUT of the file body is all that is required.
 */
async function putSignedUpload(uploadUrl: string, file: File, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/pdf')
    xhr.setRequestHeader('x-upsert', 'false')
    if (onProgress) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Yuklash muvaffaqiyatsiz (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('Internet aloqasi uzildi.'))
    xhr.ontimeout = () => reject(new Error("So'rov vaqti tugadi."))
    xhr.send(file)
  })
}

/**
 * Multipart requests go through XHR rather than fetch, because only XHR
 * reports upload progress — a real percentage instead of a fake animation.
 */
async function requestForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
    const token = await getAccessToken(authAttempt === 1)
    const result = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      if (signal?.aborted) { reject(new ApiError("So'rov bekor qilindi.", 0)); return }
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}${path}`)
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      const abort = () => xhr.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
        }
      }
      xhr.onload = () => {
        signal?.removeEventListener('abort', abort)
        let body: unknown = null
        try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error page */ }
        resolve({ status: xhr.status, body })
      }
      xhr.onerror = () => { signal?.removeEventListener('abort', abort); reject(new Error('Internet aloqasi uzildi.')) }
      xhr.onabort = () => { signal?.removeEventListener('abort', abort); reject(new ApiError("So'rov bekor qilindi.", 0)) }
      xhr.ontimeout = () => { signal?.removeEventListener('abort', abort); reject(new Error("So'rov vaqti tugadi.")) }
      xhr.send(form)
    })

    if (result.status >= 200 && result.status < 300) return result.body as T
    if (result.status === 401 && authAttempt === 0) continue
    const message = (result.body as { message?: string } | null)?.message
    throw new ApiError(message ?? uzbekStatus(result.status), result.status)
  }
  throw new ApiError('Sessiya tugadi. Qayta kiring.', 401)
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
