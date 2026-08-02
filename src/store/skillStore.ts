import { create } from 'zustand'
import { skillApi } from '@/lib/api'
import type { Skill } from '@/types'

interface SkillState {
  skills: Skill[]
  loading: boolean
  loaded: boolean
  activeId: string | null

  load: (force?: boolean) => Promise<void>
  create: (body: Partial<Skill> & { name: string }) => Promise<Skill | null>
  update: (id: string, body: Partial<Skill>) => Promise<void>
  duplicate: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  byId: (id: string | null) => Skill | undefined
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  loaded: false,
  activeId: null,

  load: async (force = false) => {
    if (get().loaded && !force) return
    set({ loading: true })
    try {
      const { skills } = await skillApi.list()
      set({ skills, loading: false, loaded: true })
    } catch {
      set({ loading: false, loaded: true })
    }
  },

  create: async (body) => {
    try {
      const { skill } = await skillApi.create(body)
      set((s) => ({ skills: [skill, ...s.skills] }))
      return skill
    } catch { return null }
  },

  update: async (id, body) => {
    const prev = get().skills
    set({ skills: prev.map((s) => (s.id === id ? { ...s, ...body } : s)) })
    try { await skillApi.update(id, body) } catch { set({ skills: prev }) }
  },

  duplicate: async (id) => {
    try {
      const { skill } = await skillApi.duplicate(id)
      set((s) => ({ skills: [skill, ...s.skills] }))
    } catch { /* nothing was created */ }
  },

  remove: async (id) => {
    const prev = get().skills
    set((s) => ({
      skills: prev.filter((x) => x.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }))
    try { await skillApi.remove(id) } catch { set({ skills: prev }) }
  },

  setActive: (id) => set({ activeId: id }),
  byId: (id) => (id ? get().skills.find((s) => s.id === id) : undefined),
}))
