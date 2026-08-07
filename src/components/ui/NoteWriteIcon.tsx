/**
 * "Yoz" icon — a note page with a pencil.
 *
 * Replaces the bare diagonal pencil. The meaning of 📝 is carried by the
 * geometry, not by the emoji: shipping the emoji itself would drag in a
 * platform-specific colour glyph that clashes with every other icon in the app
 * and renders differently on each Android skin.
 *
 * Deliberate choices:
 *  - Every paper corner is rounded (`rx`), because a sharp rectangle reads as
 *    a generic document glyph and is the main thing that makes an icon look
 *    cheap at 17px.
 *  - Strokes, not fills, for the page, so it stays legible on both the blue
 *    pill and a light surface.
 *  - The pencil is a single tapered body plus a tip, sized so its diagonal
 *    still reads at small sizes instead of collapsing into a blob.
 *  - `currentColor` throughout: the icon inherits the button's colour rather
 *    than fighting it.
 */
export function NoteWriteIcon({ size = 18, strokeWidth = 1.9 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {/* Page — corner radius on every corner, and the top-right is cut away
          so the pencil has somewhere to sit without overlapping the outline. */}
      <path d="M14.5 3.5H6.6A2.6 2.6 0 0 0 4 6.1v11.8a2.6 2.6 0 0 0 2.6 2.6h9.8a2.6 2.6 0 0 0 2.6-2.6v-6.2" />

      {/* Ruled lines — two only; three crowds the page at small sizes. */}
      <path d="M7.9 11.6h4.4" />
      <path d="M7.9 15.4h3.1" />

      {/* Pencil body, angled up to the right. */}
      <path d="M20.4 3.6a1.9 1.9 0 0 1 0 2.7l-5.1 5.1-3 .8.8-3 5.1-5.1a1.9 1.9 0 0 1 2.2-.5Z" />
      {/* Ferrule: the short cross-stroke that makes it read as a pencil
          rather than an arrow. */}
      <path d="M17.6 5.1 18.9 6.4" />
    </svg>
  )
}
