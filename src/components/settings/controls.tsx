import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/** Shared settings primitives, so every group looks and behaves the same. */

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-4)' }}>
      {title && <h3 style={{ fontSize: 'var(--fs-h3)' }}>{title}</h3>}
      {children}
    </section>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      padding: '11px 13px', borderRadius: 'var(--r-sm)',
      background: 'var(--brand-soft)', color: 'var(--brand)',
      fontSize: 'var(--fs-micro)', lineHeight: 1.6,
    }}>{children}</p>
  )
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>{label}</span>
      <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 560 }}>{value}</span>
    </div>
  )
}

export function Toggle({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 14 }}>
      <span className="col" style={{ gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>{label}</span>
        {hint && <span className="micro">{hint}</span>}
      </span>
      <button
        role="switch" aria-checked={value} aria-label={label}
        onClick={() => onChange(!value)}
        style={{
          width: 52, height: 31, flexShrink: 0, borderRadius: 99, cursor: 'pointer',
          border: 'none', padding: 3,
          background: value ? 'var(--brand)' : 'var(--bg-hover)',
          boxShadow: value ? '0 2px 8px rgba(10,108,255,.30)' : 'inset 0 1px 3px rgba(0,0,0,.10)',
          transition: 'background var(--t-toggle) var(--ease)',
          display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start',
        }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 620, damping: 34 }}
          style={{
            width: 25, height: 25, borderRadius: '50%', background: '#fff',
            boxShadow: '0 2px 5px rgba(0,0,0,.22)',
          }}
        />
      </button>
    </div>
  )
}

export function Segment({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>{label}</span>
      <div className="row" style={{
        gap: 4, background: 'var(--bg-hover)', padding: 4, borderRadius: 'var(--r-md)',
      }}>
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
            style={{
              position: 'relative', flex: 1, minHeight: 40,
              borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
              background: 'transparent', fontFamily: 'var(--font)',
              fontSize: 'var(--fs-label)',
              fontWeight: value === v ? 640 : 520,
              color: value === v ? 'var(--text)' : 'var(--text-2)',
              transition: 'color var(--t-hover) var(--ease)',
            }}>
            {value === v && (
              <motion.span
                layoutId={`seg-${label}`}
                transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 'var(--r-sm)',
                  background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', zIndex: -1,
                }}
              />
            )}
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

export function TextField({ label, value, onSave }: {
  label: string; value: string; onSave: (v: string) => void
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>{label}</span>
      <input className="input" value={v} maxLength={60}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() && v !== value && onSave(v.trim())} />
    </label>
  )
}

export function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  format: (v: number) => string; onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 520 }}>{label}</span>
        <span className="chip" style={{ height: 26 }}>{format(local)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={local} aria-label={label}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={() => onChange(local)} onTouchEnd={() => onChange(local)}
        style={{ width: '100%' }} />
    </div>
  )
}

/**
 * Single-select list with an icon-free leading tile, a title, a subtitle and
 * a radio on the right — the pattern the reference uses for "Javob uslubi"
 * and "Yechish uslubi".
 *
 * Rendered as real <button role="radio"> elements inside a radiogroup rather
 * than styled divs, so keyboard and screen-reader behaviour come for free and
 * the selected state is announced.
 */
export function ChoiceList({ value, options, onChange }: {
  value: string
  options: [string, string, string][]
  onChange: (value: string) => void
}) {
  return (
    <div className="v16-choices" role="radiogroup">
      {options.map(([id, title, subtitle]) => {
        const selected = value === id
        return (
          <button key={id} type="button" role="radio" aria-checked={selected}
            className="v16-choice" data-selected={selected ? '' : undefined}
            onClick={() => onChange(id)}>
            <span className="v16-choice-copy">
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </span>
            <span className="v16-radio" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Curated accent presets.
 *
 * A raw colour input alone is a poor primary control: most people do not want
 * to pick a hex, and an unconstrained picker makes it easy to choose a hue
 * that renders the tinted background unreadable. These six are pre-checked to
 * stay legible at every tint level. The exact picker remains available below
 * for anyone who wants it.
 */
const ACCENTS: [string, string][] = [
  ['#0A6CFF', 'Ko‘k'],
  ['#6B4EFF', 'Siyoh'],
  ['#00A67E', 'Yashil'],
  ['#E0559A', 'Pushti'],
  ['#F0872A', 'Zarhal'],
  ['#0E9DBE', 'Turkuaz'],
]

export function AccentSwatches({ value, onChange }: {
  value: string
  onChange: (hex: string) => void
}) {
  const current = (value ?? '').toUpperCase()
  return (
    <div>
      <div className="v17-swatch-label">Asosiy rang</div>
      <div className="v17-swatches" role="radiogroup" aria-label="Asosiy rang">
        {ACCENTS.map(([hex, name]) => {
          const selected = current === hex.toUpperCase()
          return (
            <button key={hex} type="button" role="radio" aria-checked={selected}
              aria-label={name} title={name}
              className="v17-swatch" data-selected={selected ? '' : undefined}
              style={{ '--swatch': hex } as React.CSSProperties}
              onClick={() => onChange(hex)} />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Backgrounds that ship with the app. Bundled as WebP and served from the
 * app's own origin, so they load instantly and work offline — unlike a
 * pasted remote URL, which can vanish or block the render.
 */
const BUILT_IN: [string, string][] = [
  ['/backgrounds/veltrix-soft-blue.webp', 'Yumshoq ko‘k'],
]

export function BuiltInBackgrounds({ value, onChange }: {
  value: string | null
  onChange: (url: string | null) => void
}) {
  return (
    <div>
      <div className="v17-swatch-label">Tayyor fonlar</div>
      <div className="v17-bg-grid">
        <button type="button" className="v17-bg-tile v17-bg-none"
          data-selected={!value ? '' : undefined}
          onClick={() => onChange(null)} aria-label="Fonsiz">
          Yo‘q
        </button>
        {BUILT_IN.map(([url, name]) => (
          <button key={url} type="button" className="v17-bg-tile"
            data-selected={value === url ? '' : undefined}
            style={{ backgroundImage: `url("${url}")` }}
            onClick={() => onChange(url)} aria-label={name} title={name} />
        ))}
      </div>
    </div>
  )
}
