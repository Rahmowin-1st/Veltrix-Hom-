# Widget Interaction Contract — V4 supersession notice

The Backend 1.1 generic formula/graph widget contract is intentionally retired by the V4 product reset. It is not an active product API and must not be restored.

The authoritative implementation contract is `WIDGET_PRODUCT_SPEC_V4.md`; exact responsive capabilities are in `WIDGET_SIZE_CAPABILITY_MATRIX.tsv`.

V4 exposes only Mini Calculator, Quick Converter, Currency Converter, and non-editable Currency Rate Board. They use schema 4, independent `appWidgetId` state, canonical engines, explicit old-state migration/reset, 44dp-or-larger controls, five responsive layouts, exact deep links, and honest currency freshness. Network work is scheduled outside the widget broadcast main path.
