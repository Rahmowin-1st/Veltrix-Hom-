import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { VeltrixLogo } from './VeltrixLogo'

/**
 * Branded entry sequence — traced from the real logo, never a redraw.
 *
 * Book lines fan out → the V rises from the book → roof and window
 * resolve above it → a restrained blue light crosses the finished mark →
 * the official logo takes over and the shell fades in.
 *
 * ~1200ms fresh, ~450ms on repeat, skipped entirely under reduced motion.
 * Tap anywhere to skip. It never blocks: auth loads underneath it.
 */
export function SplashScreen({
  onDone,
  quick = false,
}: {
  onDone: () => void
  quick?: boolean
}) {
  const reduced = useReducedMotion()
  const total = reduced ? 260 : quick ? 450 : 1200
  const [done, setDone] = useState(false)

  const finish = () => {
    if (done) return
    setDone(true)
    onDone()
  }

  useEffect(() => {
    const t = window.setTimeout(finish, total)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  // Scale the choreography so every variant keeps the same shape.
  const k = total / 1200
  const t = (s: number) => s * k
  const draw = !reduced && !quick

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label="Kirish animatsiyasini o'tkazib yuborish"
      onClick={finish}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish()}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-splash)' as unknown as number,
        background: 'var(--bg)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'grid', placeItems: 'center', gap: 26 }}>
        <div style={{ position: 'relative', width: 132, height: 116 }}>
          {draw ? <TracedMark t={t} /> : <VeltrixLogo height={44} />}

          {/* The finished official mark fades in over the traced outline. */}
          {draw && (
            <motion.img
              src="/veltrix-mark-256.png"
              alt=""
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: t(0.24), delay: t(0.72) }}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          )}

          {/* One restrained sweep of blue light across the completed mark. */}
          {draw && (
            <motion.div
              aria-hidden
              initial={{ x: '-140%' }}
              animate={{ x: '140%' }}
              transition={{ duration: t(0.34), delay: t(0.82), ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(104deg, transparent 40%, rgba(0,162,239,0.5) 50%, transparent 60%)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: t(0.3), delay: draw ? t(0.9) : 0 }}
          style={{
            margin: 0,
            fontSize: 'var(--fs-label)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}
        >
          Uy vazifasi yordamchisi
        </motion.p>
      </div>
    </motion.div>
  )
}

/** SVG outline that follows the real logo's geometry while it assembles. */
function TracedMark({ t }: { t: (s: number) => number }) {
  const stroke = {
    fill: 'none',
    stroke: 'url(#vx-splash)',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg viewBox="0 0 132 116" width={132} height={116} aria-hidden>
      <defs>
        <linearGradient id="vx-splash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00A2EF" />
          <stop offset="100%" stopColor="#002B64" />
        </linearGradient>
      </defs>

      {/* 1. Book lines fan out first */}
      {[
        'M14 86 C30 82 46 88 58 100',
        'M118 86 C102 82 86 88 74 100',
      ].map((d, i) => (
        <motion.path
          key={d}
          d={d}
          {...stroke}
          strokeWidth={2.4}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: t(0.26), delay: t(0.02 + i * 0.05), ease: 'easeOut' }}
        />
      ))}

      {/* 2. The V rises out of the book */}
      <motion.path
        d="M22 30 L66 104 L110 30"
        {...stroke}
        strokeWidth={4}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: t(0.34), delay: t(0.26), ease: 'easeInOut' }}
      />

      {/* 3. Roof, then the small window */}
      <motion.path
        d="M44 40 L66 22 L88 40"
        {...stroke}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: t(0.2), delay: t(0.54), ease: 'easeOut' }}
      />
      <motion.rect
        x={58} y={40} width={16} height={16} rx={1.5}
        {...stroke}
        strokeWidth={2.2}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: t(0.16), delay: t(0.64) }}
        style={{ transformOrigin: '66px 48px', transformBox: 'fill-box' }}
      />
    </svg>
  )
}
