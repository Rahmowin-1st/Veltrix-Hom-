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
