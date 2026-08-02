/**
 * The official Veltrix Hom logo, used as-is.
 *
 * Two assets, never redrawn, never recolored:
 *   <VeltrixLogo />  full lockup with the "Veltrix Hom" wordmark
 *   <VeltrixMark />  cropped mark: V + roof + window + book
 *
 * Sized by height so the aspect ratio can never be distorted.
 */

const FULL_RATIO = 880 / 285
const MARK_RATIO = 326 / 285

export function VeltrixLogo({ height = 40, className }: { height?: number; className?: string }) {
  return (
    <img
      src="/veltrix-logo-640.png"
      alt="Veltrix Hom"
      width={Math.round(height * FULL_RATIO)}
      height={height}
      className={className}
      style={{ height, width: 'auto', display: 'block' }}
      draggable={false}
    />
  )
}

export function VeltrixMark({
  size = 28,
  className,
  alt = '',
}: {
  size?: number
  className?: string
  alt?: string
}) {
  // Serve the smallest asset that still covers the rendered size on 2x screens.
  const src = size <= 32 ? '/veltrix-mark-64.png' : size <= 64 ? '/veltrix-mark-128.png' : '/veltrix-mark-256.png'
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      width={Math.round(size * MARK_RATIO)}
      height={size}
      className={className}
      style={{ height: size, width: 'auto', display: 'block', flexShrink: 0 }}
      draggable={false}
    />
  )
}
