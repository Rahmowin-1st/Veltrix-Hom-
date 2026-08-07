# Manual Android Checklist — V15

Physical device. Android SDK unavailable in the build environment, so `cap:sync`/Gradle
were **NOT RUN**.
```
npm run build && npx cap sync android && npx cap run android
```

## CHAT
- [ ] Background is the pale blue/white gradient — unchanged from V14, no new glow.
- [ ] Top-left: small circular menu button opens the drawer.
- [ ] Top-right: one compact pill with new-chat + three-dot, split by a hairline.
- [ ] Controls read as floating islands — **no** header bar, no full-width panel, no blur.
- [ ] Messages scroll fully behind the top controls and the fade.
- [ ] Three-dot menu shows: Yulduzlash/Yulduzdan olish, Nomini o'zgartirish,
      Loyihaga qo'shish/Loyihadan chiqarish, Yuklangan fayllar, Chatdan qidirish, O'chirish.
- [ ] **No Share. No Add-to-home. No Archive.**
- [ ] Pin → the chat appears under Yulduzlangan in the drawer immediately, no reload.
- [ ] Add to project → real project list; assignment reflects immediately.
- [ ] Uploaded files → shows files actually sent in this chat; empty state if none;
      tapping an image/file downloads it.
- [ ] Find in chat → type ≥2 chars, counter shows n/total, up/down navigate and wrap,
      the matched message flashes, X closes cleanly.
- [ ] Delete → red, confirms, returns home, chat gone from the sidebar, no ghost route.

## COMPOSER
- [ ] Composer visibly floats; earlier messages remain faintly visible behind the fade
      beneath it (not covered by a solid panel).
- [ ] Scroll to the bottom: the **final** AI message — including its action row — sits
      fully above the composer, never underneath.
- [ ] Type a long multi-line draft: the composer grows and the last message still clears it.
- [ ] Attach a file: same, spacer adapts.
- [ ] Open/close the keyboard: no jump, composer stays anchored.
- [ ] Source selector, plus menu, mic, Yoz→Send morph all behave as in V14.

## MESSAGE ACTIONS
- [ ] Every AI message has: copy, like, dislike, voice, retry.
- [ ] Copy pastes only that AI answer — no prompt, no UI text, no neighbouring message.
- [ ] Like then dislike → only one active. Tap the active one → clears.
- [ ] Voice reads that message; starting voice on a second message stops the first cleanly
      (no overlapping speech).
- [ ] Ask a question **with a source and a Talent selected**, then change the source
      selector, then hit Retry → the answer regenerates using the ORIGINAL source/Talent.
- [ ] Retry replaces the old answer in place — **no second answer appears below**.
- [ ] During retry the old answer dims; on failure it is restored, not deleted.
- [ ] No duplicate user message is created by a retry.

## DRAWER
- [ ] Slow drag from the left edge: the drawer tracks the finger 1:1, no lag, no jump.
- [ ] Release at ~20% → snaps closed. Release at ~70% → snaps open.
- [ ] Fast flick from the edge → opens even though the finger barely moved.
- [ ] Drag the open drawer left → it follows; fast flick left → closes.
- [ ] Release an open drawer near the middle → it stays open (hysteresis), no flicker.
- [ ] Scroll the chat vertically starting near the left edge → the drawer does **not**
      open and scrolling is not stolen.
- [ ] Start a drag then put a second finger down → gesture aborts cleanly, drawer not stuck.
- [ ] Repeat 20 rapid open/close drags → no stuck half-open state, no jank.
- [ ] Android Back with drawer open → closes drawer only.
- [ ] Android Back with search open → closes search only.
- [ ] Android Back with menu open → closes menu only.
- [ ] Android Back with keyboard open → closes keyboard only.

## PERFORMANCE
- [ ] 500-message chat scrolls smoothly; no jank at the top or bottom fades.
- [ ] Repeated drawer drags stay smooth; device does not heat up.
- [ ] No decorative blur anywhere in the app.

## RESPONSIVE
- [ ] 360×800, 390×844, 412×915, 430×932, tablet, desktop: top controls clear the status
      bar, menu stays on-screen, action row fits, composer never covers the last message,
      no horizontal overflow.
