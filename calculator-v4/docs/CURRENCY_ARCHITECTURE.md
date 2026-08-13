# Live Currency Architecture

## Provider
Primary adapter: Frankfurter v2 via `CurrencyRateProvider` abstraction. No secret is embedded in the APK. Provider can be replaced/fallback-added without changing callers.

## Repository/cache
`CurrencyRepository` validates 3-letter pairs, fetches on demand, persists `rate`, `base`, `quote`, provider source, effective date and fetch timestamp, and returns explicit `stale` / `fromCache` state.

Failure behavior: when refresh fails, last verified cache may be returned **only as stale**. No cached data is mislabeled current/live. If no verified cache exists, a structured provider failure is returned and the deterministic app remains usable.

## Refresh
Foreground/live surfaces render verified cache immediately and request an active refresh when appropriate. WorkManager performs network-constrained 30-minute periodic refresh plus one-time refresh jobs triggered by widget/update interaction paths. Fixed/interactive widgets show source/effective date/fetch timestamp/freshness and refresh their computed value from verified cache. See `CURRENCY_FRESHNESS_1_1.md`.
