# Veltrix Calculator Backend Master Architecture

Status labels in this document describe source intent before CI. Final runtime evidence is authoritative.

## Platform boundaries
- **Domain/core**: `core/` contains deterministic math, Registry, structured schemas, search, graph, converters, chemistry data, text counting, adaptive state models. No Android UI or network dependency.
- **Android foundation**: `app/` owns persistence, live currency adapter/cache, WorkManager scheduling, OCR integration, AppWidget execution, lifecycle-safe temporary harness.
- **Presentation boundary**: `MainActivity`, scanner and widget views are verification surfaces. Frontend may replace presentation without rewriting core domain contracts.

## Canonical entry points
- `PlatformEngine` — structured tool execution facade.
- `ToolRegistry.default()` — Library source of truth. Registry schema version: 2.
- `ConversionRegistry` — separate top-level converter registry; never a Library subject.
- `GraphPlatform` — bounded graph sampling/conic analysis.
- `MegaSearchEngine` — deterministic local ranking.
- `AdaptiveEngine` — local personalization with Last Used 5 and no Continue.
- `HistoryDb` — unified app history with schema migration.
- `CurrencyRepository` — provider abstraction + timestamped cache/freshness model.

## Data separation
Persistence is separated into history, personalization/preferences, widget configs, currency cache, and transient OCR state. No login is required. Ordinary deterministic calculations do not require a server.

## Error model
Structured core failures use stable codes/messages and do not surface raw stack traces. Unsupported/ambiguous operations fail rather than fabricate a result.

## Extensibility
New Library tools are registered by immutable metadata + executor family. New converters are added to `ConversionRegistry`. Presentation consumes schemas and capabilities rather than hard-coded per-tool layout assumptions.
