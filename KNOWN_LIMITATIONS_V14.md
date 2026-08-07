# Known Limitations — V14

1. **No browser or device verification.** Playwright and Android (`cap:sync`/Gradle) were
   **NOT RUN** — no browser, no SDK. The curtains, bubble tone and open assistant layout
   compile and build but have not been seen rendered. Use `MANUAL_ANDROID_CHECKLIST_V14.md`.

2. **Curtain heights are chosen, not measured.** Top is `safe-top + 92px`, bottom is
   `safe-bottom + 150px`. These suit the current composer height; if the composer grows
   substantially (a long multi-line draft plus attachment plus the action rail), the
   bottom curtain may not fully cover it. It degrades gracefully — the content simply
   scrolls against the page colour — but the value may want tuning on a device.

3. **Chat has no in-app back control by design.** Per §16 no replacement arrow was added.
   On desktop browsers users rely on the browser Back button; on Android, system Back.
   There is no visible affordance in the chat itself, which is intentional but is a
   behaviour change worth watching in feedback.

4. **The chat header's other actions went with it.** The old header also held "new chat"
   and "menu" buttons. Both remain reachable — menu via the left-edge swipe and the
   drawer, new chat via the drawer's bottom actions — but they are no longer one tap away
   from inside a chat.

5. **`.v5-chat-header` still exists** for Calculator, QuizPlay and Game. Those screens
   keep their own back arrows; §2 scoped the removal to the chat screen only.

6. **Subject/topic metadata is no longer displayed.** `turn.subject` and `turn.topic` are
   still stored and returned by the server; only their chips were removed as identity
   labels. Re-surfacing them later needs no backend change.

7. **Dark-theme curtain and bubble were reasoned, not seen.** Both use theme tokens and a
   dark-specific bubble rule is defined, but dark mode was not visually verified here.
