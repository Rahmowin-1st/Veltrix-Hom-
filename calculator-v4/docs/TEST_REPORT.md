# Backend Test Report — Iteration 1.1 Source Contract

This file describes the tests shipped in the exact source. It intentionally does **not** claim CI success before execution. Final run logs, `gate-summary.txt`, provenance and Android test reports are authoritative.

## Core regression
Existing core/JUnit suites remain unchanged and must export exactly 104 canonical tools across 9 subjects.

## Iteration 1.1 instrumentation
`Iteration11WidgetRuntimeTest` covers standalone Quadratic, Vieta, Physics Ohm's Law, Geometry Rectangle Area, editable Parabola graph signature/render, fixed currency, interactive currency, config migration and persisted widget state.

`Iteration11CurrencyRuntimeTest` covers retry, fresh cache, stale cache, provider failure fallback, timestamps, forced active refresh and offline-style cached conversion.

`LiveCurrencyRuntimeTest` performs the real provider probe when CI passes `liveProbe=true`.

## External runtime gate
CI must additionally prove APK install/cold launch, process kill/relaunch with widget state, airplane/offline deterministic paths, multi-window task resize, full connected instrumentation, reinstall and final relaunch.

No `BACKEND COMPLETE` claim is valid unless the final evidence run is green.

## Backend Iteration 1.1 Final Android Gate
- CI run: 31494970586
- Commit: 544d7e8f8afefcd8a0a61724a4f3c525078181ce
- Branch: veltrix-calculator-backend-1.1
- Core unit tests: PASS
- Canonical registry: 104 tools / 9 subjects PASS
- Android app + instrumentation compile: PASS
- Emulator boot + ADB: PASS
- APK install + cold launch: PASS
- Standalone widget interaction: 11/11 PASS
- Currency cache/stale/retry/active refresh: PASS
- Real Frankfurter provider probe: PASS
- Widget real process-death persistence: PASS
- Backend Master history/adaptive/config process restart: PASS
- Offline deterministic + graph: PASS
- Native multi-window resize: PASS
- Full connected regression: PASS
- Reinstall + final relaunch: PASS
- Physical OEM floating-window behavior: NOT VERIFIED
- Physical camera quality: NOT VERIFIED
- Play Store release signing: NOT VERIFIED
