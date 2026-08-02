import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

export function useTheme() {
  const theme = useAuthStore((s) => s.settings?.theme ?? 'system')
  const glass = useAuthStore((s) => s.settings?.glass_intensity ?? 80)

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
          : theme
      root.dataset.theme = resolved
      const meta = document.querySelector('meta[name="theme-color"]')
      meta?.setAttribute('content', resolved === 'light' ? '#F5F7FB' : '#080B12')
    }
    apply()

    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  // Glass intensity slider maps 0..100 → blur 0..24px
  useEffect(() => {
    document.documentElement.style.setProperty('--blur', `${(glass / 100) * 24}px`)
  }, [glass])
}
