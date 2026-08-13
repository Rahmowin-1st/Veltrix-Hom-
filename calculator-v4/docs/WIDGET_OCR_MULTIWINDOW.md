# Widgets, OCR and Native Window Foundation

## AppWidget platform
Widget configuration is versioned and persisted independently by `appWidgetId`. V4 exposes four purpose-built families and five responsive layouts; it does not expose generic formula, graph, Recent, or History widgets. Mini Calculator delegates to `PlatformEngine`, Quick Converter to `ConversionRegistry`, and currency families to verified `CurrencyRepository` cache/background refresh. See `WIDGET_PRODUCT_SPEC_V4.md` and `WIDGET_SIZE_CAPABILITY_MATRIX.tsv`.

## OCR/Text Analyzer
Bundled on-device ML Kit Latin Text Recognition is used as scanner infrastructure. Import/camera flows retain exact recognized text and feed deterministic text counts. Camera is optional and permission is requested only for camera scanning. Scanned text is not uploaded by this implementation. Automatic language identification is not claimed; the current contract supports language preselection/metadata.

## Multi-window/freeform
Activities are `resizeableActivity=true`, orientation is not locked, state is restored across recreation, and domain/persistence does not depend on window size. No overlay permission/custom floating window exists. OEM-specific floating/freeform behavior requires physical-device/OEM verification and is not claimed by emulator evidence.
