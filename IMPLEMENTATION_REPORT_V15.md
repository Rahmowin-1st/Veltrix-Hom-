# Veltrix Hom V15 — Chat UX Upgrade

**No database migration required.** `diff -rq` confirms `server/` is byte-for-byte
identical to V14.

## §1 Chat background — asset NOT supplied
No background image exists in the V14 repo, and none was attached to this conversation.
§1 forbids reinterpreting, regenerating or recoloring it, and §33 forbids fabricating
assets — so **the existing pale blue/white background is kept unchanged**. Nothing was
invented in its place. Drop the exact PNG/WebP into `public/` and point
`--chat-curtain` plus a `background-image` layer at it; no other change is needed.

## §3–§4 Floating composer + last message never hidden
The composer was a **flex child**, so it occupied layout and pushed the list above it —
content could never pass behind it. It is now `position: absolute; bottom: 0` with
`pointer-events: none` on the wrapper and `auto` on the composer itself, so the gap
around it stays scrollable.

That alone would hide the final answer, so clearance comes from a **measured** spacer:
a `ResizeObserver` on the composer writes its real height into state (2px threshold to
avoid sub-pixel re-render storms), and the tail element renders at `height + 18`. It
tracks a growing draft, an attachment and the action rail automatically — no fixed blank
gap, which §4 explicitly rules out.

## §5 Top floating controls
Two islands over the fade, inside a `pointer-events: none` strip so the list keeps full
scroll height behind them. Left: circular menu. Right: a pill grouping new-chat + overflow,
split by a hairline. Surface is a 140° three-stop blend — whiter at top-left, cooler at
bottom-right — so it reads as partially mixed white/light-blue rather than a gradient
stripe. No blur, no header bar.

## §6–§8 Three-dot menu
Share, Add-to-home and Archive were **already absent** in V14 (verified by grep) — nothing
to remove. Added, wired to real systems:
- **Pin/Unpin** → existing `togglePin`; sidebar updates through the shared store.
- **Add to project** → existing `moveToProject` + real `projectStore` list.
- **Uploaded files** → built from the conversation's own `turn.image` attachments, passed
  in from the chat screen. The entry is **hidden entirely** where messages aren't loaded,
  so it can never open a fabricated or empty list. Files download via data URL.
- **Find in chat** → opens `ChatSearch`.
- **Delete** → existing `remove`, red styling, confirm step retained.

## §9–§13 Message group and actions
Each assistant turn is one `.v5-ai-body` grid — coherent rhythm, subtle boundaries, no
outer card, no avatar, no identity chip. Actions sit directly under it: Copy, Like,
Dislike, Voice, Retry.

- **Copy** uses `blocksToPlainText` over *that message's* blocks only; prompt, UI labels
  and neighbours are structurally unreachable. Formulas keep LaTeX (the only lossless
  plain-text form).
- **Like/Dislike** are per-message, mutually exclusive and retractable. No feedback
  schema exists and §30 forbids inventing a migration, so this is session state —
  honestly scoped, not a fake persistence path.
- **Voice** now uses one module-level speech owner. Browsers expose a single
  `speechSynthesis` queue, so without a shared owner a second message layers voices and
  leaves the first button stuck on "stop". Starting anywhere cancels first; unmounting
  while speaking cancels too.

## §14–§16 Retry
`requestSnapshots` freezes **every input at send time** — text, attachment, source IDs,
Talent ID, translation — keyed by the assistant turn produced. Retry replays the snapshot,
so it stays correct even if the user has since changed the source selector or Talent.
Reading current state at retry time cannot achieve this.

**Replacement, not duplication:** `send()` takes `replaceTurnId`. When set it adds no user
turn, marks the existing answer `regenerating` (kept at 45% opacity so a failure can
restore it), and swaps content into the same slot, preserving the original id so scroll
position stays valid and stale feedback is cleared.

**Idempotency:** regenerate mints a **new** `clientRequestId` deliberately — the server is
idempotent on that key, so reusing it would replay the stored answer verbatim. That is
right for "the network dropped, resend" (the failure-path `retry`, which still reuses its
id) and wrong for "give me a better answer". Two distinct intents, two distinct paths.

## §17–§23 Drawer drag
V14 already followed the finger via a MotionValue written from `touchmove` (no React
render per pixel). V15 upgrades the decisions and robustness:
- Extracted `src/lib/drawerGesture.ts` — pure, tested: `resolveAxis`, `shouldSnapOpen`,
  `progressFromDx`.
- **Direction lock** never switches mid-gesture; ambiguous drags go to **vertical**,
  because the list scrolls constantly and the drawer opens rarely.
- **Snap** uses velocity above 0.45 px/ms, otherwise position, with hysteresis (0.42
  opening / 0.62 closing) so a midpoint release cannot flicker.
- The drawer's own close-drag now uses the **same** function, so open and close feel like
  one system.
- Robustness: multi-touch aborts, plus `pointercancel`, window `blur` and
  `visibilitychange` all clear tracking — the drawer cannot strand half-open.

## §24 Back order
`ChatSearch` registers through `useOverlayRegistration`, joining the existing overlay
stack. Back therefore closes: keyboard → search/menu → drawer → route, one layer per press.

## §37 Tests — 25 new
`drawerGesture.test.ts` (12): direction lock, tie-to-vertical, no mid-gesture switch,
flick vs position, hysteresis, travel clamping, closing-drag mapping.
`chatRetry.test.ts` (13): snapshot replay including sources/Talent, immunity to later
selection changes, replacement adds no turn, slot id preserved, other answers untouched,
stale feedback cleared, copy scope, LaTeX preservation, search matching/casing/apostrophes.
