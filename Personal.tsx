import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/** Applies theme, density, motion and font scale to <html>. */
export function useTheme() {
  const s = useAuthStore((st) => st.settings)
  const theme = s?.theme ?? 'system'
  const compact = s?.compact_mode ?? false
  const reduced = s?.reduced_motion ?? false

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
          : theme
      root.dataset.theme = resolved
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'light' ? '#F7F9FC' : '#070B14')
    }
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.density = compact ? 'compact' : 'comfortable'
  }, [compact])

  useEffect(() => {
    if (reduced) document.documentElement.dataset.motion = 'reduced'
    else delete document.documentElement.dataset.motion
  }, [reduced])
}
