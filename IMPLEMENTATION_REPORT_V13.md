# Veltrix Hom V13 — Implementation Report

**No database migration required.** The server directory is byte-for-byte unchanged
(`diff -rq` clean). All V12 hotfixes are preserved: Render/Supabase, PostgREST
relationship, RPC overload (`migration-012-rpc-overload-hotfix.sql`), Vercel TypeScript,
stuck-processing.

## Files changed — 4 modified, 1 new
```
M src/screens/General.tsx                    duplicate composer removed
M src/components/chat/ChatComposer.tsx       shared core + variant + new icon
M src/components/shell/SettingsDrawer.tsx    duplicate nav removed, IA rebuilt
M src/styles/v5.css                          hero variant, drawer top row, 3D tiles
A src/components/ui/NoteWriteIcon.tsx        note+pencil vector icon
```

---

## 1. One composer, two surfaces

General carried its **own** composer markup (`v5-hero-composer`): a different
placeholder, a different send button, no source selector, no `Yoz` state, and a second
`createVoiceInput` controller competing for the same microphone. That is why the home
screen looked like an older build.

`ChatComposer`'s props were already generic, so General now renders **the same
component** rather than a copy of it. The only addition is a `variant` prop, and it
changes *nothing* structural — just padding, radius and input size:

```css
.v12-composer[data-variant='hero'] { border-radius: 30px; padding: 12px 12px 10px }
```

Layout, typography, attachment behaviour, source selector, microphone, send behaviour,
animation language and responsive rules are inherited, so the two surfaces **cannot**
drift apart again. General's duplicate voice controller was deleted — two recognizers on
one microphone is a real bug, not just redundancy.

## 2. `Yoz` icon — `NoteWriteIcon`

The diagonal pencil is replaced by a note page with a pencil, drawn as a vector.

- Not the 📝 emoji: that would pull in a platform colour glyph that renders differently
  on every Android skin and matches nothing else in the app.
- **Every paper corner is rounded.** A sharp rectangle is the single thing that makes a
  document glyph look cheap at 17 px.
- Strokes rather than fills, on `currentColor`, so it stays legible on the blue pill and
  on a light surface alike.
- Two ruled lines, not three — three crowds the page at small sizes.
- A short ferrule cross-stroke keeps the pencil from reading as an arrow.

The `Yoz` → send morph is untouched: still one `motion.button` with `layout`, so the
microphone slides rather than jumps.

## 3–4. Sidebar: duplicate navigation removed

`PRIMARY_SHORTCUTS` (General / Manbalar / Personal) was a second copy of the bottom
navigation and is **deleted**. Manbalar moved into the tools rail, where it reads as a
capability rather than a duplicate destination.

Resulting hierarchy: account + return row → search → quick tools → Yulduzlangan →
Loyihalar → So'nggi chatlar → fixed bottom actions (Qidirish · Sozlamalar · Yangi chat).
The bottom actions were already good and are preserved as-is.

## 5–6. Account header and return control share one row

The return action used to be a full-width list item, which made it read as *another*
navigation entry — exactly what §3 removes. It is now a compact circular control beside
the identity, so it reads as "take me back" and costs no vertical space. It is
context-aware: `Chatga qaytish` inside a chat, otherwise home. Avatar renders the real
image when present and falls back to initials.

## 7. Unified quick-tools rail

Six capabilities in one horizontal, individually tappable, horizontally scrollable rail:
Manbalar · Talentlar · Tarjima · Kalkulyator · Testlar · Fan o'yini. Each opens its real
existing route — no placeholders. The rail sits in its own section so it reads as a
capability launcher, visually separate from chats and projects.

## 10–12. Selective 3D

Depth is spent **only** where it aids recognition: the six capability tiles and the two
primary composer actions. Chat rows, projects, starred and every utility icon stay flat —
that restraint is what keeps the interface from looking noisy.

One recipe, one light direction (top-left), across the whole family:

```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.55),   /* top highlight */
  inset 0 -1px 0 rgba(0,0,0,.16),        /* bottom shade  */
  0 4px 10px -2px …;                     /* contact shadow */
```

Tools carry semantic tones (Manbalar blue, Talentlar cyan, Tarjima teal, Kalkulyator
indigo, Testlar amber, Fan o'yini violet) so they are distinguishable at a glance while
sharing identical geometry, radius and lighting.

## 13. Performance

The 3D is **one gradient plus three box-shadows** — no `filter`, no `backdrop-filter`, no
animated shadow, no raster asset. Nothing new animates while the rail scrolls; the only
transition is a `transform` on press. Reduced/off motion drops the movement and keeps the
depth. Net change to bundle weight is one small SVG component.

## 14–16. No regressions to navigation, Back or gestures

`TabWorkspace` keep-alive, the absence of route `key`s, the keyboard-first Back chain,
peer-tab-to-General, General swipes and the chat left-edge drawer swipe are all untouched.
No `window.location.reload()` was introduced. The composer swap reuses existing state and
the existing handoff to `/chat`, so drafts and selected sources survive exactly as before.
