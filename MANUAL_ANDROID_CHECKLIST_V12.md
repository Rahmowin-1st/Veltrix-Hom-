# Manual Android Checklist — Veltrix Hom V12

Run on a physical mid/low-end Android phone after the normal client/server build.

```bash
npm ci && npm run typecheck && npm run test && npm run build
cd server && npm ci && npm run typecheck && npm run test && npm run build
# from project root
npm run cap:sync
```

## 1. Persistent navigation

- [ ] General → Manbalar → Personal → General is instant: no splash, white flash or global skeleton.
- [ ] Type a General draft, select sources, change tabs and return: everything remains.
- [ ] Scroll each primary screen to a different position; switch repeatedly: each position remains.
- [ ] Open chat/project/settings and return: the primary screen underneath is unchanged.
- [ ] First opening of a normal destination does not freeze.
- [ ] Switch tabs at least 50 times: no growing delay, heat spike or duplicated fetches.

## 2. Header

- [ ] Only circular menu, truly centered `Veltrix Hom`, circular logo.
- [ ] No search/plus, separate header card, border strip or heavy shadow.
- [ ] Tap logo: data refreshes without losing draft, source selection or scroll.
- [ ] Double-tap logo quickly: only one refresh runs.

## 3. Composer

- [ ] Exact placeholder: `Vazifani kiriting...`; small and balanced.
- [ ] No permanent gray vertical line.
- [ ] Empty state shows blue/cyan `Yoz` pill and angled pencil.
- [ ] `Yoz` only focuses the field; it never submits an empty request.
- [ ] Typing morphs to the 3D-style vector send plane; microphone slides rather than jumps.
- [ ] `+` opens one inline row: `Rasm · Fayl · Talent`; no page/sheet replacement.
- [ ] Rail closes on outside tap and on Back.
- [ ] Source selector defaults to `Auto`, supports selection/removal, and has `Manba qo‘shish`.
- [ ] Keyboard does not cover or jump the composer.

## 4. Bottom navigation and gestures

- [ ] Active highlight is soft, clear and not bulky.
- [ ] No whole-screen horizontal transition.
- [ ] General left-to-right swipe → Manbalar.
- [ ] General right-to-left swipe → Personal.
- [ ] Vertical scroll, text selection, composer interaction and open keyboard do not trigger tabs.
- [ ] In chat, a deliberate left-edge swipe makes the drawer follow the finger and settle smoothly.

## 5. Sidebar

- [ ] First and repeated open are immediate and cache-first.
- [ ] White background, black text, crisp icons, restrained blue accents.
- [ ] Account row and return-to-chat/home behavior are correct.
- [ ] Talentlar, Tarjima, Kalkulyator, Testlar, Fan o‘yini navigate immediately.
- [ ] Yulduzlangan, Projects and Recent chats are clearly separated.
- [ ] Bottom Search, Settings and New chat stay reachable above the navigation bar.
- [ ] Search returns grouped chats, projects and sources.
- [ ] Long-press a chat: haptic + anchored floating menu.
- [ ] Move/scroll before long-press completes: menu does not open.
- [ ] Ellipsis and long-press expose the same Star, Rename, Project, Delete actions.

## 6. Back and overlays

- [ ] Keyboard open → Back dismisses keyboard only; draft survives.
- [ ] Chat menu/attachment rail/source selector/search/sheet/drawer → Back closes exactly one top layer.
- [ ] Chat/project/detail opened normally → Back returns to actual previous in-app screen.
- [ ] Cold deep-linked detail → Back goes to a semantic app parent, not unexpected exit.
- [ ] Manbalar or Personal → Back goes to General.
- [ ] General → first Back shows exit hint; second within ~2s exits native app.
- [ ] Browser Back/Forward remains healthy in PWA mode.

## 7. Source upload/session race

- [ ] Begin PDF upload, close the flow: upload/polling stops and no later modal state appears.
- [ ] Reopen and start another upload: old promises never overwrite the new flow.
- [ ] Let the access token approach expiry: one transparent refresh/retry occurs.
- [ ] A real auth failure stays in error state and never advances to success/review.
- [ ] Successful source reaches processing/ready and worker health stays clean.

## 8. Answers

- [ ] Fraction/root question renders real fractions and roots, not `\frac`/`\sqrt` text.
- [ ] Final answer card appears once; no `Javob: Javob:`.
- [ ] Invalid/unknown LaTeX remains readable and never blanks the message.

## 9. Performance/accessibility

- [ ] 500-message chat scrolls without visible stutter.
- [ ] Drawer open/close 20 times remains smooth.
- [ ] 360px-wide layout has no clipping or horizontal page overflow.
- [ ] Android “Remove animations” still leaves all actions usable.
- [ ] TalkBack ignores hidden primary tabs and identifies buttons/dialogs correctly.
