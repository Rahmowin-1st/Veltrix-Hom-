import { motion } from 'framer-motion'

/** The mark: a "V" whose wings are book pages, under a roof, with an AI star.
 *  Shares layoutId with the Ignition sequence so the logo flies into the header. */
export function VeltrixLogo({ size = 28, withLayout = false }: { size?: number; withLayout?: boolean }) {
  const Wrapper = withLayout ? motion.div : 'div'
  return (
    <Wrapper {...(withLayout ? { layoutId: 'veltrix-logo' } : {})} style={{ lineHeight: 0 }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Veltrix Hom">
        <defs>
          <linearGradient id="vx-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7C5CFF" />
            <stop offset="100%" stopColor="#38D6FF" />
          </linearGradient>
        </defs>
        <path d="M28 44 L60 22 L92 44" fill="none" stroke="url(#vx-grad)" strokeWidth={6}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        <path d="M60 52 L60 96 L34 82 L34 50 Z" fill="rgba(124,92,255,0.12)"
              stroke="url(#vx-grad)" strokeWidth={5} strokeLinejoin="round" />
        <path d="M60 52 L60 96 L86 82 L86 50 Z" fill="rgba(56,214,255,0.10)"
              stroke="url(#vx-grad)" strokeWidth={5} strokeLinejoin="round" />
        <path d="M60 30 L63.4 40.6 L74 44 L63.4 47.4 L60 58 L56.6 47.4 L46 44 L56.6 40.6 Z"
              fill="url(#vx-grad)" />
      </svg>
    </Wrapper>
  )
}
