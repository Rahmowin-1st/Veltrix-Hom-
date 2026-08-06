# Manual Android Checklist — V12

Run on a **physical mid/low-end Android device**. Emulator results must be labelled
emulator. Android SDK was not available in the build environment, so
`npm run cap:sync` and the Gradle build were **not** run here.

```
npm run build && npx cap sync android && npx cap run android
```

## Navigation and state (the core V12 change)
- [ ] General → Manbalar → Personal → General: each switch is instant, with **no**
      skeleton, white flash or splash replay.
- [ ] Scroll Manbalar halfway down, go to Personal, come back → **the same scroll
      position**, not the top of the list.
- [ ] Type a draft in the General composer, switch tabs, return → the draft is still there.
- [ ] Select a source, switch tabs, return → the selection is still applied.
- [ ] Open a chat, go back → the tab underneath is exactly as it was.
- [ ] First tap into any destination does not freeze or stall.

## Header
- [ ] Only three things: circular menu, centred `Veltrix Hom`, circular logo.
- [ ] The title is centred on the **screen**, not merely between the two buttons.
- [ ] No search or plus button; no separate panel, border or heavy shadow.
- [ ] Tap the logo → it spins briefly, data refreshes, and an unsent draft plus selected
      sources **survive**. Double-tap quickly → only one refresh runs.

## Composer
- [ ] Placeholder reads exactly `Vazifani kiriting...` and is comfortably sized.
- [ ] **No gray vertical line** anywhere near the text area.
- [ ] Empty state shows the wide `Yoz` pill with a pencil angled to the lower-left.
- [ ] Tapping `Yoz` focuses the field and opens the keyboard — it never sends.
- [ ] Typing morphs `Yoz` into the round send button, and the microphone **slides**
      across rather than jumping.
- [ ] Plus opens an inline rail with exactly `Rasm · Fayl · Talent` **on one row** at
      360 px width. It closes on outside tap, Back and after a selection.
- [ ] Source selector reads `Auto` by default; selecting a source shows a chip.
- [ ] With the keyboard open the composer stays visible and does not jump.

## Bottom nav and gestures
- [ ] Tab changes are smooth with no whole-screen slide.
- [ ] On **General only**: swipe left-to-right → Manbalar; right-to-left → Personal.
- [ ] Swiping while scrolling a list vertically does **not** change tabs.
- [ ] Swiping with the keyboard open does **not** change tabs.
- [ ] Inside a chat, a swipe from the left edge opens the sidebar.

## Sidebar
- [ ] Opens **instantly** from cache; opening it repeatedly does not re-load the chat list.
- [ ] White panel, near-black text, crisp icons, no washed-out blue-gray.
- [ ] Account row at top with name/grade → tapping goes to settings.
- [ ] Quick tools rail: Talentlar, Tarjima, Kalkulyator, Testlar, Fan o'yini — each
      navigates immediately.
- [ ] `Yulduzlangan`, Projects and Recent chats are all clearly separated.
- [ ] Long-press a chat row → anchored menu appears; scrolling cancels the long press.

## Answers
- [ ] Ask a fraction/root question → it renders as **real** fractions and roots, with no
      visible `\frac` or `\sqrt`.
- [ ] The final answer card appears **once**, with no `Javob: Javob:` duplication.

## Back button
- [ ] With the keyboard open, Back closes **the keyboard only** — the draft survives.
- [ ] With an overlay open, Back closes exactly one overlay per press.
- [ ] From a chat, Back returns to the screen it was opened from.
- [ ] From Manbalar or Personal, Back returns to General.
- [ ] On General, first Back shows `Chiqish uchun yana bir marta bosing`; a second press
      within ~2 s exits.
- [ ] Open and close overlays ~50 times, then press Back repeatedly → history unwinds
      sanely with no stuck or skipped entries.

## Performance
- [ ] Scroll a 500-message chat: no stutter; the device does not get hot.
- [ ] Open/close the sidebar 20 times: stays smooth.
- [ ] Enable Android "Remove animations" → motion level drops; the app is still fully
      usable and keeps its visual identity.
