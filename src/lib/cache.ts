/**
 * IndexedDB cache for chat history.
 *
 * Purpose: reopening a chat shows its messages instantly instead of a
 * skeleton while the network round-trips. The server remains the source
 * of truth — cached turns are replaced the moment fresh data lands, and
 * a failed read simply falls through to the network.
 */

const DB_NAME = 'veltrix'
const DB_VERSION = 1
const STORE = 'chatHistory'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface CachedChat<T> {
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'chatId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    // Private browsing and storage-pressure both surface here; degrade quietly.
    req.onerror = () => resolve(null)
  })

  return dbPromise
}

export async function readChat<T>(chatId: string): Promise<T[] | null> {
  const db = await openDb()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(chatId)
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

export async function writeChat<T>(chatId: string, turns: T[]): Promise<void> {
  const db = await openDb()
  if (!db) return

  try {
    const tx = db.transaction(STORE, 'readwrite')
    // Only the tail is worth caching; old messages load from the server.
    tx.objectStore(STORE).put({ chatId, turns: turns.slice(-60), savedAt: Date.now() })
  } catch { /* quota exceeded — the network path still works */ }
}

export async function dropChat(chatId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(chatId)
  } catch { /* nothing to clean */ }
}

export async function clearCache(): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear()
  } catch { /* nothing to clean */ }
}
