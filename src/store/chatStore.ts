import { create } from 'zustand'
import { api } from '@/lib/api'
import { dropChat } from '@/lib/cache'
import type { ChatSummary } from '@/types'

/**
 * One source of truth for chat history.
 *
 * Everything here is ACCOUNT-SYNCED: pins, archive, drafts and project
 * links all live in Postgres, so signing in on another device restores
 * the same workspace. Nothing is kept in localStorage any more.
 *
 * Drafts are written back with a debounce so typing never fires a request
 * per keystroke.
 */

interface ChatState {
  ownerId: string | null
  chats: ChatSummary[]
  loading: boolean
  error: string | null
  drafts: Record<string, string>

  /** Epoch ms of the last successful load; 0 when never loaded. */
  loadedAt: number
  load: (ownerId?: string | null) => Promise<void>
  /** Loads only when the cache is missing or older than maxAgeMs. */
  loadIfStale: (maxAgeMs?: number) => Promise<void>
  reset: () => void
  upsertLocal: (chat: Partial<ChatSummary> & { id: string }) => void
  rename: (id: string, title: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  archive: (id: string) => Promise<void>
  moveToProject: (id: string, projectId: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
  setDraft: (chatId: string, text: string) => void
  getDraft: (chatId: string | null) => string
}

const draftTimers = new Map<string, number>()

export const useChatStore = create<ChatState>((set, get) => ({
  ownerId: null,
  chats: [],
  loading: false,
  error: null,
  drafts: {},
  loadedAt: 0,

  load: async (ownerId = null) => {
    const requestOwner = ownerId ?? get().ownerId
    if (ownerId && get().ownerId !== ownerId) set({ chats: [], drafts: {}, ownerId, loadedAt: 0 })
    set({ loading: true, error: null })
    try {
      const { chats } = await api.chats()
      // A request started by the previous account may finish after sign-out.
      if (get().ownerId !== requestOwner) return
      const drafts: Record<string, string> = {}
      for (const c of chats) if (c.draft) drafts[c.id] = c.draft
      set({ chats, drafts, loading: false, loadedAt: Date.now() })
    } catch (e) {
      if (get().ownerId !== requestOwner) return
      set({ loading: false, error: e instanceof Error ? e.message : "Chatlarni yuklab bo'lmadi." })
    }
  },

  /**
   * Cache-first read used by surfaces that open often — the drawer especially.
   * Re-fetching a chat list every time a drawer opens costs a round-trip the
   * user waits on for data that almost never changed in the interim.
   */
  loadIfStale: async (maxAgeMs = 60_000) => {
    const { loadedAt, loading } = get()
    if (loading) return
    if (loadedAt && Date.now() - loadedAt < maxAgeMs) return
    await get().load()
  },

  reset: () => {
    for (const timer of draftTimers.values()) window.clearTimeout(timer)
    draftTimers.clear()
    set({ ownerId: null, chats: [], drafts: {}, loading: false, error: null, loadedAt: 0 })
  },

  upsertLocal: (chat) =>
    set((s) => {
      const i = s.chats.findIndex((c) => c.id === chat.id)
      if (i === -1) {
        return {
          chats: [
            {
              pinned: false, project_id: null, title: null,
              updated_at: new Date().toISOString(), ...chat,
            } as ChatSummary,
            ...s.chats,
          ],
        }
      }
      const next = [...s.chats]
      next[i] = { ...next[i]!, ...chat }
      return { chats: next }
    }),

  rename: async (id, title) => {
    const prev = get().chats
    set({ chats: prev.map((c) => (c.id === id ? { ...c, title } : c)) })
    try { await api.patchChat(id, { title }) } catch { set({ chats: prev }) }
  },

  togglePin: async (id) => {
    const prev = get().chats
    const current = prev.find((c) => c.id === id)
    if (!current) return
    const pinned = !current.pinned
    set({ chats: sortChats(prev.map((c) => (c.id === id ? { ...c, pinned } : c))) })
    try { await api.patchChat(id, { pinned }) } catch { set({ chats: prev }) }
  },

  archive: async (id) => {
    const prev = get().chats
    set({ chats: prev.filter((c) => c.id !== id) })
    try { await api.patchChat(id, { archived: true }) } catch { set({ chats: prev }) }
  },

  moveToProject: async (id, projectId) => {
    const prev = get().chats
    set({ chats: prev.map((c) => (c.id === id ? { ...c, project_id: projectId } : c)) })
    try { await api.patchChat(id, { project_id: projectId }) } catch { set({ chats: prev }) }
  },

  remove: async (id) => {
    const prev = get().chats
    set({ chats: prev.filter((c) => c.id !== id) })
    try {
      await api.deleteChat(id)
      const drafts = { ...get().drafts }
      delete drafts[id]
      set({ drafts })
      const ownerId = get().ownerId
      if (ownerId) void dropChat(ownerId, id)
    } catch { set({ chats: prev }) }
  },

  /** Optimistic locally, debounced to the server (700ms). */
  setDraft: (chatId, text) => {
    set((s) => ({ drafts: { ...s.drafts, [chatId]: text } }))
    if (chatId === 'new') return // no row exists yet — nothing to sync

    const existing = draftTimers.get(chatId)
    if (existing) window.clearTimeout(existing)
    draftTimers.set(
      chatId,
      window.setTimeout(() => {
        void api.patchChat(chatId, { draft: text.trim() || null }).catch(() => {})
        draftTimers.delete(chatId)
      }, 700)
    )
  },

  getDraft: (chatId) => get().drafts[chatId ?? 'new'] ?? '',
}))

/** Pinned first, then most recently touched. Matches the server ordering. */
function sortChats(list: ChatSummary[]): ChatSummary[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

/** Deterministic title from the first message — costs zero API calls. */
export function localTitle(text: string): string {
  const clean = text.replace(/\/\w+(\s+\S+)?/g, '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Yangi chat'
  return clean.length <= 42 ? clean : `${clean.slice(0, 42).trimEnd()}…`
}
