import { create } from 'zustand'
import { projectApi } from '@/lib/api'
import type { Project } from '@/types'

interface ProjectState {
  projects: Project[]
  loading: boolean
  loaded: boolean
  load: (force?: boolean) => Promise<void>
  create: (body: { name: string } & Partial<Project>) => Promise<Project | null>
  update: (id: string, body: Partial<Project>) => Promise<void>
  remove: (id: string) => Promise<void>
  byId: (id: string | null) => Project | undefined
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  loaded: false,

  // Lazy: projects are only fetched when the sidebar or a project view needs them.
  load: async (force = false) => {
    if (get().loaded && !force) return
    set({ loading: true })
    try {
      const { projects } = await projectApi.list()
      set({ projects, loading: false, loaded: true })
    } catch {
      set({ loading: false, loaded: true })
    }
  },

  create: async (body) => {
    try {
      const { project } = await projectApi.create(body)
      set((s) => ({ projects: [project, ...s.projects] }))
      return project
    } catch {
      return null
    }
  },

  update: async (id, body) => {
    const prev = get().projects
    set({ projects: prev.map((p) => (p.id === id ? { ...p, ...body } : p)) })
    try { await projectApi.update(id, body) } catch { set({ projects: prev }) }
  },

  remove: async (id) => {
    const prev = get().projects
    set({ projects: prev.filter((p) => p.id !== id) })
    try { await projectApi.remove(id) } catch { set({ projects: prev }) }
  },

  byId: (id) => (id ? get().projects.find((p) => p.id === id) : undefined),
}))
