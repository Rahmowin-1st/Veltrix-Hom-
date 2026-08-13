# Backend Iteration 1.1 — Currency Freshness Architecture

## Objective
Maximize practical freshness without pretending Android background scheduling is real-time and without embedding third-party secrets in the APK.

## Provider architecture
`CurrencyRateProvider` remains the abstraction. The production-safe client default is a provider chain whose current direct member is Frankfurter v2. UZS pairs first request the Central Bank of Uzbekistan provider through Frankfurter and fall back to the normal Frankfurter v2 current-rate endpoint if needed.

The chain can accept a future intraday provider exposed through a Veltrix-controlled secure server gateway. API credentials are not hardcoded in this APK.

## Why the direct default remains keyless
Research for Iteration 1.1 found fresher commercial services, but the candidates reviewed require client credentials/API keys. Their higher refresh tiers are suitable only behind a secure gateway if Veltrix later needs intraday reference data. The app therefore does not trade a clear client-secret leak for nominal provider frequency.

Research references (reviewed 2026-08-11):
- Android App Widgets / RemoteViews and widget update guidance — developer.android.com
- Android WorkManager periodic work guidance — developer.android.com
- Frankfurter v2 docs and Central Bank of Uzbekistan provider pages — frankfurter.dev
- Open Exchange Rates pricing/update-frequency page — openexchangerates.org
- CurrencyAPI documentation/pricing — currencyapi.com

## Active Currency screen
1. Cached verified value is rendered immediately.
2. Open/resume requests refresh when appropriate.
3. Amount/pair edits recompute from the freshest verified cache immediately and trigger a throttled fresh-network path.
4. Explicit Refresh forces a provider attempt.
5. Source, effective rate date, fetch timestamp and freshness state remain visible.

## Currency widgets
### Fixed
The configured amount is immutable during refresh. A refresh changes only the verified rate-derived result. Source/date/fetch time/freshness are persisted and displayed.

### Interactive
Amount can be edited using widget controls; pair can be swapped; refresh/equals requests a current provider attempt. Cached conversion is shown immediately when available. Ordinary use does not require opening the app.

## Background strategy
- AppWidget framework update period: 30 minutes.
- WorkManager periodic currency work: 30 minutes, network constrained, battery/Doze compliant and intentionally inexact.
- Widget/update/interaction events may enqueue one-time refresh work.
- Foreground/direct user refresh may use a bounded immediate network attempt with retry.

No every-second/minute background guarantee is claimed.

## Freshness semantics
Every cached rate retains:
- base / quote
- numeric rate
- provider/source
- effective provider date
- `fetchedAtEpochMs`
- `fromCache`
- explicit `stale`

Labels are `CURRENT_FETCH`, `CURRENT_CACHE`, or `STALE`. A failed refresh can fall back only to a previously verified cached record and marks it stale.

## Retry/failure
Transient network, HTTP 408, 429 and 5xx errors use bounded exponential retry. Invalid/non-retryable provider responses fail immediately. Currency failure never disables deterministic offline calculators.
