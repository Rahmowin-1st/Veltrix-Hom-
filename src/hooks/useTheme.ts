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
      // Read the resolved page colour rather than a hardcoded hex, so the
      // Android status bar matches a tinted background instead of clashing.
      const resolved = getComputedStyle(root).getPropertyValue('--bg').trim()
      meta?.setAttribute('content', resolved || (dark ? '#050B16' : '#EFF4FB'))
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

    /*
     * Background derivation (V17).
     *
     * Previously the page used chat_gradient_from/to, which are stored per
     * account and default to a near-white pair — so changing the accent left
     * the background white. The background is now DERIVED from the accent,
     * with `bg_tint` controlling how strong the wash is.
     *
     * The mixing is done in CSS via color-mix rather than in JS, so it stays
     * correct when the accent changes and costs nothing to recompute. Only
     * the tint *ratios* are written here.
     */
    const style = settings?.bg_style ?? 'accent'
    const tint = Math.min(100, Math.max(0, settings?.bg_tint ?? 55))
    root.setAttribute('data-bg-style', style)

    // Three depths of the same hue: the page floor, the mid wash and the
    // lightest highlight. Ratios are deliberately small — a background is a
    // surface to read on, not a feature, so even tint=100 stays legible.
    root.style.setProperty('--bg-tint-strong', `${(tint * 0.16).toFixed(2)}%`)
    root.style.setProperty('--bg-tint-mid', `${(tint * 0.10).toFixed(2)}%`)
    root.style.setProperty('--bg-tint-soft', `${(tint * 0.05).toFixed(2)}%`)

    if (style === 'custom') {
      // An explicit user gradient always wins over the derived one.
      root.style.setProperty('--chat-gradient-from', settings?.chat_gradient_from ?? '#EEF5FF')
      root.style.setProperty('--chat-gradient-to', settings?.chat_gradient_to ?? '#FFFFFF')
    } else {
      // Let the stylesheet compute both ends from the accent.
      root.style.removeProperty('--chat-gradient-from')
      root.style.removeProperty('--chat-gradient-to')
    }
    root.style.setProperty('--chat-background-blur', `${settings?.chat_background_blur ?? 24}px`)
    root.style.setProperty('--mirror-intensity', String((settings?.mirror_intensity ?? 72) / 100))

    // The image layer renders only in image mode, so switching back to a
    // derived background does not leave a stale picture behind.
    const backgroundUrl = style === 'image' ? settings?.chat_background_url : null
    root.style.setProperty(
      '--chat-background-image',
      backgroundUrl ? `url("${backgroundUrl.replaceAll('"', '%22')}")` : 'none'
    )
  }, [settings, fontScale, compact, reduced, contrast])
}
