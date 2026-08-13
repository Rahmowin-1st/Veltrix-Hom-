# Known Limitations

- Higher-degree polynomial roots are numerical; result precision/type is exposed rather than pretending symbolic closed forms.
- Symbolic calculus is limited to the deterministic legacy engine's supported grammar; unsupported expressions fail.
- Triangle SSA may produce two valid solutions; ambiguity is explicitly returned.
- Chemistry supports numeric tools and a versioned atomic-mass table; it is not a reaction-chemistry engine. Stoichiometry is deterministic coefficient/mole-ratio math, not reaction balancing.
- OCR uses bundled Latin-script text recognition in the current foundation. Automatic language identification is not claimed.
- Frankfurter publishes reference exchange-rate data; this architecture maximizes practical client refresh but does not imply tick-by-tick trading/market pricing. A future credentialed intraday provider requires a secure server gateway; no provider secret is embedded in the APK.
- Android AppWidgets are constrained by RemoteViews/AppWidget platform capabilities. Iteration 1.1 supports structured custom-control editing for registry micro-tools, but does not claim gesture-heavy graph pan/pinch or a system keyboard inside the widget.
- Emulator verification cannot prove all OEM floating-window behavior. No custom overlay is used.
- Temporary functional UI is intentionally not final design.
