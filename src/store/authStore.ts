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

let bootstrapPromise: Promise<void> | null = null
let authSubscriptionReady = false

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  settings: null,
  ready: false,

  /**
   * Idempotent even under React StrictMode. One auth listener is installed
   * for the whole application lifetime, so account switches can never race
   * two stale profile fetches into the same UI.
   */
  bootstrap: async () => {
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session ?? null
        set({ session, user: session?.user ?? null, profile: null, settings: null })
        if (session) await get().refreshProfile()

        if (!authSubscriptionReady) {
          authSubscriptionReady = true
          supabase.auth.onAuthStateChange((_event, next) => {
            const previousUserId = get().user?.id ?? null
            const nextUserId = next?.user.id ?? null
            const changedAccount = previousUserId !== nextUserId

            set({
              session: next,
              user: next?.user ?? null,
              ...(changedAccount ? { profile: null, settings: null } : {}),
              ready: true,
            })

            if (next) void get().refreshProfile()
            else set({ profile: null, settings: null })
          })
        }
      } finally {
        set({ ready: true })
      }
    })()

    return bootstrapPromise
  },

  refreshProfile: async () => {
    const uid = get().session?.user.id ?? (await supabase.auth.getUser()).data.user?.id
    if (!uid) return

    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('user_settings').select('*').eq('user_id', uid).single(),
    ])

    // The request may have started before the user switched accounts.
    if (get().user?.id !== uid) return
    set({
      profile: (profile as Profile) ?? null,
      settings: (settings as UserSettings) ?? null,
    })
  },

  patchSettings: async (patch) => {
    const uid = get().user?.id
    const current = get().settings
    if (!uid || !current) return
    set({ settings: { ...current, ...patch } })
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', uid)
    if (error && get().user?.id === uid) set({ settings: current })
  },

  patchProfile: async (patch) => {
    const uid = get().user?.id
    const current = get().profile
    if (!uid || !current) return
    set({ profile: { ...current, ...patch } })
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
    if (error && get().user?.id === uid) set({ profile: current })
  },

  clear: () => set({ session: null, user: null, profile: null, settings: null, ready: true }),
}))
