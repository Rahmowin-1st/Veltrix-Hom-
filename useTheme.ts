import { Component, type ReactNode } from 'react'

interface State { error: Error | null }

/** Every screen sits inside one of these. Errors speak Uzbek, plainly. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error) { console.error('[Veltrix]', error) }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24, textAlign: 'center', gap: 12 }}>
        <span style={{ fontSize: 40 }} aria-hidden>⚠️</span>
        <strong style={{ fontSize: 'var(--fs-card)' }}>Ilova kutilmaganda to'xtadi</strong>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)', margin: 0, maxWidth: 320 }}>
          Sahifani qayta yuklang. Xato takrorlansa, sozlamalardan keshni tozalab ko'ring.
        </p>
        <button className="grad-cta press"
          onClick={() => window.location.reload()}
          style={{ padding: '12px 22px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--fs-body-sm)', fontWeight: 600 }}>
          Qayta yuklash
        </button>
      </div>
    )
  }
}
