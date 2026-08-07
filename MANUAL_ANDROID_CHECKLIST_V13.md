# Manual Android Checklist — V13

Physical mid/low-end Android. Android SDK was unavailable in the build environment, so
`cap:sync` and Gradle were **NOT RUN** here.

```
npm run build && npx cap sync android && npx cap run android
```

## Composer parity (the core V13 change)
- [ ] Open General and open a chat. The composer looks and behaves **identically**:
      same radius, same placeholder `Vazifani kiriting...`, same control row.
- [ ] General shows the source selector reading `Auto` — it previously had none.
- [ ] Empty state shows the wide `Yoz` pill with the **note + pencil** icon; the paper
      corners are rounded and it is crisp, not emoji-like.
- [ ] Type one character → `Yoz` morphs to the round send button and the microphone
      **slides**, without a jump. Same on both surfaces.
- [ ] Attach an image on General, then on chat → same preview treatment.
- [ ] Microphone works on General and records only once (no double recognizer).
- [ ] Send from General still hands off to the chat with the draft and sources intact.

## Sidebar
- [ ] Drawer no longer lists General, Bosh sahifa or Personal.
- [ ] Account row shows the real avatar when set, initials otherwise.
- [ ] The circular control beside the account row returns to General — or to the chat
      when opened from inside one — instantly, with no refresh.
- [ ] Tools rail shows six tiles: Manbalar, Talentlar, Tarjima, Kalkulyator, Testlar,
      Fan o'yini. Each opens its real screen.
- [ ] The rail scrolls horizontally at 360 px width without clipping, smoothly.
- [ ] Tiles look like one family: same size, radius and light direction, different hue.
- [ ] Yulduzlangan / Loyihalar / So'nggi chatlar remain clear, flat, high-contrast.
- [ ] Bottom actions still present: Qidirish · Sozlamalar · Yangi chat.
- [ ] Long-press a chat row → the anchored menu still works exactly as before.

## No regressions
- [ ] Drawer opens instantly from cache; repeated opens do not refetch.
- [ ] Tab switching preserves scroll and drafts (no refresh feeling).
- [ ] Back: keyboard → overlay → detail → peer-tab-to-General → double-press exit.
- [ ] Chat left-edge swipe still opens the drawer.
- [ ] General swipes still switch tabs; the tools rail does not steal them.
- [ ] Upload a source; processing still completes.
- [ ] Math answers still render as real fractions with a single JAVOB card.

## Performance
- [ ] Open/close the drawer 20× — no jank, no heat.
- [ ] Scroll the tools rail repeatedly — smooth.
- [ ] Enable "Remove animations" → tiles keep their depth, lose the press movement.
