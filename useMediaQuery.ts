/** Never a spinner, never a white screen. */
export function ScreenSkeleton() {
  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }} aria-busy="true" aria-label="Yuklanmoqda">
      <div className="skeleton" style={{ height: 44 }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 88 }} />
      <div className="skeleton" style={{ height: 88, opacity: 0.6 }} />
    </div>
  )
}
