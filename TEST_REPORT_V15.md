# Veltrix Hom V15 — Test Report

Every command ran. Anything not run says **NOT RUN** and why.

```
# CLIENT
npm install       → exit 0
npx tsc --noEmit  → exit 0
npx tsc -b        → exit 0      ← Vercel failure path
npx vite build    → exit 0      ← Vercel failure path
npm test          → exit 0      (4 files, 46 tests)

# SERVER
npm install       → exit 0
npx tsc --noEmit  → exit 0
npm test          → exit 0      (9 files, 58 tests)
npx tsc           → exit 0
```
**104 tests passing** (46 client + 58 server). V14 had 79; +25 are new V15 behaviour tests.

## New tests
| Suite | n | Covers |
|---|---|---|
| `drawerGesture.test.ts` | 12 | direction lock, ambiguous→vertical, no mid-gesture switch, flick vs position snap, hysteresis at midpoint, travel clamp, closing-drag mapping |
| `chatRetry.test.ts` | 13 | snapshot replays sources/Talent/attachment, immune to later selection change, replacement adds no turn, slot id preserved, siblings untouched, stale feedback cleared, copy scoped to one message, LaTeX preserved, search matching/casing/apostrophe |

A real bug was caught by these: the apostrophe test failed because Uzbek text mixes
U+2018/U+2019/U+02BB/U+02BC — search now normalises all four.

## Regression evidence
```
diff -rq <v14-zip>/server  <v15>/server   →  NO DIFFERENCES
```
Server, RPCs, worker, migrations, auth, source processing: untouched.

Frontend: 5 modified, 4 new.

## §26 blur audit — still zero
```
grep -rn "backdrop-filter: blur|backdropFilter|filter: blur" src/  →  0
built CSS                                                          →  only "backdrop-filter: none" overrides
```

## §6 removed-item audit
`Share`, `Ulashish`, `Archive`, `Arxiv`, `Bosh ekran` → **0 occurrences** in ChatMenu.
Present and wired: Pin/Unpin, Rename, Add/Remove project, Uploaded files, Find in chat, Delete.

## Clean-extract verification — RUN
ZIP extracted to a clean directory, dependencies reinstalled, all client and server gates
re-run: all exit 0, 104/104 tests passing. No `node_modules`, no `dist`, no nested ZIP,
no temp files. Secret scan clean (only the Supabase SDK's own key-prefix validation
literal, not a credential).

---

## NOT RUN
| Gate | Why | How to run |
|---|---|---|
| Playwright / browser E2E | no browser in this environment | `npm run build && npm run preview`, then Playwright |
| `cap:sync` + Gradle | no Android SDK | run on a machine with the SDK |
| Physical drag feel, 60fps, keyboard transitions | no device | `MANUAL_ANDROID_CHECKLIST_V15.md` |
| Live retry against the real server | no API key | ask a question with a source + Talent, then Retry |
| Canonical background asset | **asset not supplied** | add the exact image to `public/` |

The gesture *decisions* are unit-tested, but the rendered feel of the drag, the floating
composer and the measured spacer have not been observed in a browser here. Stated, not
claimed.
