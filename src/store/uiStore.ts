import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  drawerOpen: boolean
  searchOpen: boolean
  toggleSidebar: () => void
  setDrawer: (open: boolean) => void
  setSearch: (open: boolean) => void
}

/**
 * Device-local UI state only — nothing here is account data,
 * so persisting to localStorage is honest and cheap.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      drawerOpen: false,
      searchOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setDrawer: (drawerOpen) => set({ drawerOpen }),
      setSearch: (searchOpen) => set({ searchOpen }),
    }),
    {
      name: 'veltrix:ui',
      // Drawer/search are transient — never restore them open on load.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
