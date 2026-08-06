import { useCallback, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useSkillStore } from '@/store/skillStore'
import { useAuthStore } from '@/store/authStore'
import { tap } from '@/lib/native'
import { supabase } from '@/lib/supabase'

interface Props {
  title: string
  onMenu: () => void
}

/**
 * The app header.
 *
 * Three deliberate choices:
 *
 * 1. **Grid, not flexbox.** Equal fixed side columns with a flexible centre
 *    keeps the title mathematically centred on the screen. With flexbox the
 *    title drifts whenever the two sides differ in width — which they do the
 *    moment one button shows a spinner.
 * 2. **No panel.** The header shares the page background with no border, card
 *    or heavy shadow, so it reads as part of the page rather than a bar
 *    bolted on top.
 * 3. **Two controls only.** Search and new-chat moved into the drawer, where
 *    they sit beside the content they act on.
 */
export function AppHeader({ title, onMenu }: Props) {
  const refresh = useRefreshAll()

  return (
    <header
      style={{
        paddingTop: 'var(--safe-top)',
        flexShrink: 0,
        zIndex: 50,
        background: 'transparent',
      }}
    >
      <div
        style={{
          display: 'grid',
          // Equal side columns → the centre column is always screen-centred.
          gridTemplateColumns: '48px 1fr 48px',
          alignItems: 'center',
          minHeight: 'var(--header-h)',
          paddingInline: 8,
        }}
      >
        <button
          type="button"
          className="v12-header-btn"
          onClick={() => { void tap(); onMenu() }}
          aria-label="Menyu"
        >
          <Menu size={22} strokeWidth={2.1} />
        </button>

        <div
          style={{
            textAlign: 'center',
            fontSize: 'var(--fs-lead)',
            fontWeight: 660,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>

        <button
          type="button"
          className="v12-header-btn v12-header-logo"
          onClick={refresh.run}
          disabled={refresh.busy}
          aria-label={refresh.busy ? 'Yangilanmoqda' : "Ma'lumotlarni yangilash"}
          aria-busy={refresh.busy}
          data-busy={refresh.busy ? '' : undefined}
        >
          <VeltrixMark size={24} />
        </button>
      </div>
    </header>
  )
}

/**
 * "Refresh all data" behind the logo.
 *
 * This is a *data* refresh, not a page reload. Reloading the document would
 * throw away an unsent draft, the selected sources and the scroll position —
 * the exact state the rest of V12 works to preserve. So instead we refresh the
 * session if it is close to expiry, invalidate the server caches, and re-pull
 * the account stores, leaving all local UI state untouched.
 */
function useRefreshAll() {
  const queryClient = useQueryClient()
  const loadChats = useChatStore((s) => s.load)
  const loadProjects = useProjectStore((s) => s.load)
  const loadTalents = useSkillStore((s) => s.load)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)

  const [busy, setBusy] = useState(false)
  // A ref, not just state: two taps in the same tick must not both start.
  const inFlight = useRef(false)

  const run = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    void tap()
    try {
      const session = await supabase.auth.getSession()
      const expiresSoon = ((session.data.session?.expires_at ?? 0) * 1000 - Date.now()) < 120_000
      if (session.data.session && expiresSoon) await supabase.auth.refreshSession()

      await Promise.allSettled([
        queryClient.invalidateQueries(),
        loadChats(),
        // `force` bypasses the "already loaded" short-circuit — an explicit
        // refresh must actually re-hit the server.
        loadProjects(true),
        loadTalents(true),
        refreshProfile(),
      ])
      window.dispatchEvent(new Event('veltrix:refresh-data'))
      void tap('medium')
    } finally {
      // A minimum visible duration, otherwise a fast refresh looks like the
      // tap did nothing at all.
      window.setTimeout(() => {
        inFlight.current = false
        setBusy(false)
      }, 320)
    }
  }, [queryClient, loadChats, loadProjects, loadTalents, refreshProfile])

  return { busy, run }
}
