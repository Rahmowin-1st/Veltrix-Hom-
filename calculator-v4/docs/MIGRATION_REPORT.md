# Veltrix Calculator V4 — Migration Report

Backend 1.1 verified baseline: `544d7e8f8afefcd8a0a61724a4f3c525078181ce`.

V4 preserves canonical calculation/history semantics while expanding registry schema, navigation state and four-family widget contracts.
History schema migration preserves prior rows.
Widget schema normalizes to version 4, maps supported legacy widget tool IDs, resets unsupported legacy state explicitly, and scopes state by `appWidgetId`.
No destructive account/server migration is required by this Android-local V4 foundation.
Final runtime migration/process-death evidence is produced by the exact-SHA final gate, not claimed by this document alone.
