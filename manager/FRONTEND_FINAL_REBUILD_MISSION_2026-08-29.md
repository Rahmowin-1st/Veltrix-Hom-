# VELTRIX HOM — FINAL FRONTEND REBUILD / CLOSURE

Status: MANAGER-ROUTED FRONTEND MISSION
Date: 2026-08-29
Role owner: Frontend Agent
Manager owner: product/acceptance only

## Canonical backend baseline
- Repo: Rahmowin-1st/Veltrix-Hom-
- Accepted backend SHA: `0458e1b96bdf03b2c607280d392946780fd083af`
- Accepted tree: `e42a3cc827d46317bc8585f3f60ed8063aacc1e3`
- Backend closure run: `33182820983` SUCCESS
- Security run: `33182820945`
- Tests: `204/204 PASS`
- Migrations: `100→132 PASS`
- Backend artifact: `backend-part5-final-0458e1b96bdf03b2c607280d392946780fd083af`
- Artifact SHA-256: `75b6736a1569f67bba48823dae8dbac162a42b208ce0d1ce43e623c47d22daaf`
- Source archive SHA-256: `54c5fc04ef73cc413e9048f84365964062a474d855ced2c898be5e75cad9f185`

BACKEND IS FROZEN. Frontend must not rewrite backend-owned truth.

## Authority order for this mission
1. Founder latest mission / current Product Freeze.
2. `VELTRIX_HOM_BACKEND_PRODUCT_FREEZE_MASTER_2026-08-25.md`.
3. Current accepted backend source/contracts at exact accepted SHA.
4. `Veltrix_Frontend_Master_Guidance_Knowledge_2026-08-15.md` for frontend design/interaction/Android doctrine.
5. `Old_Front_end.txt` and old frontend branches only for reusable implementation learning/DNA.
6. Older vNext frontend missions only where they do not conflict with current Product Freeze.

Do NOT restore XP, Coins, Map, Store, Seasons, game account, old Chat naming, Settings as fifth tab, rejected templates, old vNext navigation, automatic AI Conversation tags, multilingual V1 UI, or old offline product semantics.

## Manager restore findings before implementation
- Current accepted backend `main`/baseline does not expose a normal Android Gradle/Compose module in the canonical tree.
- Historical frontend branches exist (including `agent/v20-final-android-build*` and `agent/v22-full-design-release-20260809`) but are historical only.
- Historical v22 branch contains Android release workflow and packed historical material, but it is not current product authority and must not be transplanted wholesale.
- Therefore treat old frontend implementation as optional reusable infrastructure/components after explicit audit, not as the new baseline product model.

## Required first operation
Before edits, inspect repo + historical frontend branches/artifacts and classify frontend code:
- A KEEP
- B ADAPT
- C REMOVE
- D REBUILD

At minimum audit Android project/build foundation, Compose/design system, navigation, auth/onboarding, API/client contracts, state holders, lifecycle/back/insets, tests, CI/emulator path, and obsolete vNext/game UI.

## Frozen product destinations
Primary navigation semantics are exactly:
1. Home
2. Projects
3. Studio
4. Library
5. More

Other major systems: Conversations, Fast Ask, Notebooks, Explore Tools, Goals, Todos, Notes, Global Search, Memory Manager/personalization, Notifications, Account/Auth/Onboarding, Trash & Recovery.

## Product mental models
- Project = largest work workspace.
- Notebook = research + learning knowledge base + researcher.
- Conversation = persistent AI workspace.
- Fast Ask = one quick question → one answer → no history unless converted.
- Library = durable persistent knowledge/asset storage.
- Studio = primary AI artifact generation world.
- Goal = outcome.
- Todo = action.
- Note = rich structured knowledge/document.
- Reference = persistent grounding source/context.

## Current hard product constraints
- UI language: English only.
- Online-only product; no user-facing offline mode.
- Library quota: 1 GB/user; warning at 900 MB.
- Project references: max 20; max 50 MB total.
- Conversation permanent reference: max 1; max 20 MB.
- Conversation message attachments: max 5; max 10 MB total.
- Fast Ask attachments: max 5; max 10 MB total.
- Studio custom attachments: max 5; max 20 MB total.
- Conversation → Project: 0..1.
- Conversation → Notebooks: unlimited.
- Trash retention: 30 days.
- V1 sharing: private only.

## Frontend doctrine
- Android-native Kotlin + Jetpack Compose.
- Android graphics/shaders only where justified.
- Apple/HIG/Liquid Glass = observable reference, never implementation authority/copy.
- Hierarchy before effects; content clarity first.
- Motion explains state; resting UI calm, interaction alive.
- Direct manipulation, coherent geometry, interruptible transitions.
- Accessibility from base component contract.
- Android 16 edge-to-edge + predictive back are release-critical.
- Real-device perception outranks screenshot/CI claims.
- Performance outranks decorative complexity.
- Liquid Glass only where interaction/navigation value is real; no glass-on-glass/card soup.

## Execution order and real progress gates
10% restore + frontend delta + design system/navigation foundation
20% auth/onboarding + global shell
30% Home + Projects
40% Conversation + Fast Ask
50% Notebook + Research
60% Studio
70% Library + Search
80% Goals/Todos/Notes + Memory + Notifications + More
90% integration/A11Y/PF/error/network/predictive-back polish
100% exact-source final evidence + APK + Manager handoff

Activity/code count does not move progress; executed evidence does.

## Required evidence at final candidate
- exact repo/branch/SHA
- accepted backend SHA ancestry
- CI run/job
- compile/build
- unit/UI/backend-integration tests
- screenshots of all major worlds and representative loading/empty/error/network states
- motion recordings for key interactions
- A11Y evidence
- performance evidence
- APK (+ test APK if applicable)
- artifact ID/name/hash
- APK SHA-256
- source archive/hash
- exact limitations
- Manager handoff

No screenshot-only motion proof. No CI-only visual proof. Emulator is not automatically real-device touch/PF proof.

## Failure policy
RED → evidence → classify → root cause → narrow fix → affected retest → continue. Preserve unaffected GREEN. Do not rerun unchanged RED. If backend contract is genuinely defective, do not patch backend silently; return exact evidence to Manager.

## Return condition
Return to Manager only when:
A) complete frontend Manager-acceptance candidate; or
B) all frontend-owned work is complete and only a truly external final proof boundary remains.

Do NOT start Check Engine.

Final line may be `FRONTEND_FINAL_ACCEPTANCE_CANDIDATE = YES` only if no known frontend-owned P0/P1 remains and exact evidence is complete.
