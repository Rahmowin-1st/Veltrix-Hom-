import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  drawerOpen: boolean
  /** 0..1 while a chat-edge gesture is interactively revealing the drawer. */
  drawerGestureProgress: number | null
  searchOpen: boolean
  /** Hidden while a full-screen subpage or overlay owns the screen. */
  navHidden: boolean
  /** Source handed over from the library, consumed once by the chat. */
  pendingSourceId: string | null
  pendingSourceIds: string[]
  /** Project a newly created chat should belong to. Consumed once. */
  pendingProjectId: string | null
  /** Draft + attachment handed from General to a brand-new chat. */
  handoffText: string | null
  handoffAttachment: unknown | null
  /** Stack of open dismissible overlays, so back closes the topmost first. */
  overlays: string[]
  /** True while the "press back again to exit" hint is showing. */
  exitHint: boolean

  toggleSidebar: () => void
  setDrawer: (open: boolean) => void
  setDrawerGestureProgress: (progress: number | null) => void
  setSearch: (open: boolean) => void
  setNavHidden: (hidden: boolean) => void
  setActiveSource: (id: string | null) => void
  consumeSource: () => string | null
  setActiveSources: (ids: string[]) => void
  consumeSources: () => string[]
  setPendingProject: (id: string | null) => void
  consumeProject: () => string | null
  setHandoffText: (t: string | null) => void
  setHandoffAttachment: (a: unknown | null) => void
  consumeHandoff: () => { text: string | null; attachment: unknown | null }
  registerOverlayCloser: (id: string, close: () => void) => void
  pushOverlay: (id: string) => void
  popOverlay: (id: string) => void
  hasOpenOverlay: () => boolean
  closeTopOverlay: () => void
  /** Force the overlay stack to match a browser history entry. */
  syncOverlays: (ids: string[]) => void
  setExitHint: (on: boolean) => void
  resetTransient: () => void
}

/**
 * Device-local UI state only — nothing here is account data,
 * so persisting to localStorage is honest and cheap.
 */
/** Dismiss callbacks for sheets/pickers, keyed by overlay id. Kept outside
 *  store state on purpose: functions must not be persisted or diffed. */
const overlayClosers = new Map<string, () => void>()

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      drawerOpen: false,
      drawerGestureProgress: null,
      searchOpen: false,
      navHidden: false,
      pendingSourceId: null,
      pendingSourceIds: [],
      pendingProjectId: null,
      handoffText: null,
      handoffAttachment: null,
      overlays: [],
      exitHint: false,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setDrawer: (drawerOpen) => set((s) => ({
        drawerOpen,
        drawerGestureProgress: null,
        overlays: drawerOpen
          ? [...s.overlays.filter((o) => o !== 'drawer'), 'drawer']
          : s.overlays.filter((o) => o !== 'drawer'),
      })),
      setDrawerGestureProgress: (drawerGestureProgress) => set({
        drawerGestureProgress: drawerGestureProgress === null
          ? null
          : Math.max(0, Math.min(1, drawerGestureProgress)),
      }),
      setSearch: (searchOpen) => set((s) => ({
        searchOpen,
        overlays: searchOpen
          ? [...s.overlays.filter((o) => o !== 'search'), 'search']
          : s.overlays.filter((o) => o !== 'search'),
      })),
      setNavHidden: (navHidden) => set({ navHidden }),
      setActiveSource: (pendingSourceId) => set({ pendingSourceId, pendingSourceIds: pendingSourceId ? [pendingSourceId] : [] }),
      setActiveSources: (pendingSourceIds) => set({ pendingSourceIds, pendingSourceId: pendingSourceIds[0] ?? null }),

      consumeSource: () => {
        const id = get().pendingSourceId ?? get().pendingSourceIds[0] ?? null
        if (id) set({ pendingSourceId: null, pendingSourceIds: [] })
        return id
      },

      consumeSources: () => {
        const ids = get().pendingSourceIds.length ? get().pendingSourceIds : (get().pendingSourceId ? [get().pendingSourceId!] : [])
        if (ids.length) set({ pendingSourceId: null, pendingSourceIds: [] })
        return ids
      },

      setPendingProject: (pendingProjectId) => set({ pendingProjectId }),

      consumeProject: () => {
        const id = get().pendingProjectId
        if (id) set({ pendingProjectId: null })
        return id
      },

      setHandoffText: (handoffText) => set({ handoffText }),
      setHandoffAttachment: (handoffAttachment) => set({ handoffAttachment }),

      consumeHandoff: () => {
        const { handoffText, handoffAttachment } = get()
        if (handoffText || handoffAttachment) {
          set({ handoffText: null, handoffAttachment: null })
        }
        return { text: handoffText, attachment: handoffAttachment }
      },

      registerOverlayCloser: (id, close) => { overlayClosers.set(id, close) },

      pushOverlay: (id) => set((s) =>
        s.overlays.includes(id) ? s : { overlays: [...s.overlays, id] }),

      popOverlay: (id) => { overlayClosers.delete(id); set((s) => ({ overlays: s.overlays.filter((o) => o !== id) })) },

      hasOpenOverlay: () => get().overlays.length > 0,

      // Closing the top overlay routes through the same setters that own each
      // one, so their own state (drawerOpen/searchOpen) stays consistent.
      closeTopOverlay: () => {
        const top = get().overlays[get().overlays.length - 1]
        if (!top) return
        if (top === 'drawer') { get().setDrawer(false); return }
        if (top === 'search') { get().setSearch(false); return }
        // Sheets and pickers register their own closer so their local state
        // (and any exit animation) stays in charge of the actual dismissal.
        const close = overlayClosers.get(top)
        if (close) { close(); return }
        set((s) => ({ overlays: s.overlays.filter((o) => o !== top) }))
      },

      /**
       * Reconciles the overlay stack with the history entry the browser landed
       * on after Back/Forward. Overlays that are no longer in the entry are
       * dismissed through their own closers, so each one still runs its exit
       * animation and resets its local state — we only decide *that* it closes,
       * never how.
       */
      syncOverlays: (ids) => {
        const current = get().overlays
        const target = new Set(ids)
        // Close from the top down so nested sheets unwind in the right order.
        for (const id of [...current].reverse()) {
          if (target.has(id)) continue
          if (id === 'drawer') { get().setDrawer(false); continue }
          if (id === 'search') { get().setSearch(false); continue }
          const close = overlayClosers.get(id)
          if (close) close()
        }
        // Forward restored an overlay we no longer track: adopt the entry so
        // the stack stays authoritative even if the closer already ran.
        set({ overlays: ids.filter((id) => id === 'drawer' || id === 'search' || overlayClosers.has(id)) })
      },

      setExitHint: (exitHint) => set({ exitHint }),

      resetTransient: () => { overlayClosers.clear(); return set({
        overlays: [], exitHint: false,
        drawerOpen: false, drawerGestureProgress: null, searchOpen: false, navHidden: false,
        pendingSourceId: null, pendingSourceIds: [], pendingProjectId: null,
        handoffText: null, handoffAttachment: null,
      }) },
    }),
    {
      name: 'veltrix:ui',
      version: 2,
      // Old builds persisted drafts/source IDs in this store. Discard them on
      // hydration so another account on the same device can never inherit them.
      migrate: (persisted) => ({ sidebarCollapsed: Boolean((persisted as { sidebarCollapsed?: boolean } | null)?.sidebarCollapsed) }),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
