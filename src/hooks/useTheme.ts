import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Applies every visual preference to the document root.
 *
 * The initial theme is already set by the boot script in index.html, so
 * this hook only reacts to later changes — there is never a white flash
 * and never a moment where the saved theme is not honoured.
 */
export function useTheme() {
  const settings = useAuthStore((s) => s.settings)

  const theme = settings?.theme ?? 'system'
  const fontScale = settings?.font_scale ?? 1
  const compact = settings?.compact_mode ?? false
  const reduced = settings?.reduced_motion ?? false
  const contrast = settings?.high_contrast ?? false

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.setAttribute('data-theme', dark ? 'dark' : 'light')

      // Keep the native chrome (status bar, keyboard) in step with the theme.
      const meta = document.querySelector('meta[name="theme-color"]')
      meta?.setAttribute('content', dark ? '#050B16' : '#EFF4FB')
    }

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-scale', String(fontScale))
    root.setAttribute('data-density', compact ? 'compact' : 'normal')
    root.setAttribute('data-reduced-motion', reduced ? 'true' : 'false')
    root.setAttribute('data-contrast', contrast ? 'high' : 'normal')
  }, [fontScale, compact, reduced, contrast])
}
