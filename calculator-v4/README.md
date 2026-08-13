# Veltrix Calculator Core

Offline-first Android calculator foundation with a UI-independent Kotlin calculation engine.

## Build

Requirements: JDK 17, Android SDK 36, Gradle 8.13.

```bash
gradle :core:test
gradle :app:assembleDebug
```

The APK is produced at `app/build/outputs/apk/debug/app-debug.apk`.

A GitHub Actions workflow is included at `.github/workflows/android-build.yml`.

## Quick input examples

- `25% of 480`
- `2x+7=19`
- `2x+y=5; x-y=1`
- `100 km to miles`
- `5 feet 11 inches in cm`
- `det [1,2;3,4]`
- `inverse [4,7;2,6]`
- `dot [1,2,3] [4,5,6]`
- `derivative x^2 at 3`
- `integral x^2 from 0 to 3`
- `graph x^2-4 from -5 to 5`
- `0xFF & 0x0F`
- `mean: 1,2,3,4`
- `compound interest 1000 5 10 12`
- `days between 2026-01-01 and 2026-01-31`
- `100 USD to EUR` (online with cache fallback)
