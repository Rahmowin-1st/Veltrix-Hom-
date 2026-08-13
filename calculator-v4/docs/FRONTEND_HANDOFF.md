# Frontend Integration Contract

Frontend should treat `ToolRegistry.default()` and `ConversionRegistry` as sources of truth, not duplicate tool lists.

## Tool screens
Render from `ToolDefinition.inputSchema`, validation/unit metadata, keypad capabilities and output schema. Execute with `PlatformEngine.execute(ToolRequest)`. Display `ToolResponse.primary`, structured outputs, metadata and structured error. Preserve tool id/schema version in history/reopen paths.

## Top-level product systems
Default launch remains Standard Calculator. Library, Converters, Graphs, and History are the four persistent workspaces. Widgets are a first-class Settings destination. Main Brain / Control Space and Liquid Glass are retired and must not be restored.

## State
Use `HistoryDb`, `PersonalizationStore`, `WidgetConfigStore` and currency repository contracts rather than presentation-owned storage. Window resize/recreation must preserve editor drafts and domain state.

## Live data honesty
Currency surfaces must display last-updated/source/freshness and distinguish stale cache. Never label stale cache live.

## Replaceable surfaces
Current activities/widgets are backend functional presentation. Frontend may later replace layout, typography, and animation without rewriting calculation/domain engines, route semantics, widget capabilities, or persistence. Do not restore Liquid Glass.


## V4 widget/currency boundaries
Preserve the four `WidgetType` families, schema-4 migration, independent `appWidgetId` stores, XS/S/M/L/XL capability progression, exact deep links, and canonical engine reuse. Currency presentation must retain source, provider effective date, verified fetch timestamp, and explicit current-cache/stale/offline/no-cache honesty. The retired generic formula/graph widget must not return.
