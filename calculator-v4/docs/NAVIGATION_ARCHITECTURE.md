# Veltrix Calculator V4 — Navigation Architecture

Canonical source: `core/.../AppNavigation.kt`.
Android integration: `app/.../MainActivity.kt`.
Runtime suite: `V4NavigationRuntimeTest.kt`.

Destinations: Home; Workspace(Library/Converters/Graphs/History); ToolDetail; ConverterDetail; GraphDetail; HistoryDetail; Settings(returnTab); WidgetCenter(returnTab).

Primary tab switching replaces primary state instead of building an unbounded stack.
Detail destinations restore semantic parents. Invalid restored IDs fall back safely.
Current functional-shell bottom navigation is Library / Convert / Graphs / History + Settings.
Deep links: `veltrix://home/...`, `veltrix://tool/...`, `veltrix://converter/...`.
System IME and root Back remain Android-owned.
Older UX row names absent from executable source are not backend contracts.
