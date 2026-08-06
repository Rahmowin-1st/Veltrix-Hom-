# Veltrix Hom V12 — Test Report

Separates what was **executed** from what was **not run**. Nothing is invented.

## Commands run and their real results

```
# client
npm install            → exit 0
npm run typecheck      → exit 0
npm run test           → exit 0   (2 files, 21 tests)
npm run build          → exit 0   (bundle + PWA service worker)

# server
npm install            → exit 0
npm run typecheck      → exit 0
npm run test           → exit 0   (9 files, 58 tests)
npm run build          → exit 0   (dist emitted)
```

**Total: 79 automated tests passing.**

## New in V12 — 30 tests

### `src/lib/__tests__/mathNormalize.test.ts` — 14 (client)
The exact reported defect and its edges:
- `\frac{\sqrt[5]{17}}{\sqrt[5]{544}} = 1,25` becomes **one** inline expression including
  the `= 1,25` tail.
- `\frac`, `\sqrt`, `\sqrt[3]` all rescued; surrounding prose stays text.
- Explicit `$…$` and `$$…$$` still honoured; nested braces not truncated.
- **Negative cases that matter more than the positive ones:** `C:\Users\file`,
  `kod \n bilan` and `\unknowncmd{x}` are *not* converted to math.
- Unbalanced braces (`\frac{1}{2`) abandon the rescue and render as text.
- Empty input, a lone `$` and a lone `\` do not throw.
- `Javob: Javob: 1,25 (C varianti)` → `1,25 (C varianti)`; `JAVOB:`/`Answer:` handled;
  a mid-sentence `Javob:` and the word `Javobni` are preserved.

### `src/lib/__tests__/navigationPolicy.test.ts` — 7 (client)
The Back priority chain as pure decision logic:
- keyboard dismissal wins even with an overlay open on a detail route;
- a focused input with the keyboard **closed** does not swallow Back;
- exactly one overlay closes per press;
- `/manbalar` and `/personal` go to `/general`; detail routes go back;
- root needs two presses to exit, and never exits while an overlay is open.

### `server/src/db/tests/answerNormalize.test.ts` — 9 (server)
- doubled label removed, mid-sentence label preserved;
- unwrapped LaTeX wrapped, already-delimited text untouched, prose untouched;
- only the first `answer` block survives; an answer that empties after cleanup is dropped;
- step items normalized;
- `null`, a string, and an array containing `null`/numbers do not throw.

## Inherited suites — still passing (49 server)
Chat request concurrency (6), account isolation + RLS (6), worker crash/lease/quota (7),
composite-cursor pagination (4), PDF pipeline on generated fixtures (6), evidence
locking (7), TOC extraction (8), page-owned indexing (5).

## Bundle secret check — RUN, clean
The production bundle was scanned for a service-role key, a Gemini key and any JWT-shaped
literal. None present. `.env` files are excluded from the archive; only `.env.example`
files ship.

---

## NOT RUN — with the command for each

| Gate | Why | How to run |
|---|---|---|
| Playwright E2E (§14 items 1–10, 16) | no browser in this environment | `npm run build && npm run preview`, then drive Playwright against the preview URL |
| `npm run cap:sync` / Android build | no Android SDK installed | run on a machine with the SDK; see `MANUAL_ANDROID_CHECKLIST_V12.md` |
| Physical device gesture/keyboard feel | no device | `MANUAL_ANDROID_CHECKLIST_V12.md` |
| Live Gemini answer shape | no API key | send one real math question and confirm the answer renders as fractions with a single `JAVOB` card |

The keep-alive, swipe, drawer-cache and scroll-restoration behaviours are implemented and
type-checked, and their decision logic is unit-tested where it could be extracted — but
their **rendered** behaviour has not been exercised in a browser here. They are listed
above rather than claimed as passing.
