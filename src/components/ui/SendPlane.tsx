/**
 * Send icon: a paper plane angled toward the upper-right.
 *
 * Drawn as a vector with a soft gradient and a highlight facet, so it reads as
 * a lightly dimensional object at any density instead of the flat single-tone
 * glyph the icon set provides. It must stay a vector — shipping a raster
 * screenshot of a button is blurry on exactly the high-DPI phones this targets.
 *
 * `currentColor` is intentionally not used: the plane keeps its own brand
 * gradient against the button's blue fill.
 */
export function SendPlane({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="veltrix-send-body" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity=".96" />
          <stop offset="1" stopColor="#E8F3FF" stopOpacity=".92" />
        </linearGradient>
      </defs>

      {/* Main body, nose pointing to the upper right. */}
      <path
        d="M20.6 3.4 3.9 9.6c-.9.33-.86 1.63.06 1.9l6.2 1.85 1.85 6.2c.27.92 1.57.96 1.9.06L20.6 3.4Z"
        fill="url(#veltrix-send-body)"
      />
      {/* Shaded underside gives the fold its depth. */}
      <path
        d="M20.6 3.4 10.16 13.35l1.85 6.2c.27.92 1.57.96 1.9.06L20.6 3.4Z"
        fill="#B9D9FF"
        fillOpacity=".85"
      />
      {/* Crease highlight. */}
      <path d="M20.6 3.4 10.16 13.35" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  )
}
