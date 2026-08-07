# Veltrix Hom V14 — Chat Presentation Upgrade

**No database migration required.** `diff -rq` proves the entire `server/` tree is
byte-for-byte identical to V13. Six frontend files changed.

```
M src/screens/Chat.tsx                    header removed, curtains, icon scroll control
M src/components/chat/Message.tsx         avatars, outer AI card, identity chips removed
M src/components/chat/ChatComposer.tsx    duplicate source chips removed
M src/components/shell/MobileHeader.tsx   inline backdrop blur removed
M src/styles/v5.css                       chat surface rebuilt, blur purged
M src/styles/glass.css                    frosted glass removed app-wide
```

---

## §1–2. Removed elements, and why each was safe to remove

| Removed | Reasoning |
|---|---|
| Top back arrow | System/browser Back already handles it. `useBackNavigation` treats `/chat/:id` as a detail route → "go back one screen". No replacement arrow, and **no leftover hitbox** — the `<header>` element is gone entirely, not hidden. |
| Whole top panel | It reserved a hard 66px block *and* ran `backdrop-filter: blur(28px)`, re-compositing the page beneath it on every scroll frame. |
| Top `Matematika` chip | Duplicated the composer's selector. |
| User `S` avatar | In a two-party chat, right-alignment already says who spoke. The avatar only consumed width the message could use. |
| Assistant avatar | Same reasoning, left side. |
| `Ta'lim` chip | This was `turn.subject` rendered as `chip chip-strong` — an identity label, not information. |
| Duplicate chip above composer | `buildChips()` pushed one pill per selected source directly above the selector that already displays them. Sources are no longer chipped; `onRemoveSource` is still wired to the selector, so removal still works. |

**The composer's source selector (`Matematika ▼`) is untouched** and remains the single
primary source UI.

## §3 + §5 + §15. Fade curtains replace panels

Two pseudo-panel gradients, `pointer-events: none`, driven by one theme token:

```css
:root { --chat-curtain: #F4F8FE; }        /* == page colour */
[data-theme='dark'] { --chat-curtain: #0B1626; }
```

- **Top**: `safe-top + 92px`, opaque at the very top → transparent by the end, in four
  stops so there is no visible band edge.
- **Bottom**: `safe-bottom + 150px`, strongest at the safe area, gone upward.

Because the curtain colour *is* the page colour, the fade has no perceivable edge and
adapts to dark theme automatically — no hardcoded white. Messages scroll underneath and
stay tappable.

## §4 + §12. Bottom panel removed, composer raised

`.v5-chat-composer-wrap` had a background gradient panel and the composer itself had
`backdrop-filter: blur(32px)` plus an 18px/58px shadow. Now: `background: transparent`,
a solid surface, and a `0 6px 22px` shadow. Bottom padding went from
`safe-bottom + 10px` to `safe-bottom + 22px` — clear of the Android gesture bar, with the
curtain visible beneath it.

## §6. The assistant outer card is gone

This was the biggest change. Previously every response was wrapped in `.v5-ai-card` — a
26px-radius container with its own blur — so a warning block or answer block inside it
became a card inside a card. Assistant prose now sits directly on the page inside
`.v5-ai-body`; semantic blocks (`answer`, `formula`, `warning`, `table`, `code`,
citations) keep their own boundaries, exactly as §21–22 require.

`.v5-ai-card` was **not** deleted from CSS — the composer's slash-command menu still uses
it. Restyled without blur rather than removed.

## §7. Minimal actions
Copy and read-aloud are now 34px icon-only buttons at `--text-3`, brightening on hover.
Labels moved to `aria-label` + `title`, so the affordance is unchanged for screen readers
while the visual weight drops. Both handlers are the original code — TTS voice, rate,
volume and language selection all preserved.

## §8–9. User bubble — Variant A

Chosen over B/C because a flat pale fill read as a disabled surface next to the white
page; the tonal wash keeps it clearly a bubble without saturation.

```css
background: linear-gradient(135deg, rgba(247,251,255,.98), rgba(225,239,255,.98));
border: 1px solid rgba(148,183,232,.42);
color: var(--text);                     /* near-black, not white */
```
Radius 20px, a 1px hairline shadow. Links, inline code, and a dark-theme variant are all
defined so contrast survives both themes.

## §10. Scroll-to-bottom
`Oxirgi xabar` text removed. Now a 38px circle with a chevron, centred above the
composer, offset by `safe-bottom + keyboard-inset + 128px` so it never collides with the
composer or the keyboard. Appears only when `turns.length > 3` and the user is not pinned
to the bottom. Animates with transform/opacity only; disabled at motion level `off`.
The label survives as `aria-label="Oxirgi xabarga o'tish"`.

## §14. App-wide blur purge — verified zero

```
grep -rn "backdrop-filter: blur|backdropFilter|filter: blur" src/  →  0 results
```

Removed: 14 `backdrop-filter` blocks in `v5.css`, the `@supports` frosted-glass block in
`glass.css`, `MobileHeader`'s inline `backdropFilter`, the full-screen
`--chat-background-blur` layer, and two large blurred pseudo-element glows (replaced with
radial gradients, which cost nothing). The `[data-motion='reduced']` rule that *lowered*
blur to 10px was deleted too — there is no blur left to reduce.

No image-processing blur existed in the codebase, so nothing functional was affected.

## §18. Message width
`.v5-chat-inner` keeps `min(780px, 100%)` and gains responsive gutters:
16px → 20px at 400px → 24px at 600px. Wide, never edge-to-edge, sane on desktop.

## §24. Performance
This release is strictly lighter than V13: every removal is a compositing cost removed,
and the two additions are static gradients that never repaint. No new JS, no scroll-frame
state, no raster assets. The message list is untouched, so pagination, streaming and
memoization are unaffected.
