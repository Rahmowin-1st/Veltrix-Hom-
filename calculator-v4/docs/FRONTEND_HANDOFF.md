# Frontend Integration Contract

Frontend should treat `ToolRegistry.default()` and `ConversionRegistry` as sources of truth, not duplicate tool lists.

## Tool screens
Render from `ToolDefinition.inputSchema`, validation/unit metadata, keypad capabilities and output schema. Execute with `PlatformEngine.execute(ToolRequest)`. Display `ToolResponse.primary`, structured outputs, metadata and structured error. Preserve tool id/schema version in history/reopen paths.

## Top-level product systems
Default launch remains Standard Calculator. Library, Converter and Graph are separate systems. Do not assume bottom navigation. Main Brain contains Standard Calculator, Last Used 5, recent/frequent converters, Library, Graphs, History, Widgets and Settings — no Continue.

## State
Use `HistoryDb`, `PersonalizationStore`, `WidgetConfigStore` and currency repository contracts rather than presentation-owned storage. Window resize/recreation must preserve editor drafts and domain state.

## Live data honesty
Currency surfaces must display last-updated/source/freshness and distinguish stale cache. Never label stale cache live.

## Replaceable surfaces
Current activities/widgets are test harness presentation. Frontend may replace layout, typography, animation, Liquid Glass and navigation presentation without rewriting calculation/domain engines.


## Iteration 1.1 widget/currency boundaries
Do not move `WidgetInteractionEngine` state transitions or Registry execution into frontend presentation. AppWidget UI may be restyled, but action ids, schema-driven field selection, v1→v2 config migration and persisted interaction contracts must remain compatible. Currency presentation must retain source, provider effective date, verified fetch timestamp and `CURRENT_FETCH` / `CURRENT_CACHE` / `STALE` honesty.
