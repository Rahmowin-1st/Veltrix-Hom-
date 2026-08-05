/**
 * IndexedDB cache for chat history.
 *
 * Purpose: reopening a chat shows its messages instantly instead of a
 * skeleton while the network round-trips. The server remains the source
 * of truth — cached turns are replaced the moment fresh data lands, and
 * a failed read simply falls through to the network.
 */

const DB_NAME = 'veltrix'
const DB_VERSION = 2
const STORE = 'chatHistory'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface CachedChat<T> {
  cacheKey: string
  userId: string
  chatId: string
  turns: T[]
  savedAt: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }

    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // v1 used chatId as the key and could leak cached messages between
      // accounts on a shared device. Cache is disposable, so recreate it.
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE)
      db.createObjectStore(STORE, { keyPath: 'cacheKey' })
    }
    req.onsuccess = () => resolve(req.result)
    // Private browsing and storage-pressure both surface here; degrade quietly.
    req.onerror = () => resolve(null)
  })

  return dbPromise
}

export async function readChat<T>(userId: string, chatId: string): Promise<T[] | null> {
  const db = await openDb()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(`${userId}:${chatId}`)
      req.onsuccess = () => {
        const row = req.result as CachedChat<T> | undefined
        if (!row) { resolve(null); return }
        if (Date.now() - row.savedAt > MAX_AGE_MS) { resolve(null); return }
        resolve(row.turns)
      }
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

export async function writeChat<T>(userId: string, chatId: string, turns: T[]): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    const tx = db.transaction(STORE, 'readwrite')
    // Only the tail is worth caching; old messages load from the server.
    tx.objectStore(STORE).put({ cacheKey: `${userId}:${chatId}`, userId, chatId, turns: turns.slice(-60), savedAt: Date.now() })
  } catch { /* quota exceeded — the network path still works */ }
}

export async function dropChat(userId: string, chatId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(`${userId}:${chatId}`)
  } catch { /* nothing to clean */ }
}

export async function clearCache(): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear()
  } catch { /* nothing to clean */ }
}

/**
 * Wipes every trace of one account from this device: cached chat history,
 * namespaced localStorage entries, and drafts.
 *
 * Called on sign-out. Cloud data is untouched — this only removes the local
 * copy so the next person to sign in on this device can never see it, not
 * even for the instant before fresh data arrives.
 */
export async function purgeAccount(userId: string): Promise<void> {
  // Resumable upload sessions are account-scoped; a later user of this device
  // must never inherit or resume them.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tus::') && key.includes(`veltrix:${userId}:upload:`)) localStorage.removeItem(key)
    }
  } catch { /* private-mode storage limits must not fail a logout */ }

  const db = await openDb()
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const cursorRequest = store.openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return
          const row = cursor.value as CachedChat<unknown>
          if (row.userId === userId) cursor.delete()
          cursor.continue()
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      } catch { resolve() }
    })
  }

  // Drafts and any other per-account localStorage entries follow the
  // `veltrix:<name>:<userId>` convention, so one pass removes them all.
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('veltrix:') && key.endsWith(`:${userId}`)) doomed.push(key)
    }
    doomed.forEach((key) => localStorage.removeItem(key))
  } catch { /* storage may be unavailable in private mode */ }
}
