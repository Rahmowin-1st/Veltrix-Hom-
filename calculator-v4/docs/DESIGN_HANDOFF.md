# Design Agent Handoff

Do **not** move calculation logic into the UI.

## Primary integration point

Call:

```kotlin
val result = VeltrixCalculatorEngine().calculate(input, settings)
```

Render from `CalculationResult`:

- `type` — selected capability/mode
- `primary` — hero result
- `exact` / `approximate` — secondary formats
- `alternatives` — decimal/scientific/programmer variants
- `derived` — extra cards such as circumference, interest, roots, min/max
- `steps` — optional explanation sheet
- `metadata` — graph series / currency freshness / integration state
- `error` — safe user-facing failure
- `requiresNetwork` — delegate only to online adapter

## Graph handoff

Graph requests return `metadata["series"]` as `x,y;x,y;...`. Replace this transport representation with a richer UI-state model if desired, without changing graph computation.

## History handoff

`HistoryDb` is UI-independent storage from a screen perspective. A visual redesign can replace every Android view while keeping database and core engine contracts.
