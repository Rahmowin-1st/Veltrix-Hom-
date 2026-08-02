import { VeltrixLogo } from '@/components/brand/VeltrixLogo'
import { useAuthStore } from '@/store/authStore'

export function AppHeader({ title }: { title?: string }) {
  const profile = useAuthStore((s) => s.profile)

  return (
    <header
      className="glass"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 'var(--header-h)',
        paddingInline: 14,
        paddingTop: 'var(--safe-top)',
        borderRadius: 0,
        borderInline: 'none',
        borderTop: 'none',
      }}
    >
      <VeltrixLogo size={26} withLayout />

      <strong style={{ fontSize: 'var(--fs-card)', fontWeight: 650, letterSpacing: '-0.01em' }}>
        {title ?? 'Veltrix Hom'}
      </strong>

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {profile?.grade != null && <span className="pill">{profile.grade}-sinf</span>}
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            width={30}
            height={30}
            style={{ borderRadius: '50%', border: '1px solid var(--border)' }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
            }}
          >
            {profile?.full_name?.[0]?.toUpperCase() ?? '👤'}
          </span>
        )}
      </span>
    </header>
  )
}
