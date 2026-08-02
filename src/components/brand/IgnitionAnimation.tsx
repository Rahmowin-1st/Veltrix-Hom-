import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

/**
 * VELTRIX IGNITION — the app's entry sequence.
 *
 * Timeline (2.2s total, exactly as specified):
 *  0.00–0.35  black, faint violet vignette breathes
 *  0.35–0.90  1.5px violet stroke draws the "V", cyan dot rides the tip
 *  0.90–1.30  the V's wings rotate open into book pages, roof line appears
 *  1.30–1.60  AI star ignites, cyan bloom, light sweep crosses the logo
 *  1.60–1.95  mirrored reflection fades in, one wave travels across it
 *  1.95–2.20  glass panels assemble the frame, logo flies to the header
 *
 * Variants: first launch 2.2s · repeat 700ms · reduced-motion 400ms
 *           · performance mode 900ms (no blur, no bloom) · tap to skip.
 */

type Variant = 'full' | 'short' | 'reduced' | 'perf'

interface Props {
  onComplete: () => void
  variant?: Variant
}

const DURATION: Record<Variant, number> = {
  full: 2200,
  short: 700,
  reduced: 400,
  perf: 900,
}

export function IgnitionAnimation({ onComplete, variant = 'full' }: Props) {
  const prefersReduced = useReducedMotion()
  const resolved: Variant = prefersReduced ? 'reduced' : variant
  const total = DURATION[resolved]
  const [done, setDone] = useState(false)

  // Scale every phase so short/perf variants keep the same choreography.
  const k = total / DURATION.full
  const t = (seconds: number) => seconds * k
  const simple = resolved === 'reduced'
  const noBloom = resolved === 'perf' || resolved === 'reduced'

  const finish = () => {
    if (done) return
    setDone(true)
    onComplete()
  }

  useEffect(() => {
    const timer = window.setTimeout(finish, total)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label="Kirish animatsiyasini o'tkazib yuborish"
      onClick={finish}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish()}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--ignition-bg)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      {/* Phase 1 — breathing vignette */}
      {!simple && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: [0, 0.5, 0.32], scale: [0.85, 1.05, 1] }}
          transition={{ duration: t(0.9), times: [0, 0.4, 1] }}
          style={{
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(124,92,255,0.30) 0%, transparent 68%)',
            filter: noBloom ? 'none' : 'blur(28px)',
          }}
        />
      )}

      <motion.div
        layoutId="veltrix-logo"
        style={{ position: 'relative', width: 132, height: 132 }}
      >
        <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden>
          <defs>
            <linearGradient id="ig-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7C5CFF" />
              <stop offset="100%" stopColor="#38D6FF" />
            </linearGradient>
            <mask id="ig-sweep-mask">
              <rect x="0" y="0" width="120" height="120" fill="#fff" />
            </mask>
          </defs>

          {/* Phase 3 — roof line: the "Hom" half of the mark */}
          {!simple && (
            <motion.path
              d="M28 44 L60 22 L92 44"
              fill="none"
              stroke="url(#ig-grad)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: t(0.4), delay: t(0.9), ease: 'easeOut' }}
            />
          )}

          {/* Phase 3 — the two wings become opening book pages */}
          {[
            { d: 'M60 52 L60 96 L34 82 L34 50 Z', origin: '60px 74px', delay: 0.9 },
            { d: 'M60 52 L60 96 L86 82 L86 50 Z', origin: '60px 74px', delay: 0.96 },
          ].map((page, i) => (
            <motion.path
              key={i}
              d={page.d}
              fill="rgba(124,92,255,0.10)"
              stroke="url(#ig-grad)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              initial={simple ? { opacity: 0 } : { rotateY: -70, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{
                duration: t(0.4),
                delay: simple ? 0 : t(page.delay),
                ease: [0.2, 0.8, 0.2, 1],
              }}
              style={{ transformOrigin: page.origin, transformBox: 'fill-box' }}
            />
          ))}

          {/* Phase 2 — the V stroke, drawn */}
          <motion.path
            d="M34 50 L60 96 L86 50"
            fill="none"
            stroke="url(#ig-grad)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: simple ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: t(0.55), delay: simple ? 0 : t(0.35), ease: 'easeInOut' }}
          />

          {/* Phase 2 — cyan dot riding the stroke tip */}
          {!simple && (
            <motion.circle
              r={2.4}
              fill="#38D6FF"
              initial={{ opacity: 0, offsetDistance: '0%' }}
              animate={{ opacity: [0, 1, 1, 0], offsetDistance: '100%' }}
              transition={{ duration: t(0.55), delay: t(0.35), ease: 'easeInOut' }}
              style={{ offsetPath: 'path("M34 50 L60 96 L86 50")' }}
            />
          )}

          {/* Phase 4 — the AI star ignites */}
          <motion.path
            d="M60 30 L63.4 40.6 L74 44 L63.4 47.4 L60 58 L56.6 47.4 L46 44 L56.6 40.6 Z"
            fill="url(#ig-grad)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.15, 1], opacity: 1 }}
            transition={{
              duration: t(0.3),
              delay: simple ? 0 : t(1.3),
              times: [0, 0.65, 1],
              ease: 'easeOut',
            }}
            style={{ transformOrigin: '60px 44px', transformBox: 'fill-box' }}
          />

          {/* Phase 4 — radial bloom around the star */}
          {!noBloom && (
            <motion.circle
              cx={60}
              cy={44}
              r={26}
              fill="#38D6FF"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 0.35, 0], scale: 1.6 }}
              transition={{ duration: t(0.45), delay: t(1.3) }}
              style={{ transformOrigin: '60px 44px', transformBox: 'fill-box', filter: 'blur(10px)' }}
            />
          )}
        </svg>

        {/* Phase 4 — light sweep, left to right, 250ms */}
        {!simple && (
          <motion.div
            aria-hidden
            initial={{ x: '-130%' }}
            animate={{ x: '130%' }}
            transition={{ duration: t(0.25), delay: t(1.35), ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%)',
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Phase 5 — mirrored reflection with a single travelling wave */}
        {!simple && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.18 }}
            transition={{ duration: t(0.35), delay: t(1.6) }}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              height: 132,
              transform: 'scaleY(-1)',
              filter: noBloom ? 'none' : 'blur(8px)',
              WebkitMaskImage: 'linear-gradient(to top, transparent 5%, #000 85%)',
              maskImage: 'linear-gradient(to top, transparent 5%, #000 85%)',
              overflow: 'hidden',
            }}
          >
            <svg viewBox="0 0 120 120" width="132" height="132">
              <path d="M34 50 L60 96 L86 50" fill="none" stroke="url(#ig-grad)" strokeWidth={1.5} />
              <path
                d="M60 30 L63.4 40.6 L74 44 L63.4 47.4 L60 58 L56.6 47.4 L46 44 L56.6 40.6 Z"
                fill="url(#ig-grad)"
              />
            </svg>
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: t(0.35), delay: t(1.7), ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, transparent, rgba(56,214,255,0.4), transparent)',
              }}
            />
          </motion.div>
        )}
      </motion.div>

      {/* Phase 6 — glass panels close in from four sides to build the frame */}
      {!simple &&
        (['top', 'bottom', 'left', 'right'] as const).map((side) => (
          <motion.div
            key={side}
            aria-hidden
            initial={{
              opacity: 0,
              x: side === 'left' ? -40 : side === 'right' ? 40 : 0,
              y: side === 'top' ? -40 : side === 'bottom' ? 40 : 0,
            }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: t(0.25), delay: t(1.95), ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              position: 'absolute',
              [side]: 0,
              width: side === 'left' || side === 'right' ? 1 : '100%',
              height: side === 'top' || side === 'bottom' ? 1 : '100%',
              background:
                'linear-gradient(var(--_a,90deg), transparent, rgba(124,92,255,0.5), transparent)',
            }}
          />
        ))}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: t(0.3), delay: simple ? 0 : t(1.5) }}
        style={{
          position: 'absolute',
          bottom: 'calc(72px + var(--safe-bottom))',
          margin: 0,
          fontSize: 'var(--fs-label)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
        }}
      >
        Homework. Aniq. Source bilan.
      </motion.p>
    </motion.div>
  )
}
