import type { ReactNode } from 'react'

/** An empty screen is an invitation to act, not a shrug. */
export function EmptyState({
  emoji, title, body, action,
}: { emoji: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 10, padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ fontSize: 40 }} aria-hidden>{emoji}</span>
      <strong style={{ fontSize: 'var(--fs-card)', fontWeight: 600 }}>{title}</strong>
      <p style={{ margin: 0, maxWidth: 300, color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)', lineHeight: 1.5 }}>
        {body}
      </p>
      {action}
    </div>
  )
}
