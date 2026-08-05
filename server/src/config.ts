import { z } from 'zod'

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY yo\'q'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Model IDs are environment-overridable so a Google deprecation is a config
  // change, not a redeploy of new code. Defaults are the stable IDs below.
  GEMINI_ANSWER_MODEL: z.string().default('gemini-3.6-flash'),
  GEMINI_OCR_MODEL: z.string().default('gemini-3.6-flash'),
  GEMINI_ROUTER_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash-lite'),

  // Per-user abuse bounds (see services/limits.ts). Windows are seconds.
  LIMIT_OCR_PAGES_PER_HOUR: z.coerce.number().default(300),
  LIMIT_CHAT_REQUESTS_PER_HOUR: z.coerce.number().default(200),
  LIMIT_UPLOADS_PER_HOUR: z.coerce.number().default(20),
})

export const env = Env.parse(process.env)

/**
 * MODEL REGISTRY — verified against ai.google.dev on 2026-08-02.
 *
 * The original project spec targeted the Gemini 2.5 family and
 * gemini-embedding-001. Both are gone or going:
 *   · gemini-embedding-001 → shut down 2026-07-14, replaced by gemini-embedding-2
 *   · gemini-2.5-*         → 2.5 family shuts down October 2026
 *
 * Keep every model ID in this one object so a future migration is a
 * single-file change, not a hunt through the codebase.
 */
export const MODELS = {
  /** Subject / intent / language routing + slash-command parsing. Cheapest, highest RPM. */
  router: env.GEMINI_ROUTER_MODEL,
  /** Main homework answer, multi-page analysis, vision. */
  answer: env.GEMINI_ANSWER_MODEL,
  /** Page OCR with structured output. */
  ocr: env.GEMINI_OCR_MODEL,
  /** Fallback when `answer` is rate-limited. */
  fallback: env.GEMINI_FALLBACK_MODEL,
  /** RAG embeddings. 768 dims — auto-normalized by embedding-2, matches vector(768). */
  embedding: env.GEMINI_EMBEDDING_MODEL,
} as const

/** Version stamp stored beside every OCR result, so a schema change can be
 *  detected and those pages re-OCR'd instead of silently mixing formats. */
export const OCR_SCHEMA_VERSION = 'v10-ocr-1'

/** Gemini refuses very large inline PDFs; never send more than this many
 *  pages in one request — use targeted page renders instead. */
export const MAX_PDF_PAGES_PER_REQUEST = 30

export const EMBEDDING_DIM = 768

/** Cosine similarity above which we serve the cached answer and skip the AI entirely. */
export const CACHE_THRESHOLD = 0.94

/** Chunking: ~900 chars with 150 overlap, never crossing a page boundary. */
export const CHUNK_SIZE = 900
export const CHUNK_OVERLAP = 150

/** p-queue concurrency — protects the free-tier rate limit. */
export const QUEUE_CONCURRENCY = 2

/** Exponential backoff on 429: 1s → 2s → 4s → 8s, 4 attempts max. */
export const BACKOFF_MS = [1000, 2000, 4000, 8000] as const

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/**
 * gemini-embedding-2 dropped the task_type parameter. The task is now a
 * text prefix, and query and document must use different shapes.
 */
export const embedQuery = (text: string) => `task: question answering | query: ${text}`
export const embedDocument = (text: string, title?: string) =>
  `title: ${title ?? 'none'} | text: ${text}`
