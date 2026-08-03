import { create } from 'zustand'
import { projectApi } from '@/lib/api'
import type { Project } from '@/types'

interface ProjectState {
  ownerId: string | null
  reset: () => void
  projects: Project[]
  loading: boolean
  loaded: boolean
  load: (force?: boolean, ownerId?: string | null) => Promise<void>
  create: (body: { name: string } & Partial<Project>) => Promise<Project>
  update: (id: string, body: Partial<Project>) => Promise<Project>
  remove: (id: string) => Promise<void>
  byId: (id: string | null) => Project | undefined
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  ownerId: null,
  projects: [],
  loading: false,
  loaded: false,

  reset: () => set({ ownerId: null, projects: [], loading: false, loaded: false }),

  // Lazy: projects are only fetched when the sidebar or a project view needs them.
  load: async (force = false, ownerId = null) => {
    const requestOwner = ownerId ?? get().ownerId
    if (ownerId && get().ownerId !== ownerId) set({ ownerId, projects: [], loaded: false })
    if (get().loaded && !force) return
    set({ loading: true })
    try {
      const { projects } = await projectApi.list()
      if (get().ownerId !== requestOwner) return
      set({ projects, loading: false, loaded: true })
    } catch {
      if (get().ownerId !== requestOwner) return
      set({ loading: false, loaded: true })
    }
  },

  create: async (body) => {
    const { project } = await projectApi.create(body)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project
  },

  update: async (id, body) => {
    const prev = get().projects
    set({ projects: prev.map((p) => (p.id === id ? { ...p, ...body } : p)) })
    try {
      const { project } = await projectApi.update(id, body)
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? project : p)) }))
      return project
    } catch (error) {
      set({ projects: prev })
      throw error
    }
  },

  remove: async (id) => {
    const prev = get().projects
    set({ projects: prev.filter((p) => p.id !== id) })
    try {
      await projectApi.remove(id)
    } catch (error) {
      set({ projects: prev })
      throw error
    }
  },

  byId: (id) => (id ? get().projects.find((p) => p.id === id) : undefined),
}))
