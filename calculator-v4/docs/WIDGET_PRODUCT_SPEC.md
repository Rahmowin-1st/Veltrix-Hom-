# Veltrix Calculator V4 — Widget Product Spec

Canonical implementation: `V4WidgetProviders.kt`, `WidgetConfigActivity.kt`, `StateStores.kt`, `WidgetStateStores.kt`.

Four families:
1. Mini Calculator
2. Quick Converter
3. Currency Converter
4. Currency Rate Board

Every `appWidgetId` owns isolated configuration/runtime state. Stale ID reuse resets incompatible state; deletion cleans stores.
Responsive capability tiers: XS 57x70, S 130x102, M 203x220, L 276x337, XL 349x455 dp minimums.
Mini Calculator uses `PlatformEngine`; Quick Converter uses `ConversionRegistry`; currency widgets use `CurrencyRepository`.
Stale/offline Currency is labeled honestly. Widget actions use exact deep-link context.
Final acceptance requires real launcher pin/add evidence where the emulator launcher supports it, plus bound-provider resize/multi-instance/process-death proof.
