import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/** Applies account-synced visual preferences without a first-paint flash. */
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

    const accent = settings?.accent_color ?? '#0A6CFF'
    const secondary = settings?.accent_secondary ?? '#4ACEFF'
    root.style.setProperty('--v5-accent', accent)
    root.style.setProperty('--v5-accent-2', secondary)
    root.style.setProperty('--chat-gradient-from', settings?.chat_gradient_from ?? '#EEF5FF')
    root.style.setProperty('--chat-gradient-to', settings?.chat_gradient_to ?? '#FFFFFF')
    root.style.setProperty('--chat-background-blur', `${settings?.chat_background_blur ?? 24}px`)
    root.style.setProperty('--mirror-intensity', String((settings?.mirror_intensity ?? 72) / 100))

    const backgroundUrl = settings?.chat_background_url
    root.style.setProperty(
      '--chat-background-image',
      backgroundUrl ? `url("${backgroundUrl.replaceAll('"', '%22')}")` : 'none'
    )
  }, [settings, fontScale, compact, reduced, contrast])
}
