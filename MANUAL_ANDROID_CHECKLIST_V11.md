# Manual Android Checklist — V11

Run on a **physical low-end Android device**. Emulator results must be labelled emulator.
```
npm run build && npx cap sync android && npx cap run android
```

## Startup and isolation
- [ ] Cold start: neutral splash → shell, with **no flash** of a previous account's data.
- [ ] Sign out, sign into a second account → no chats, sources, drafts or cached pages from
      the first account appear anywhere.
- [ ] Sign back in → the first account's data returns from the cloud intact.

## Motion (new in V11)
- [ ] Enable Android "Remove animations" → the app runs at motion level `off`: Framer
      transitions no longer animate (elements appear at their final state), background
      stickers stay static and visible, identity unchanged.
- [ ] On a genuinely slow device, confirm it settles into `reduced` on its own and does
      **not** oscillate between levels.
- [ ] Scroll a 500-message chat: no stutter, device does not heat up.

## Upload
- [ ] Upload a >10 MB PDF on mobile data: real progress, app stays responsive.
- [ ] Kill Wi-Fi mid-upload, reconnect → the upload **resumes** from where it stopped.
- [ ] Log out mid-upload → transfer aborts; no orphan source on next login.
- [ ] Start an upload and force-quit before it finishes; later trigger cleanup → the stale
      reservation is gone and the same file can be uploaded again.

## Durability
- [ ] Force-kill the app while a book is indexing; reopen → progress resumes from its
      checkpoint, not from 0%.
- [ ] Send a message, immediately force-kill, reopen → the answer is present exactly once.
- [ ] If a job shows quota-paused, confirm it resumes by itself and via manual Resume.

## Scanned book correctness
- [ ] Upload a scanned textbook with front matter. Ask for a specific **printed** page →
      the returned content is that printed page, not the same-numbered PDF page.
- [ ] Ask for a specific exercise on that page → the correct exercise is solved.
- [ ] Where the automatic mapping is wrong, use the page-correction action → subsequent
      lookups in that region are correct (the segments were rebuilt).
- [ ] While OCR coverage is partial, the app **says so** rather than implying completeness.
- [ ] For a book with a contents page, confirm topic questions route to the right area.

## Navigation
- [ ] Hardware Back closes the top sheet/drawer first — one press, one overlay.
- [ ] Back from a subscreen moves exactly one step (never two).
- [ ] At General: first Back shows "Chiqish uchun qayta bosing", second within ~2s exits.
- [ ] Open/close overlays ~20 times, then press Back repeatedly → history unwinds sanely.
- [ ] Sending a message does not add a history entry.

## Keyboard
- [ ] Focus the composer → it stays visible above the keyboard; one scroll root only.
- [ ] Long multi-line message → composer grows, chat stays readable.
- [ ] Repeat in landscape; rotate with the keyboard open.
