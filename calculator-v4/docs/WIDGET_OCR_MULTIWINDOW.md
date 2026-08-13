# Widgets, OCR and Native Window Foundation

## AppWidget platform
Widget configuration is versioned and persisted independently. Standard widget calculation executes the shared `PlatformEngine` without normal app launch. Currency fixed/interactive widgets use cached verified rates and freshness metadata. Registry widget tools execute through `WidgetInteractionEngine`, using canonical Tool Registry schemas and `PlatformEngine` rather than per-widget formula forks. Structured fields are edited with custom RemoteViews controls; normal post-placement calculation does not require MainActivity. Parabola parameters can be changed in-widget and regenerate graph output. Widget sizes select compact/essential/richer capabilities rather than implying one stretched layout. See `WIDGET_INTERACTION_1_1.md`.

## OCR/Text Analyzer
Bundled on-device ML Kit Latin Text Recognition is used as scanner infrastructure. Import/camera flows retain exact recognized text and feed deterministic text counts. Camera is optional and permission is requested only for camera scanning. Scanned text is not uploaded by this implementation. Automatic language identification is not claimed; the current contract supports language preselection/metadata.

## Multi-window/freeform
Activities are `resizeableActivity=true`, orientation is not locked, state is restored across recreation, and domain/persistence does not depend on window size. No overlay permission/custom floating window exists. OEM-specific floating/freeform behavior requires physical-device/OEM verification and is not claimed by emulator evidence.
