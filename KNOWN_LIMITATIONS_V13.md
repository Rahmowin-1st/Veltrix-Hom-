# Known Limitations — V13

1. **No browser or device verification.** Playwright (no browser) and Android
   (`cap:sync` / Gradle, no SDK) were **NOT RUN**. The composer swap, sidebar rebuild and
   3D tiles type-check and build cleanly, but their rendered appearance and the feel of
   the rail's horizontal scroll have not been observed here. Use
   `MANUAL_ANDROID_CHECKLIST_V13.md`.

2. **3D is CSS, not rendered art.** Depth comes from one gradient plus three box-shadows.
   This was chosen over raster/3D assets deliberately — it costs no bundle weight and no
   frame time. It reads as premium and consistent, but it is not the same as
   individually illustrated 3D artwork; if that is wanted later it should be authored as
   SVG with the same light direction to stay in family.

3. **Selective 3D is a judgement call.** Six tool tiles and two primary composer actions
   received depth; everything else stayed flat. Widening it further would make the UI
   noisy, which §10 explicitly warns against — but the exact boundary is a design opinion
   and can be adjusted per element.

4. **General's greeting and rotating prompt are unchanged.** Only the composer was
   unified; the hero's greeting animation above it is V12 code, untouched.

5. **Long-press chat menu untouched.** It was already anchored and working, so per §9 it
   was left exactly as-is rather than regressed by a rewrite.

6. **Tone colours are new tokens local to the rail.** They are defined inline as CSS
   custom properties on `.v12-tool` rather than added to the global token file, to avoid
   touching shared design tokens other surfaces depend on.
