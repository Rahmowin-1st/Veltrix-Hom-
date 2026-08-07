# Known Limitations — V15

1. **The canonical chat background asset was not supplied.** No image exists in the V14
   repo and none was attached. §1 forbids reinterpreting or regenerating it and §33
   forbids fabricating assets, so the existing background is unchanged. To apply it: add
   the exact file to `public/` and reference it as a fixed background layer; the curtains
   already read from `--chat-curtain` and will blend once that token matches the image's
   top and bottom tones.

2. **No canonical screenshot was available either.** The top-control composition follows
   the written description (circular menu left, edit + overflow pill right, no header).
   Pixel-matching a reference image was not possible.

3. **Like/Dislike is session state.** No message-feedback table exists, and §30 forbids
   inventing a migration. Votes are per-message, exclusive and retractable, but do not
   survive a reload. Persisting them needs a small backend addition.

4. **Retry re-runs the request but cannot guarantee a different answer.** It replays the
   original inputs with a new request id; whether the model returns something better is
   the model's behaviour, not the client's.

5. **Retry snapshots are in-memory.** A regenerate is available for answers produced in
   the current session. Messages loaded from history have no snapshot, so their Retry
   button is hidden rather than shown doing something weaker — deliberate, per §33.

6. **Uploaded files come from message attachments only.** Files ingested through the
   source pipeline live under Manbalar and are intentionally not duplicated here.

7. **No browser or device verification.** Playwright and Android builds were **NOT RUN**
   (no browser, no SDK). The drag decisions are unit-tested; the rendered feel of the
   floating composer, the measured spacer and 60fps dragging need a device.

8. **Spacer depends on `ResizeObserver`.** Universally available in target browsers; on a
   hypothetical engine without it the spacer stays at its 96px default, which still
   clears the composer in its normal state.
