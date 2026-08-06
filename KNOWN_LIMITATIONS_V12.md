# Known Limitations — V12

Only genuine unresolved or environment-dependent items are listed.

1. **Fresh official npm/typecheck/test/build gates were blocked in this sandbox.** The forced internal npm mirror is missing public tarballs and public npm DNS is unavailable. Static TypeScript parsing, relative and alias import resolution, 14 executable deterministic logic checks, 30 architecture/security/migration assertions, JSON/CSS validation, migration synchronization, secret scanning and clean ZIP validation were executed instead. Run the commands in `TEST_REPORT_V12.md` in GitHub/Render CI.

2. **Physical Android validation is still required.** Hardware Back, keyboard inset behavior, edge-gesture feel, haptics and frame pacing must be checked on a real mid/low-end Android device.

3. **Detail screens are bounded by design.** Primary tabs stay alive, but every visited chat/project DOM is not kept forever. Server data remains cached; very local detail-only UI state may reset when a detail component is remounted. This avoids an unbounded memory leak.

4. **Math rescue is intentionally conservative.** Common classroom LaTeX is rescued. Unknown/exotic macros remain literal text rather than risking corruption of ordinary prose or file paths.

5. **No live model call was performed.** Both normalization layers are present and deterministic examples pass, but production answer-shape frequency depends on the live model.
