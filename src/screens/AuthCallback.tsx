import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

/** Landing point for the Google / email redirect. Works identically in the
 *  browser, the installed PWA and the Play Store TWA. */
export default function AuthCallback() {
  const navigate = useNavigate()
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return
      if (error || !data.session) { setFailed(true); return }
      await refreshProfile()
      const { data: profile } = await supabase
        .from('profiles').select('onboarding_done').eq('id', data.session.user.id).single()
      navigate(profile?.onboarding_done ? '/chat' : '/boshlash', { replace: true })
    })()
    return () => { cancelled = true }
  }, [navigate, refreshProfile])

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', gap: 12, padding: 24, textAlign: 'center' }}>
      {failed ? (
        <>
          <span style={{ fontSize: 36 }} aria-hidden>⚠️</span>
          <strong>Kirish yakunlanmadi</strong>
          <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)', margin: 0 }}>
            Havola eskirgan bo'lishi mumkin. Qaytadan kiring.
          </p>
          <button className="grad-cta press" onClick={() => navigate('/kirish', { replace: true })}
            style={{ padding: '12px 22px', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
            Kirish sahifasiga
          </button>
        </>
      ) : (
        <>
          <div className="skeleton" style={{ width: 56, height: 56, borderRadius: '50%' }} />
          <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)', margin: 0 }}>
            Hisobingiz tekshirilmoqda…
          </p>
        </>
      )}
    </div>
  )
}
