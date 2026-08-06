# Veltrix Hom V12 — Implementation Report

## No database migration required.
V12 is a frontend architecture / UI / answer-rendering release. The one server change
(answer normalization) writes through the existing schema. Migration chain is unchanged:
`…→ 008 → 010 → 011`.

---

## 1. The root cause of "it feels like a page refresh"

`AppShell` rendered:

```tsx
<motion.main key={location.pathname}>
```

A changing `key` is an instruction to React to **throw the subtree away and build a new
one**. Every tab switch therefore destroyed scroll position, draft text, filters and any
locally held data, then re-ran each screen's mount-time fetch — and because the primary
screens were `lazy()`, the first tap also waited on a chunk download. That is the whole
"refresh / freeze / lost state" complaint in one line of code.

### Fix
- **Removed the key.** Route changes no longer remount the shell's main region.
- **`TabWorkspace` keep-alive.** The three primary destinations mount once and are then
  hidden with `display:none` rather than unmounted. Hiding preserves scroll and component
  state for free; a bespoke save/restore layer would inevitably miss something. Hidden
  panels get `inert` + `aria-hidden`, so they leave the accessibility tree and stop
  hit-testing, and `display:none` means they cost nothing per frame.
- **Scroll offset is captured on hide and restored in a `requestAnimationFrame` on show**,
  because the browser discards the offset of a `display:none` element.
- **Primary screens are now eager imports** (`PrimaryTabs`), detail screens stay lazy.
  A lazy chunk is the wrong trade for a screen every session opens.

### Deliberately *not* done
Detail screens (chat, project, source) are **not** kept alive. Holding every visited
chat's DOM forever is a memory leak on exactly the low-end Android devices this targets.
Their server data lives in the query cache — which is the part that costs time to rebuild.

---

## 2. Back navigation policy

One centralized adapter; routing does the rest. Priority on Android hardware Back:

| # | Condition | Action |
|---|---|---|
| 0 | An input is focused **and** `--keyboard-inset > 60px` | blur → dismiss keyboard |
| 1 | Overlay stack non-empty | close exactly one |
| 2 | On `/manbalar` or `/personal` | go to `/general` |
| 3 | Any other route | previous screen |
| 4 | On `/general` | first press arms exit, second exits |

The keyboard check requires **both** focus and a real inset: a stale focus or a hardware
keyboard must not silently swallow Back.

Peer tabs navigate with `replace`, so tapping through tabs does not grow one history entry
per tap — which is why rule 2 exists instead of `navigate(-1)`.

`popstate` still never calls `navigate(-1)`; it only reconciles the overlay stack to the
entry the browser already landed on.

---

## 3. Header rebuild

Grid with `48px 1fr 48px`. Equal fixed side columns make the title **mathematically**
centred; with flexbox it drifts the moment one side changes width (e.g. a spinner).

- Left: circular menu button. Right: circular logo. Nothing else.
- Search and new-chat moved out — they belong beside the content they act on.
- No panel, border or shadow; the header shares the page background.
- Visual circles are 40px inside 48px grid cells, meeting the touch-target minimum.

**Logo = refresh all data**, not a page reload. Reloading the document would discard the
draft, selected sources and scroll position that the rest of V12 works to preserve. So it
invalidates the query cache, force-reloads chats/projects/talents/profile, and leaves all
local UI state intact. A `useRef` guard blocks a double tap in the same tick, and a 320 ms
minimum spin keeps a fast refresh from looking like nothing happened.

---

## 4. Composer

One component, used by General and chat.

- Placeholder is exactly `Vazifani kiriting...`, at `--fs-body-sm`.
- **The gray vertical divider is gone** — it was a `border` on the textarea; now `border: 0`.
- Text sits **above** the control row, so a long question grows upward instead of crushing
  the buttons.
- **Source selector replaces a model selector.** Defaults to `Auto`; opens an anchored
  popover (not a route); multi-select; `Manba qo'shish` included. What matters here is
  which source answers, not which model runs.
- **`Yoz` → send morph.** One `motion.button` with `layout` swaps class and content, so
  Framer interpolates the width change and the adjacent microphone **slides** rather than
  jumping. `Yoz` focuses the textarea and cannot send an empty request.
- **Send icon** is a vector `SendPlane` with a gradient body and a shaded underside —
  dimensional at any density. A raster screenshot would be blurry on these phones.
- **Plus opens an inline rail**: `Rasm · Fayl · Talent`, one row, `flex: 1 1 0` with
  `min-width: 0` so items shrink before they ever wrap at 360 px. Audio goes through
  `Fayl` (its accept list includes the audio types).

---

## 5. Answer rendering

The reported defect — a correct answer arriving as `\frac{\sqrt[5]{17}}{\sqrt[5]{544}}`
and ending in `Javob: Javob: 1,25` — is fixed at **both** layers.

**Server (`answerNormalize.ts`), applied before persistence** so the stored answer is
already clean on every future read and every device:
- strips repeated answer labels;
- wraps unwrapped LaTeX in `$…$`;
- keeps at most one `answer` block, dropping a repeat.
The system prompt now also forbids bare LaTeX and a `Javob:` prefix inside the block.

**Client (`mathNormalize.ts`)** — never trust a model:
- `segmentMath` rescues undelimited `\frac`, `\sqrt`, `\sqrt[n]`, sums, integrals and Greek
  letters, and absorbs a trailing `= 1,25` so the equation renders as one expression;
- the rescue list is **narrow on purpose**: `C:\Users\file` and `\unknowncmd{}` stay text,
  because corrupting prose is worse than under-rendering math;
- **unbalanced braces abandon the whole rescue** rather than handing KaTeX a fragment;
- a KaTeX throw falls back to the literal text — a bad formula must never blank a message.

---

## 6. Gestures and motion

`useHorizontalSwipe` (General only): right → Manbalar, left → Personal. It refuses to fire
when the touch starts on an input, button, link, slider or anything horizontally
scrollable; when horizontal travel does not beat vertical by 1.6×; when it starts in the
18 px OS edge strip; or when the keyboard is open. Pointer state lives in refs — updating
React state per `pointermove` would re-render the screen at touch frequency. Listeners are
passive; nothing calls `preventDefault`, so scrolling stays smooth.

Bottom nav keeps its shared `layoutId` pill (transform-only) and now navigates with
`replace`.

Motion levels from V11 are unchanged and still gate Framer through one `MotionConfig`.
The header spinner degrades to a static opacity change at motion level `off`.
