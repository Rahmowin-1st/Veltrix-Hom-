import 'dotenv/config'
import { createHash } from 'node:crypto'
import { z } from 'zod'

/**
 * Render/Vercel values are sometimes pasted with spaces or wrapping quotes.
 * Normalize them once so every downstream client receives the exact value.
 */
function cleanEnvValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  let result = value.trim()
  if (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1).trim()
  }
  return result
}

const requiredString = (message: string) =>
  z.preprocess(cleanEnvValue, z.string().min(1, message))
const optionalString = z.preprocess(
  cleanEnvValue,
  z.string().min(1).optional()
)

const EnvSchema = z.object({
  PORT: z.preprocess(cleanEnvValue, z.coerce.number().default(8787)),
  CLIENT_ORIGIN: z.preprocess(
    cleanEnvValue,
    z.string().default('http://localhost:5173')
  ),
  GEMINI_API_KEY: requiredString("GEMINI_API_KEY yo'q"),
  SUPABASE_URL: z.preprocess(cleanEnvValue, z.string().url()),

  // New Supabase projects should use SUPABASE_SECRET_KEY (sb_secret_*).
  // Legacy projects may keep SUPABASE_SERVICE_ROLE_KEY (JWT) during migration.
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  // Kept optional for backwards-compatible Render environments; the backend
  // does not need it because user JWTs are verified through the admin client.
  SUPABASE_ANON_KEY: optionalString,

  GEMINI_ANSWER_MODEL: z.preprocess(
    cleanEnvValue,
    z.string().default('gemini-3.6-flash')
  ),
  GEMINI_OCR_MODEL: z.preprocess(
    cleanEnvValue,
    z.string().default('gemini-3.6-flash')
  ),
  GEMINI_ROUTER_MODEL: z.preprocess(
    cleanEnvValue,
    z.string().default('gemini-3.5-flash-lite')
  ),
  GEMINI_EMBEDDING_MODEL: z.preprocess(
    cleanEnvValue,
    z.string().default('gemini-embedding-2')
  ),
  GEMINI_FALLBACK_MODEL: z.preprocess(
    cleanEnvValue,
    z.string().default('gemini-3.5-flash-lite')
  ),

  LIMIT_OCR_PAGES_PER_HOUR: z.preprocess(
    cleanEnvValue,
    z.coerce.number().default(300)
  ),
  LIMIT_CHAT_REQUESTS_PER_HOUR: z.preprocess(
    cleanEnvValue,
    z.coerce.number().default(200)
  ),
  LIMIT_UPLOADS_PER_HOUR: z.preprocess(
    cleanEnvValue,
    z.coerce.number().default(20)
  ),
}).superRefine((value, ctx) => {
  if (!value.SUPABASE_SECRET_KEY && !value.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_SECRET_KEY'],
      message:
        'SUPABASE_SECRET_KEY yoki SUPABASE_SERVICE_ROLE_KEY dan bittasi kerak',
    })
  }
})

export const env = EnvSchema.parse(process.env)

export const SUPABASE_ADMIN_KEY =
  env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY!

interface LegacyJwtPayload {
  role?: string
  ref?: string
}

function decodeLegacyJwtPayload(key: string): LegacyJwtPayload | null {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as LegacyJwtPayload
  } catch {
    return null
  }
}

const url = new URL(env.SUPABASE_URL)
export const SUPABASE_PROJECT_REF = url.hostname.split('.')[0] ?? 'unknown'
const legacyPayload = decodeLegacyJwtPayload(SUPABASE_ADMIN_KEY)

if (SUPABASE_ADMIN_KEY.startsWith('sb_publishable_')) {
  throw new Error(
    'SUPABASE admin kalitiga publishable key qo‘yilgan. Backend uchun sb_secret_* yoki legacy service_role kerak.'
  )
}
if (legacyPayload?.role && legacyPayload.role !== 'service_role') {
  throw new Error(
    `SUPABASE admin JWT role noto‘g‘ri: ${legacyPayload.role}. service_role kalitini ishlating.`
  )
}
if (
  legacyPayload?.ref &&
  SUPABASE_PROJECT_REF !== 'unknown' &&
  legacyPayload.ref !== SUPABASE_PROJECT_REF
) {
  throw new Error(
    `SUPABASE_URL (${SUPABASE_PROJECT_REF}) va service_role key (${legacyPayload.ref}) boshqa projectlardan.`
  )
}

export const SUPABASE_ADMIN_KEY_KIND = SUPABASE_ADMIN_KEY.startsWith('sb_secret_')
  ? 'secret'
  : legacyPayload?.role === 'service_role'
    ? 'legacy_service_role'
    : 'unknown'

// Safe for diagnostics: irreversible hash prefix, never any raw key characters.
export const SUPABASE_ADMIN_KEY_FINGERPRINT = createHash('sha256')
  .update(SUPABASE_ADMIN_KEY)
  .digest('hex')
  .slice(0, 10)

export const MODELS = {
  router: env.GEMINI_ROUTER_MODEL,
  answer: env.GEMINI_ANSWER_MODEL,
  ocr: env.GEMINI_OCR_MODEL,
  fallback: env.GEMINI_FALLBACK_MODEL,
  embedding: env.GEMINI_EMBEDDING_MODEL,
} as const

export const OCR_SCHEMA_VERSION = 'v10-ocr-1'
export const MAX_PDF_PAGES_PER_REQUEST = 30
export const EMBEDDING_DIM = 768
export const CACHE_THRESHOLD = 0.94
export const CHUNK_SIZE = 900
export const CHUNK_OVERLAP = 150
export const QUEUE_CONCURRENCY = 2
export const BACKOFF_MS = [1000, 2000, 4000, 8000] as const
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const embedQuery = (text: string) =>
  `task: question answering | query: ${text}`
export const embedDocument = (text: string, title?: string) =>
  `title: ${title ?? 'none'} | text: ${text}`
