# Veltrix Hom V12 — Final Implementation Report

## Database

**No new V12 database migration is required.** Existing production SQL/RPC fixes are preserved in both root and `server/src/db`:

`… → 008 → 010 → 011`, plus the already-applied `migration-012-rpc-overload-hotfix.sql` convergence hotfix.

## 1. Refresh-free application workspace

The destructive route key that rebuilt the app subtree was removed. `AppShell` now owns one permanent `PrimaryTabs` workspace. `General`, `Manbalar`, and `Personal` mount during authenticated bootstrap and are hidden, not destroyed, when inactive.

The bounded workspace preserves:

- draft text and selected sources;
- filters and local component state;
- independent scroll positions;
- already loaded data;
- instant return from a chat/detail route to the tab underneath.

Hidden panels use `display:none`, `inert`, and `aria-hidden`. Detail screens stay lazy and bounded so hundreds of visited chats are not retained in memory. Lazy detail screens have local Suspense boundaries; loading one can no longer remove the shell/header/drawer and imitate a full refresh. Secondary chunks are prewarmed sequentially during idle time, respecting Save-Data and very low-memory devices.

## 2. Navigation and Back

One centralized Back adapter remains; route/history architecture handles real screens.

Native Android priority:

1. dismiss a visible software keyboard;
2. close exactly one top overlay/menu/popover/rail/sheet/drawer;
3. return through valid in-app history;
4. use a semantic parent for a cold deep link with no usable history;
5. return `Manbalar`/`Personal` to `General`;
6. double-Back exit from `General`.

Browser `popstate` never performs a second navigation. Overlay history entries are replaced/consumed when navigation starts from the drawer or search, so Back never reopens a stale drawer. Peer bottom tabs use replacement semantics, while native chat/project/detail navigation still pushes meaningful history.

## 3. Header

The old panel was replaced by a page-integrated `48px 1fr 48px` grid:

- circular sidebar button on the left;
- mathematically centered `Veltrix Hom` title;
- circular Veltrix logo on the right.

Search and plus were removed from the header. The logo performs a controlled data refresh, refreshes an expiring session, invalidates query data, reloads account stores, broadcasts a source refresh event, preserves drafts/scroll/selections, and blocks duplicate taps.

## 4. Shared composer

General and active chat use the same composer language:

- exact placeholder: `Vazifani kiriting...`;
- smaller balanced type;
- permanent gray divider removed;
- source selector in the former model-selector position, defaulting to `Auto`;
- selected source chips and `Manba qo‘shish`;
- empty-state `Yoz` pill with angled pencil;
- smooth layout morph to a vector blue/cyan upper-right send plane;
- microphone moves with the morph instead of jumping;
- inline one-row `Rasm · Fayl · Talent` action rail;
- rail and source selector are registered in the global overlay stack so Back closes them first.

Audio remains supported through `Fayl`.

## 5. Bottom navigation and gestures

The bottom navigation is lighter and more opaque, with no expensive 32px live blur. It keeps a restrained shared active highlight and transform/opacity motion.

On `General` only:

- left-to-right swipe → `Manbalar`;
- right-to-left swipe → `Personal`.

Input controls, horizontally scrollable controls, vertical scrolling, OS edge gestures, and an open keyboard are excluded.

Inside chat, a narrow left-edge swipe reveals the permanently mounted drawer interactively under the finger. Motion progress writes to a Framer Motion value without React rendering on every touchmove.

## 6. Sidebar

The drawer was rebuilt as a high-contrast white ChatGPT-like surface with Veltrix functionality:

- account row;
- return to current chat/home;
- General/Manbalar/Personal shortcuts;
- compact Talentlar, Tarjima, Kalkulyator, Testlar, Fan o‘yini rail;
- Yulduzlangan chats mapped to the existing pinned model;
- Projects;
- Recent chats;
- fixed bottom Search, Settings, New chat controls.

It is permanently mounted and cache-first. Reopening does not rebuild/refetch unchanged lists. Search groups cached chats, projects, and sources, then adds debounced server message-body matches.

Touch long-press and ellipsis now open a compact anchored floating menu with Star/Unstar, Rename, Add/Remove Project, and Delete. Scrolling/moving cancels long-press; successful long-press uses haptics.

## 7. Mathematical answers

Answer cleanup exists at both layers:

- server normalizes before persistence, removes repeated labels, wraps recognized bare LaTeX, and keeps one answer block;
- client safely rescues common undelimited fractions, roots, sums, integrals, and operators;
- Windows paths, unknown commands, and malformed/unbalanced expressions remain readable text;
- KaTeX failure falls back to literal text rather than blanking the message.

`Javob: Javob: 1,25` becomes one clean answer.

## 8. Session/upload reliability

Session access now refreshes an expired/near-expiry Supabase session. JSON, chat-send, and multipart upload paths perform at most one safe 401 refresh/retry.

`AddSourceFlow` now owns an operation ID and `AbortController`. Closing/restarting the flow cancels uploads and polling; stale promises cannot advance or overwrite a newer modal state. The original request/idempotency keys remain unchanged, preventing duplicate chat sends.

## 9. Additional production cleanup

- removed the quiz hard page reload and replaced it with an in-place new attempt;
- structured server unknown-error formatting prevents `[object Object]` logs;
- added dev-only long-task instrumentation;
- preserved reduced/off motion behavior;
- kept root/server copies of fixed migrations synchronized;
- added high-contrast dark-mode fallbacks and safe-area-aware floating UI.
