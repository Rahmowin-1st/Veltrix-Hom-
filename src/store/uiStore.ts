import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  drawerOpen: boolean
  searchOpen: boolean
  /** Hidden while a full-screen subpage or overlay owns the screen. */
  navHidden: boolean
  /** Source handed over from the library, consumed once by the chat. */
  pendingSourceId: string | null
  /** Project a newly created chat should belong to. Consumed once. */
  pendingProjectId: string | null
  /** Draft + attachment handed from General to a brand-new chat. */
  handoffText: string | null
  handoffAttachment: unknown | null

  toggleSidebar: () => void
  setDrawer: (open: boolean) => void
  setSearch: (open: boolean) => void
  setNavHidden: (hidden: boolean) => void
  setActiveSource: (id: string | null) => void
  consumeSource: () => string | null
  setPendingProject: (id: string | null) => void
  consumeProject: () => string | null
  setHandoffText: (t: string | null) => void
  setHandoffAttachment: (a: unknown | null) => void
  consumeHandoff: () => { text: string | null; attachment: unknown | null }
}

/**
 * Device-local UI state only — nothing here is account data,
 * so persisting to localStorage is honest and cheap.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      drawerOpen: false,
      searchOpen: false,
      navHidden: false,
      pendingSourceId: null,
      pendingProjectId: null,
      handoffText: null,
      handoffAttachment: null,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setDrawer: (drawerOpen) => set({ drawerOpen }),
      setSearch: (searchOpen) => set({ searchOpen }),
      setNavHidden: (navHidden) => set({ navHidden }),
      setActiveSource: (pendingSourceId) => set({ pendingSourceId }),

      consumeSource: () => {
        const id = get().pendingSourceId
        if (id) set({ pendingSourceId: null })
        return id
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
    }),
    {
      name: 'veltrix:ui',
      // Everything else is transient — never restore an overlay as open.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
