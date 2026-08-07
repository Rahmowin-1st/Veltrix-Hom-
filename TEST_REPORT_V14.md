# Veltrix Hom V14 — Test Report

Every command below actually ran. Anything not run says **NOT RUN** and why.

## Commands and real results
```
# CLIENT
npm install       → exit 0
npx tsc --noEmit  → exit 0
npx tsc -b        → exit 0      ← Vercel failure path
npx vite build    → exit 0      ← Vercel failure path
npm test          → exit 0      (2 files, 21 tests)

# SERVER
npm install       → exit 0
npx tsc --noEmit  → exit 0
npm test          → exit 0      (9 files, 58 tests)
npx tsc           → exit 0
```
**79 tests passing** — identical to V13, confirming no regression from the UI work.

## Regression evidence
```
diff -rq <v13-zip>/server  <v14>/server   →  NO DIFFERENCES
```
Server, RPCs, worker, migrations, PostgREST fixes, RPC-overload hotfix: byte-for-byte
identical. Only six frontend files changed.

## §26 removal sweep — verified by grep
| Target | Result |
|---|---|
| `Oxirgi xabar` visible text | 0 (survives only as `aria-label`, intended) |
| `ArrowLeft` in Chat.tsx | 0 |
| `<header>` in Chat.tsx | 0 — no orphan hitbox |
| `v5-avatar` in chat components | 0 |
| `chip-strong` (Ta'lim) in Message.tsx | 0 |
| source chips above composer | 0 |
| `v5-message-actions` dead CSS | removed |
| **`backdrop-filter` / `filter: blur` app-wide** | **0** |

### Regression caught and fixed during the sweep
Deleting the chat header CSS would have broken **Calculator, QuizPlay and Game**, which
legitimately use `.v5-chat-header`, and the composer's slash-command menu, which uses
`.v5-ai-card`. Both classes were restored — restyled without blur — instead of deleted.
This is exactly the kind of breakage a blind class removal causes.

## Final ZIP verification — RUN
Extracted to a clean directory and rebuilt from scratch: client `npm install` →
typecheck → `tsc -b` → `vite build` → tests, and server `npm install` → typecheck →
tests → build. All exit 0, 79/79 passing.

---

## NOT RUN
| Gate | Why | How to run |
|---|---|---|
| Playwright / browser E2E | no browser in this environment | `npm run build && npm run preview`, then drive Playwright |
| `cap:sync` + Gradle | no Android SDK installed | run on a machine with the SDK |
| Visual confirmation of curtains, bubble tone, dark theme | no browser or device | `MANUAL_ANDROID_CHECKLIST_V14.md` |
| Live Gemini answer render | no API key | ask one real math question after deploy |

The curtains, user-bubble treatment and open assistant layout are pure CSS that compiles
and builds, but their **rendered appearance has not been seen** here. Stated, not claimed.
