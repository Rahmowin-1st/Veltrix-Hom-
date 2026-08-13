# Veltrix V4 Widget Product Contract

The backend exposes exactly four core widget families: Mini Calculator, Quick Converter, Currency Converter, and a non-editable Currency Rate Board. History, Recent, generic formula/debug, and decorative widgets are not core families.

Each placed instance is keyed only by its Android `appWidgetId`. Configuration, live input, result, rate-board lines, size tier, theme hook, and migration status are persisted independently. Reuse of an ID by a different provider explicitly cleans the previous instance before creating the provider-specific default. Deletion removes all four stores.

`WidgetConfig.CURRENT_WIDGET_SCHEMA` is 4. Schema 1/2 generic calculator state migrates to Mini Calculator, currency-interactive migrates to Currency Converter, and fixed/currency state migrates to Rate Board. Unsupported generic solver/graph state resets explicitly to Mini Calculator with a recorded migration state; it is not silently reinterpreted as another product.

Sizing uses current Android responsive `RemoteViews(Map<SizeF, RemoteViews>)` on API 31+, with XS/S/M/L/XL layouts and launcher-option fallback on older releases. Metadata declares target cells, min/max resize bounds, `previewLayout`, configuration optionality, and reconfiguration. All direct controls are at least 44dp high. User-visible schema/revision/debug metadata is prohibited.

Mini Calculator delegates expressions to the canonical `PlatformEngine`. Quick Converter delegates to canonical `ConversionRegistry`. Currency widgets use `CurrencyRepository`; widget broadcasts only recalculate from cache and enqueue bounded `WorkManager` refreshes rather than performing network I/O on the broadcast main path. Fresh/current-cache/stale/offline/no-cache states remain explicit.

Every family deep-links to its exact app destination with configured mode, category, units, currencies, and amount. Static preview layouts are available on all supported versions. Android 15+ generated previews are published one at a time with a 31-minute local attempt window to respect the rate-limited platform API, and the pin flow supplies the matching `RemoteViews` preview immediately.
