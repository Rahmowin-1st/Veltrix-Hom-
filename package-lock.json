import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, UserSettings } from '@/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  settings: UserSettings | null
  /** false until the first auth check + profile fetch has resolved */
  ready: boolean
  bootstrap: () => Promise<void>
  refreshProfile: () => Promise<void>
  patchSettings: (patch: Partial<UserSettings>) => Promise<void>
  patchProfile: (patch: Partial<Profile>) => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  settings: null,
  ready: false,

  /**
   * Runs in parallel with the Ignition animation so that by the time the
   * logo lands in the header, there is nothing left to load.
   */
  bootstrap: async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session ?? null
    set({ session, user: session?.user ?? null })

    if (session) await get().refreshProfile()
    set({ ready: true })

    supabase.auth.onAuthStateChange((_event, next) => {
      set({ session: next, user: next?.user ?? null })
      if (next) void get().refreshProfile()
      else set({ profile: null, settings: null })
    })
  },

  refreshProfile: async () => {
    const uid = get().session?.user.id ?? (await supabase.auth.getUser()).data.user?.id
    if (!uid) return

    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('user_settings').select('*').eq('user_id', uid).single(),
    ])

    set({
      profile: (profile as Profile) ?? null,
      settings: (settings as UserSettings) ?? null,
    })
  },

  patchSettings: async (patch) => {
    const uid = get().user?.id
    const current = get().settings
    if (!uid || !current) return
    set({ settings: { ...current, ...patch } }) // optimistic
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', uid)
    if (error) set({ settings: current }) // roll back on failure
  },

  patchProfile: async (patch) => {
    const uid = get().user?.id
    const current = get().profile
    if (!uid || !current) return
    set({ profile: { ...current, ...patch } })
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
    if (error) set({ profile: current })
  },

  clear: () => set({ session: null, user: null, profile: null, settings: null }),
}))
