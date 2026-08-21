# Veltrix Calculator V4 — Frontend Handoff VNext

Frontend owns final visual design. Backend owns deterministic calculation/domain/navigation/persistence semantics.

Canonical integration points:
- `PlatformEngine.execute`
- `ToolRegistry.default`
- `ConversionRegistry`
- `CurrencyRepository`
- `AppNavigationState`
- `HistoryDb`
- `PersonalizationStore`
- widget config/runtime stores.

Frontend must not duplicate canonical tool IDs, formulas, solve-target rules, converter registries, route semantics, persistence schemas or currency freshness logic.
Render from `ToolDefinition`; preserve canonical IDs/schema versions across history, reopen and deep links.
