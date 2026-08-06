# Known Limitations — V12

Only genuine unresolved items.

1. **Playwright E2E not run — no browser in this environment.** The keep-alive workspace,
   swipe gestures, drawer cache behaviour and scroll restoration are implemented and
   type-checked, and their decision logic is unit-tested where it could be extracted, but
   their *rendered* behaviour was not driven in a browser here. Commands are in
   `TEST_REPORT_V12.md`.

2. **Android build not run — no SDK installed.** `npm run cap:sync` and the Gradle build
   were not executed. Everything Android-specific (hardware Back, keyboard inset, gesture
   feel) needs `MANUAL_ANDROID_CHECKLIST_V12.md` on a real device.

3. **No live model call.** Answer normalization is proven by unit tests over
   representative and malformed inputs, but no real Gemini response was rendered here, so
   the *frequency* of malformed output in production is unmeasured. Both repair layers are
   in place regardless.

4. **Detail screens are not kept alive by design.** Returning to a previously open chat
   re-mounts its component tree; its data comes from cache, so it is fast, but component-
   local UI state (an expanded block, for example) resets. Keeping every visited chat's
   DOM alive would leak memory on exactly the low-end devices this release targets — the
   trade was made deliberately, not overlooked.

5. **Scroll restoration depends on `[data-scroll-root]`.** A primary screen that scrolls
   on some other element will restore to the top. All three current primary screens use
   the marker; a new screen must adopt it.

6. **The bare-LaTeX rescue is intentionally narrow.** Only well-known commands
   (`\frac`, `\sqrt`, `\sum`, `\int`, Greek letters, common operators) are rescued.
   Exotic macros still render as text. Widening the list would risk converting ordinary
   prose or file paths into math, which is a worse failure than under-rendering.

7. **Long-press chat menu uses the existing `ChatMenu` component.** It is anchored and
   functional, but was not re-designed into a new floating-card variant in this release.

8. **`--brand-2` fallback.** New gradients reference `var(--brand-2, var(--brand))`. If the
   token is absent the gradient degrades to a flat brand colour — correct, but flatter than
   intended.
