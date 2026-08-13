# Backend Iteration 1.1 — Standalone Widget Interaction

## Contract
Normal calculation after placement does not require `MainActivity`. Initial widget configuration may use `WidgetConfigActivity`.

`WidgetInteractionEngine` consumes the canonical `ToolDefinition.inputSchema` / `outputSchema`; computation always returns to `PlatformEngine.execute(ToolRequest)`. There are no parallel quadratic/Vieta/physics/geometry calculation engines in the widget layer.

## State machine
Persisted state (`widget_interaction_v2`):

`CONFIGURED → SELECT_FIELD → EDIT_VALUE → APPLY → SOLVE → RESULT`

Supported generic actions: digit/math key, BACKSPACE, CLEAR, SIGN, DECIMAL, separator, NEXT/PREVIOUS FIELD, option cycle, unit cycle, APPLY, SOLVE and RESET.

`WidgetConfig` schema v2 remains backward-readable from schema v1. Reconfiguration clears stale interaction/runtime state for that widget id.

## Android interaction model
The widget uses `RemoteViews` click actions and immutable `PendingIntent` broadcasts. Structured entry uses custom controls rather than a system keyboard. Broadcast work stays short; network-backed currency refresh uses bounded `goAsync` or WorkManager.

## Capability by size
- **SMALL** — compact expression/result; solve/refresh; intentionally limited editing surface.
- **MEDIUM** — selected field + previous/next + essential custom keypad + solve.
- **LARGE** — medium capability plus schema-specific option/unit/reset controls and richer metadata.

Size changes select capabilities; they do not merely stretch one layout.

## Graph widgets
`graph-parabola` supports widget-side edits of parameters such as `a`, `h`, `k` / form, recomputes through the graph domain engine and regenerates the preview bitmap. Function graph widget continues to render deterministic sampled graph data. Pan/pinch is intentionally not claimed inside `RemoteViews`.

## Converter relationship
The 104-tool Library registry intentionally excludes standalone converters; `ConversionRegistry` is a separate canonical registry. Schema-driven formula widgets with canonical units can cycle compatible units through `ConversionRegistry`. No fake converter ToolDefinition was added, so the 104-tool contract remains unchanged.

## Persistence
Widget config, selected field, edit buffer, structured values/units, result/output map, graph signature and revision are process-independent. Deleting a widget removes all corresponding state.
