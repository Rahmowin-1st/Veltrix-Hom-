import { create } from 'zustand'
import { skillApi } from '@/lib/api'
import type { Skill } from '@/types'

interface SkillState {
  ownerId: string | null
  reset: () => void
  skills: Skill[]
  loading: boolean
  loaded: boolean
  activeId: string | null

  load: (force?: boolean, ownerId?: string | null) => Promise<void>
  create: (body: Partial<Skill> & { name: string }) => Promise<Skill>
  update: (id: string, body: Partial<Skill>) => Promise<Skill>
  duplicate: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  byId: (id: string | null) => Skill | undefined
}

export const useSkillStore = create<SkillState>((set, get) => ({
  ownerId: null,
  skills: [],
  loading: false,
  loaded: false,
  activeId: null,

  reset: () => set({ ownerId: null, skills: [], loading: false, loaded: false, activeId: null }),

  load: async (force = false, ownerId = null) => {
    const requestOwner = ownerId ?? get().ownerId
    if (ownerId && get().ownerId !== ownerId) set({ ownerId, skills: [], loaded: false, activeId: null })
    if (get().loaded && !force) return
    set({ loading: true })
    try {
      const { skills } = await skillApi.list()
      if (get().ownerId !== requestOwner) return
      set({ skills, loading: false, loaded: true })
    } catch {
      if (get().ownerId !== requestOwner) return
      set({ loading: false, loaded: true })
    }
  },

  create: async (body) => {
    const { skill } = await skillApi.create(body)
    set((s) => ({ skills: [skill, ...s.skills] }))
    return skill
  },

  update: async (id, body) => {
    const prev = get().skills
    set({ skills: prev.map((s) => (s.id === id ? { ...s, ...body } : s)) })
    try {
      const { skill } = await skillApi.update(id, body)
      set((state) => ({ skills: state.skills.map((item) => item.id === id ? skill : item) }))
      return skill
    } catch (error) {
      set({ skills: prev })
      throw error
    }
  },

  duplicate: async (id) => {
    const { skill } = await skillApi.duplicate(id)
    set((s) => ({ skills: [skill, ...s.skills] }))
  },

  remove: async (id) => {
    const prev = get().skills
    set((s) => ({
      skills: prev.filter((x) => x.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }))
    try { await skillApi.remove(id) } catch (error) { set({ skills: prev }); throw error }
  },

  setActive: (id) => set({ activeId: id }),
  byId: (id) => (id ? get().skills.find((s) => s.id === id) : undefined),
}))
