import * as tus from 'tus-js-client'
import { supabase } from './supabase'

/**
 * Resumable source upload (spec §7).
 *
 * The bytes go from the device straight to Supabase Storage over the TUS
 * protocol. The API server never holds the PDF, which is the whole point: a
 * 20 MB book buffered in a free-tier Render process is how the service ran out
 * of memory. TUS additionally survives a dropped connection — the upload
 * resumes from the last acknowledged chunk instead of starting over, which
 * matters a great deal on mobile data.
 *
 * Fingerprints are account-scoped so a resumed upload can never be adopted by
 * a different signed-in user on the same device.
 */

/** Supabase's resumable endpoint requires exactly this chunk size. */
const CHUNK_SIZE = 6 * 1024 * 1024
const BUCKET = 'sources'

export interface TusUploadOptions {
  file: File
  /** Object path inside the bucket, e.g. `sources/{userId}/{sourceId}/original.pdf`. */
  storagePath: string
  userId: string
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export class UploadAbortedError extends Error {
  constructor() { super('Yuklash bekor qilindi.') }
}

function storageEndpoint(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) throw new Error('VITE_SUPABASE_URL sozlanmagan.')
  return `${base.replace(/\/$/, '')}/storage/v1/upload/resumable`
}

/**
 * Uploads a file with resume support. Resolves when Storage has the complete
 * object; the caller then asks the server to finalize and validate it.
 */
export async function tusUpload(opts: TusUploadOptions): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessiya topilmadi. Qaytadan kiring.')

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: storageEndpoint(),
      retryDelays: [0, 1000, 3000, 6000, 12000],
      // The user's own JWT: Storage RLS decides whether this path is theirs,
      // so a forged path cannot write into another account's folder.
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'false', // never silently overwrite an existing object
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: opts.storagePath,
        contentType: opts.file.type || 'application/pdf',
        cacheControl: '3600',
      },
      chunkSize: CHUNK_SIZE,
      // Account-scoped: a resumable session belongs to one user on this device.
      fingerprint: async (file) =>
        `veltrix:${opts.userId}:upload:${opts.storagePath}:${file.size}:${file.lastModified}`,
      onError: (error) => reject(error),
      onProgress: (sent, total) => {
        if (total > 0) opts.onProgress?.(Math.round((sent / total) * 100))
      },
      onSuccess: () => resolve(),
    })

    // Logging out or navigating away must stop the transfer immediately.
    const abort = () => {
      void upload.abort()
      reject(new UploadAbortedError())
    }
    if (opts.signal?.aborted) { abort(); return }
    opts.signal?.addEventListener('abort', abort, { once: true })

    // Resume a previous session for this exact file if one is still valid.
    void upload.findPreviousUploads().then((previous) => {
      const resumable = previous[0]
      if (resumable) upload.resumeFromPreviousUpload(resumable)
      upload.start()
    })
  })
}

/**
 * Clears any stored resumable sessions for an account. Called on logout so a
 * later user of the same device never inherits them.
 */
export function clearUploadFingerprints(userId: string): void {
  const prefix = `tus::veltrix:${userId}:upload:`
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tus::') && key.includes(`veltrix:${userId}:upload:`)) localStorage.removeItem(key)
      else if (key.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // Private-mode storage restrictions are not worth failing a logout over.
  }
}
