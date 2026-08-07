# Manual Android Checklist — V14

Physical device. Android SDK was unavailable here, so `cap:sync`/Gradle were **NOT RUN**.
```
npm run build && npx cap sync android && npx cap run android
```

## Chat chrome
- [ ] No white header bar, no back arrow, no rounded header container.
- [ ] No empty gap where the header used to be — the first message sits naturally.
- [ ] Tapping where the back arrow used to be does nothing (no invisible hitbox).
- [ ] Scrolling up, content passes **under** a soft fade at the top with no visible edge
      or seam, and stays readable near the status bar.
- [ ] The top fade never blocks a tap or a scroll.

## Composer area
- [ ] No large white panel behind the composer.
- [ ] The composer floats with visible breathing room below it, clear of the Android
      gesture bar.
- [ ] A gentle fade sits beneath/behind it — not a bottom sheet, no hard edge.
- [ ] Opening the keyboard does not make the composer jump.
- [ ] `Matematika ▼` selector still works: change source, Auto state, persistence.
- [ ] No duplicate source chip anywhere above the composer.
- [ ] Plus menu, microphone, `Yoz` → send morph and NoteWriteIcon all unchanged.

## Messages
- [ ] Assistant answers sit directly on the page — **no giant rounded bubble**.
- [ ] No assistant avatar, no Veltrix logo beside answers, no `Ta'lim` chip.
- [ ] Warning / answer / formula / table / code blocks still have their own cards.
- [ ] No card-inside-card anywhere.
- [ ] User bubble is a soft white→light-blue tone with **dark text**, clearly distinct
      from the page but not saturated. Readable in daylight.
- [ ] No user `S` avatar.
- [ ] Copy and read-aloud appear as small icons below the answer and both still work.
- [ ] Math renders as real fractions; a single JAVOB card.

## Scroll control
- [ ] Scroll up in a long chat → a small circular down-arrow appears above the composer.
- [ ] No `Oxirgi xabar` text, no pill, no chip beside it.
- [ ] Tapping it jumps to the newest message; it hides when already at the bottom.
- [ ] It never overlaps the composer, with or without the keyboard open.

## Navigation and gestures
- [ ] System Back from a chat returns to the previous screen — exactly one step.
- [ ] Back with the keyboard open closes only the keyboard.
- [ ] Left-edge swipe inside a chat still opens the drawer.
- [ ] Vertical scrolling and text selection are not stolen by the edge gesture.

## App-wide (blur removal)
- [ ] Drawer, bottom nav, headers, search field, talent cards, calculator: all render
      with solid surfaces — no frosted glass — and nothing looks transparent or broken.
- [ ] Scrolling anywhere is smoother than V13; no jank when the drawer opens.
- [ ] Dark theme: curtains blend into the dark page, user bubble and assistant text are
      both readable, no white-only artifacts.
