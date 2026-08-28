# VELTRIX HOM BACKEND PART 3 — STAGE90 OFFLINE CONTINUATION

Date: 2026-08-26
Status: CONTINUATION — NOT HANDOFF
Manager verdict at checkpoint: PARTIAL / STAGE90 NOT ACCEPTED
Progress: 🟢🟢🟢🟢🟢🟢🟢🟢🔴🔴 80%

This file is a durable continuation source of truth. It records work completed while the dedicated Backend Windows/Antigravity implementation workspace was offline. It does not claim Stage90 or Part3 acceptance.

## 1. Authority

Authority order for this checkpoint:
1. Founder latest mission: continue Backend Part3 only; KEEP Stage10–80; maximize all non-laptop work; do not start Part4; Stage90 requires adversarial QA/reliability/security/performance and permanent fail-closed CI.
2. Manager-accepted Part1 and Part2 SHAs below.
3. Exact GitHub Stage80 implementation and strict CI evidence.
4. `03_VELTRIX_HOM_BACKEND_PART3_CONVERSATIONS_FASTASK_TOOLS.md` / Product Freeze where applicable.
5. This checkpoint records Stage90 delta/audit only; it does not supersede accepted product contracts.

Hard rule: no Stage90 GREEN without executed evidence on one exact Stage90 implementation SHA.

## 2. Accepted Part1 SHA

`72e34dc1d2e23131bd8e505f7ed53ede15ab464c`

Part1 is ACCEPTED and must not be redone.

## 3. Accepted Part2 SHA

`8553ea370dc9a4813ae4e3bbcf9b241ebd435f80`

Part2 is ACCEPTED and must remain an ancestor of final Part3.

## 4. Verified Stage80 SHA

Canonical Stage80 implementation SHA:

`fc25b2312f4aca599b8e6e57732fede2992de2b2`

Verified strict Stage80 CI:
- Run: `32919133807`
- Job: `98029009748`
- Verdict: SUCCESS
- Full tests: 163/163 PASS
- Test files: 25/25 PASS
- Stage70 unit/API: 7/7 PASS
- Stage80 unit/API: 10/10 PASS
- Typecheck: PASS
- Build: PASS
- PostgreSQL migrations: through 121 PASS
- Production dependency high/critical audit gate: PASS; two known moderate transitive uuid findings remain non-blocking for this gate.
- Artifact ID: `9589238240`
- Artifact SHA-256: `88c739c78c12f6c7b241fe0b09cfe0d5e58294bfd8004b75093763930c632ae3`

Stage80 false-green issue is closed. The strict workflow shell is fail-closed with `bash --noprofile --norc -e -o pipefail`.

## 5. Current Stage90 branch + HEAD

Branch: `veltrix-hom-backend-part3-stage90-work`

Stage90 implementation base/code HEAD before this documentation-only checkpoint commit:

`fc25b2312f4aca599b8e6e57732fede2992de2b2`

The checkpoint commit itself changes documentation only and therefore becomes the branch Git HEAD after write. It is not a new accepted implementation SHA. The exact documentation commit SHA must be read from GitHub and recorded in the Manager report. Backend implementation must preserve `fc25b231...` as the Stage80 code base and build Stage90 changes as descendants of the documentation checkpoint without rewriting accepted history.

Canonical branch `veltrix-hom-backend-part3-conversations-fastask-tools` was safely fast-forwarded from Stage70 `f0e9eec4a772efe6524c21b9f0cac0226670079d` to exact Stage80 `fc25b231...` after GitHub compare proved ahead=8, behind=0, merge-base=Stage70.

## 6. Everything completed while laptop was offline

### Repository/provenance
- Verified Stage90 work branch existed at exact Stage80 base.
- Inspected permanent Stage80 fail-closed CI and exact test/evidence packaging design.
- Inspected Stage70/Stage80 real PostgreSQL evidence scripts and source contracts instead of trusting only summary claims.
- Verified connected Supabase project is healthy but production currently contains 0 of the 13 Part3 tables. No production mutation/deploy was performed because Part3 promotion remains deferred.

### Fast Ask / conversion audit
Existing executed Stage70/80 evidence already proves:
- concurrent conversion serializes to one Conversation;
- repeated DB conversion reuses the same Conversation identity;
- failed/incomplete conversion is rejected;
- cross-owner conversion is rejected;
- attachment asset identities are copied to the converted user message;
- no Project is invented (`project_id = null`);
- no Notebook or permanent Reference is invented;
- cleanup of an expired ephemeral Fast Ask does not delete the Library asset.

New static defect discovery:
- HTTP replay result shape mismatch: `fastAskConversionResponseSchema` requires `title`, but the `CONVERTED` replay branch of `vh_convert_fast_ask_to_conversation` does not return `title`. Direct DB replay can be GREEN while second HTTP Switch fails response parsing.
- COMPLETED-but-unconverted expiry is likely broken: terminal guard permits `COMPLETED -> CONVERTED` only, while expiry RPC attempts to set expired non-converted sessions to `EXPIRED`. Existing Stage70 expiry evidence used a STREAMING session and did not cover the required COMPLETED case.

### Streaming audit
Existing executed PostgreSQL evidence already proves:
- duplicate concurrent turn/idempotency -> one USER + one ASSISTANT + one request identity;
- monotonic event sequence;
- reconnect/resume after sequence (`after seq 2`) returns remaining events;
- incomplete/disconnected state preserves partial events but stores no final blocks;
- cancel is persisted, terminal, and idempotent;
- provider failure state is persisted exactly once;
- owner isolation;
- service-role-only mutation RPCs;
- completed terminal message cannot be mutated.

Existing unit evidence also proves an aborted typed stream does not finalize and empty provider output fails closed.

Remaining explicit Stage90 streaming cases are listed in section 8.

### Typed block security audit
Verified in current schemas/tests:
- unknown type and unsupported version are preserved only as inert `executable:false` data;
- unknown JSON depth capped at 16;
- unknown array length capped at 1000;
- unknown object keys capped at 500;
- unknown JSON node count capped at 5000;
- unknown JSON character budget capped at 250000;
- final known blocks capped at 100 and serialized stored payload capped at 1,000,000 bytes;
- Writing uses strict typed JSON; raw HTML fields are rejected;
- links permit http/https only; javascript URLs are rejected;
- Map duplicate/dangling identities and oversized graphs are rejected;
- interactive quiz requires exactly one correct option per question;
- malformed/current-version known blocks fail closed;
- generated Code/Function contents are stored as typed data; Part3 architecture installs no backend generated-code execution adapter.

### Explore tools / ToolRun audit
Existing executed PostgreSQL evidence already proves:
- ToolRun idempotency identity;
- duplicate provider authority blocked;
- lease reclaim creates a new claim token;
- stale claim cannot complete;
- terminal output immutability;
- calculator persisted deterministically without AI route;
- Solve owner-validated Library grounding, processing-source rejection, cross-owner asset rejection, original asset identity and input hash provenance;
- HELP_ME_SOLVE persisted output has no `finalAnswer` field;
- Summarize creates no Conversation and preserves source provenance;
- tool/provider failure persists and cannot later fake success;
- `vh_tool_runs` direct client access is service-role-only.

New static gaps/defects discovered:
- HELP_ME_SOLVE text leakage detector covers several patterns but is not strong enough to guarantee the requested broader direct-answer wording rejection (for example alternative wording equivalent to `x equals 4` / `4 is the solution`).
- AI tool `generate()` paths have no deterministic internal timeout and Translate/Solve/Summarize do not pass an AbortSignal/timeout.
- default fast and fallback model routes use the same `google-gemini` provider ID. `generate()` can accumulate three retryable failures on the first route and open the provider-level circuit before the fallback model route is considered, causing fallback to be skipped.
- Translate/Solve/Summarize apply rate limiting before ToolRun idempotency replay. A safe retry of a completed idempotent request may therefore be rejected by rate limiting before the stored result can replay. Stage90 must define and prove the intended compatibility.

### History/search audit
Existing executed Stage60/80 evidence already proves:
- active history excludes archive;
- archive normalizes pin state and restore preserves relationships;
- manual USER title cannot be overwritten by AUTO title;
- tag ownership/default-tag protections;
- exact message locator;
- exact AI block locator;
- cross-user search isolation;
- archived search requires explicit opt-in;
- deterministic sort tie-breakers exist.

New gap:
- HTTP/database history and search expose only a bounded `limit`; there is no cursor/after/before page contract. Therefore Stage90 `pagination stability` is not yet provable as a real multi-page contract.

### Security audit
Static architecture verifies:
- 11 Part3 foundation tables in migration 115 have RLS enabled, all client table privileges revoked, and service-role DML only;
- migration 118 adds `vh_conversation_proposal_confirmations` with RLS/client revoke/service role;
- migration 119 adds `vh_conversation_default_tag_catalog` with RLS/client revoke/service role;
- total Part3 table surface audited statically: 13 tables;
- owner-coherent composite foreign keys protect Conversation/Notebook/Message/Attachment/Tag relationships;
- Part3 mutation RPCs inspected use `SECURITY DEFINER` with fixed `search_path=public,pg_temp` and explicit account/owner filtering;
- input schemas and DB functions contain bounded lengths/counts in core Part3 surfaces;
- generated/provider content is parsed through strict schemas and prompts label source/input as untrusted data in Solve/Summarize/HELP flows.

Stage90 still needs one executed exhaustive security enumeration proving all 13 tables and every Part3 RPC remain unavailable to anon/authenticated roles.

## 7. Everything independently verified

The following are verified from exact repository source plus the previously successful strict CI on `fc25b231...`, not from an unsupported claim:

| Area | Verified state |
|---|---|
| Accepted Part2 ancestry | PASS on Stage80 strict CI |
| Migrations 115–121 | PASS on PostgreSQL CI |
| Stage70 Fast Ask DB conversion race | PASS, one Conversation |
| Stage70 conversion rejected states / owner isolation | PASS |
| Stage80 ToolRun authority / lease / stale claim / terminal immutability | PASS |
| Calculator deterministic server path | PASS |
| Solve owner-safe Library grounding / processing rejection | PASS |
| Summarize standalone / no Conversation / provenance | PASS |
| Typed block unknown/future inert handling | PASS in full unit suite |
| Writing unsafe field/javascript URL rejection | PASS in full unit suite |
| Map duplicate/dangling/oversize rejection | PASS in full unit suite |
| Interactive answer-key validation | PASS in unit + PostgreSQL evidence |
| Stream duplicate turn / resume / incomplete / cancel / failure / isolation | PASS in PostgreSQL evidence |
| Full Stage80 regression | 163/163, 25/25 |
| Typecheck / Build | PASS / PASS |
| High/critical dependency audit gate | PASS |
| Production Part3 promotion | NOT DONE intentionally; connected Supabase currently has 0/13 Part3 tables |

## 8. Every remaining red gate

Stage90 remains RED until one exact implementation SHA closes all rows below with executed evidence.

| Gate | Status | Exact remaining proof/fix |
|---|---|---|
| S90-A1 Fast Ask HTTP replay | RED defect | Make second Switch replay parse successfully and return same Conversation identity/title; add API/unit + PostgreSQL proof. |
| S90-A2 Completed expiry | RED defect | Correct completed-but-unconverted expiry/cleanup while Library assets survive; add PostgreSQL proof. |
| S90-B1 stream races | RED | Concurrent cancel-vs-complete, cancellation ordering, stale writer after terminal, no final overwrite. |
| S90-B2 provider integration | RED | Part3 timeout/failure/fallback/malformed runtime output/actual oversized output tests. |
| S90-C adversarial block binding | RED evidence gap | Add one Stage90 hostile suite for unknown/version/depth/Writing/links/Map/quiz/code-as-data despite existing component coverage. |
| S90-D1 HELP leak hardening | RED defect/gap | Strengthen direct final-answer leakage detection and adversarial wording tests. |
| S90-D2 AI tool timeout/fallback | RED defect/gap | Bound Translate/Solve/Summarize provider time; prove fallback on default route topology. |
| S90-D3 provider malformed responses | RED | Translate/Solve/Summarize strict malformed/partial/unavailable provider cases; failure must persist, never fake success. |
| S90-E retry/owner completeness | RED evidence gap | ToolRun failed/retry behavior + exhaustive owner isolation + stale lease variants. |
| S90-F pagination | RED gap | Freeze and prove stable pagination contract for history/search; current route is limit-only. |
| S90-G exhaustive security | RED evidence gap | Enumerate all 13 Part3 tables + all Part3 RPC privileges, SQL-safe route paths, input bounds, idempotency/rate-limit compatibility, untrusted generated content. |
| S90-H Part3 performance | RED missing | Build/run controlled Part3 benchmark harness; current workflow only executes Part2 performance script. |
| S90-CI permanent lane | RED missing | New fail-closed Stage90 PostgreSQL + unit/API + Part3 performance + exact-source evidence workflow. |

## 9. Exact laptop-only tasks

The tests themselves are not inherently laptop-only: GitHub-hosted CI can execute PostgreSQL/unit/typecheck/build/performance after commits exist. The current laptop-dependent boundary is Backend specialist implementation authoring because the dedicated Backend coding workspace is offline and no other authorized arbitrary-GitHub-repository coding-agent route is connected.

Required Backend implementation tasks when the specialist workspace returns:
1. Fix Fast Ask converted replay response shape and completed-expiry transition semantics.
2. Harden HELP_ME_SOLVE leakage detection.
3. Add bounded AI provider timeout and verify/fix fallback behavior for the actual default registry.
4. Freeze rate-limit/idempotency replay ordering semantics and fix if completed safe replay can be blocked incorrectly.
5. Add stable history/search pagination contract required by Stage90.
6. Add Stage90 adversarial unit/API tests and PostgreSQL evidence script covering all remaining cases.
7. Add Part3-specific performance harness.
8. Add permanent Stage90 fail-closed GitHub Actions workflow and push; GitHub CI then becomes the execution environment.

No Founder manual engineering is required.

## 10. Exact files to modify

Expected Backend-owned files; keep the change set narrow and do not touch unrelated product features:

- `server/src/db/migration-120-vh-part3-fast-ask-conversion.sql` — converted replay payload + completed-expiry semantics if DB change is selected.
- `server/src/v1/part3FastAsk.ts` — only if API replay/timeout/error mapping needs a route-side correction.
- `server/src/v1/part3Tools.ts` — HELP leak hardening; provider timeout wiring; rate-limit/idempotency ordering if required.
- `server/src/v1/aiRouter.ts` — only if router-level timeout/fallback/circuit semantics require correction.
- `server/src/v1/part3History.ts` — stable pagination input/output contract.
- `server/src/db/migration-119-vh-part3-history-search.sql` — stable DB cursor/page contract if implemented at RPC level.
- `server/src/v1/part3Streaming.ts` — only if new adversarial tests expose a helper-level defect; preserve existing protocol.
- `server/src/db/migration-117-vh-part3-streaming-state.sql` — only if race tests prove DB transition hardening is needed.
- `server/src/v1/part3Blocks.ts` / `server/src/v1/part3Interactions.ts` — only if hostile Stage90 tests reveal a concrete schema gap; existing contracts are mostly strong.
- NEW recommended `server/src/v1/part3Stage90Adversarial.test.ts` (or narrowly split Stage90 test files).
- NEW `server/scripts/part3-stage90-adversarial-evidence.sh`.
- NEW `server/scripts/part3-performance-evidence.sh`.
- NEW `.github/workflows/veltrix-hom-backend-part3-stage90.yml`.
- At Stage100 only: `server/VELTRIX_HOM_BACKEND_PART3_MANAGER_HANDOFF_2026-08-26.md` and final permanent CI/evidence binding.

Do not create migration 122 merely for convenience unless Manager explicitly approves a contract/migration strategy change; current mission expects full Part3 migrations 115–121.

## 11. Exact tests to run

Stage90 unit/API must include at minimum:

- Fast Ask second HTTP Switch replay returns same Conversation and valid schema including title.
- COMPLETED-but-unconverted expiry; cleanup; Library asset remains.
- failed/incomplete/cancelled/expired/cross-owner conversion rejection.
- stream disconnect, resume afterSeq, duplicate request, timeout, provider failure, fallback, cancellation ordering, cancel-vs-complete race, stale writer, malformed/empty/oversized output, partial-not-final, terminal immutability.
- blocks: unknown type, unsupported version, depth/node/serialized bounds, malformed Writing, unsafe raw fields, invalid links, duplicate/dangling/oversize Map, malformed quiz/invalid answer key, code remains data/no execution.
- Calculator malformed/executable/division/bounds/determinism.
- Translate malformed/unavailable/bounded/idempotent/owner-safe.
- Solve text/image/file, processing/cross-owner rejection, SOLVE_IT schema, HELP no-final-answer with broad wording leakage tests, malformed/partial provider response, input provenance, failure no fake success.
- Summarize standalone/no Conversation/no Studio/provenance/owner/malformed response.
- ToolRun idempotency/duplicate authority/reclaim/stale claim/terminal/failure/retry/owner isolation.
- history/search archive/title/tag/locator/isolation plus stable multi-page pagination with equal timestamps/ranks and no duplicates/skips.
- exhaustive Part3 privilege/security enumeration.

Full verification commands after narrow tests:
- `cd server && npm ci --no-audit --no-fund`
- `npm audit --omit=dev --audit-level=high`
- `npm run typecheck`
- `npm test -- --reporter=verbose`
- `npm run build`
- Stage90 PostgreSQL evidence script under PostgreSQL 16 in GitHub CI.
- Stage90 Part3 performance evidence script under the same controlled CI environment.

## 12. Exact CI workflow to run

Target workflow: `.github/workflows/veltrix-hom-backend-part3-stage90.yml`

It must trigger for `veltrix-hom-backend-part3-stage90-work` and later the canonical Part3 branch, use `fetch-depth: 0`, Node 22, locked dependencies, disposable PostgreSQL 16, and fail-closed Bash (`bash --noprofile --norc -e -o pipefail {0}`). No piped command may hide a failure.

Required job order/gates:
1. exact accepted Part2 ancestry `8553ea370dc9a4813ae4e3bbcf9b241ebd435f80`;
2. `npm ci`;
3. production dependency audit at high severity;
4. accepted Part2 PostgreSQL/race/source-matrix regression evidence;
5. apply migrations 115–121 with `ON_ERROR_STOP=1`;
6. Part3 core;
7. typed stream evidence;
8. Stage50 interactions;
9. Stage60 history/search;
10. Stage70 Fast Ask;
11. Stage80 tools;
12. NEW Stage90 adversarial PostgreSQL;
13. NEW Stage90 adversarial unit/API;
14. NEW Part3 performance evidence;
15. Typecheck;
16. full regression;
17. Build;
18. package exact tested source + logs + hashes and upload success artifact; failure diagnostics on failure.

Do not use the Stage80 workflow as proof of Stage90 merely by rerunning it; it lacks Stage90 adversarial and Part3 performance gates.

## 13. Known defects

D1 — Fast Ask converted replay response omits required `title` at DB replay branch while API schema requires it.

D2 — `vh_expire_fast_ask_session` conflicts with terminal guard for `COMPLETED -> EXPIRED`; required completed-unconverted expiry is not covered by existing Stage70 test.

D3 — HELP_ME_SOLVE leakage detection is pattern-based and not broad enough for all direct final-answer wording required by Stage90.

D4 — Translate/Solve/Summarize provider generation has no deterministic internal timeout wiring.

D5 — default `generate()` fallback can be undermined because fast/fallback models share one provider-level circuit identity; repeated first-route failures can open the circuit before fallback route consideration.

D6 — Part3 history/search has deterministic ordering but no actual cursor pagination API/RPC contract.

D7 — AI tool rate limiting occurs before idempotency replay; safe completed retries may be rate-limited before stored output replay. Intended semantics must be frozen and tested.

## 14. Known non-blocking limitations

- Two moderate transitive `uuid` dependency findings remain; high/critical production dependency audit gate is GREEN on accepted Stage80.
- Production Render/Supabase promotion remains intentionally deferred. Connected production Supabase has no Part3 tables; this is not a Stage90 failure.
- Stage80 performance evidence is Part2-specific and therefore insufficient for Stage90, but it does not invalidate accepted Part2/Stage80 functional work.
- Generic AI router tests already cover some retry/fallback concepts, but Stage90 still requires Part3-specific integration evidence.

## 15. KEEP list

KEEP without rework unless direct contradictory evidence appears:
- Part1 accepted SHA and contracts.
- Part2 accepted SHA and contracts.
- Stage10–80 accepted Part3 behavior.
- migrations 115–121 structure except narrow Stage90 fixes required by proven defects.
- `vh.stream.v1` protocol.
- server-authoritative final blocks / terminal immutability model.
- Fast Ask ephemeral identity and one-time conversion design.
- Library asset identity preservation.
- Stage50 deterministic interactive scoring/proposal-confirmation boundary.
- Stage60 manual-title protection/tags/archive/search locator behavior.
- Stage80 ToolRun server authority, deterministic calculator, strict structured tools, standalone Summarize.
- fail-closed shell policy.
- Stage80 evidence artifact/provenance.

## 16. DO-NOT-REDO list

Do not:
- restart Part1 or Part2;
- restart Part3 from zero;
- redo already verified Stage10–80 happy-path tests merely for activity;
- invent migration 122 without Manager decision;
- deploy Part3 to production only to obtain Stage90 evidence;
- replace typed stream protocol;
- weaken terminal immutability, owner isolation, RLS/service-only, input bounds, or high-severity audit gate;
- add unrelated product features;
- start Part4;
- mark Stage90 GREEN from static review alone.

## 17. First command/action after workspace reconnect

Backend specialist first operation:

```bash
git fetch origin
git checkout veltrix-hom-backend-part3-stage90-work
git pull --ff-only origin veltrix-hom-backend-part3-stage90-work
git merge-base --is-ancestor fc25b2312f4aca599b8e6e57732fede2992de2b2 HEAD
git status --short --branch
```

Expected: clean Stage90 branch, documentation checkpoint present, `fc25b231...` remains an ancestor.

Then first engineering action: reproduce D1 and D2 with narrow failing tests before fixing them. Preserve all unaffected Stage80 GREEN work.

## 18. Stage90 acceptance criteria

Stage90 may become 90% only when one exact Stage90 implementation SHA has:
- all Stage80 accepted gates still GREEN;
- D1–D7 either fixed with executed proof or explicitly disproven by executed adversarial tests;
- required Fast Ask, streaming, typed-block, Explore tool, ToolRun, history/search and security adversarial matrix GREEN;
- Part3-specific controlled performance evidence GREEN with exact environment/sample sizes and no production-scale extrapolation;
- accepted Part2 ancestry GREEN;
- migrations through 121 GREEN;
- high-severity production dependency audit GREEN;
- typecheck, full regression, build GREEN;
- permanent fail-closed Stage90 CI GREEN;
- exact tested source/evidence artifact hashes recorded.

Static audit alone cannot close Stage90.

## 19. Stage100 next path

Only after Stage90 is GREEN:
1. fast-forward/merge the exact verified Stage90 descendant to canonical only with clean ancestry/no contradictory newer commit;
2. create final Stage100 closure commit(s) without unrelated scope;
3. run permanent final CI bound to exact final SHA;
4. package exact source/evidence and SHA-256;
5. create `VELTRIX_HOM_BACKEND_PART3_MANAGER_HANDOFF_2026-08-26.md` mapping P3-01 through P3-25;
6. return final Branch/HEAD/Part2 ancestor/CI run+job/test totals/typecheck/build/PostgreSQL/security/performance/artifact/source ZIP/handoff hashes/limitations;
7. do not claim Manager acceptance; Manager performs independent acceptance review next.

Do not start Part4.

## 20. Founder action requirement

Founder action currently required only to restore an authorized Backend specialist implementation route. The dedicated Windows/Nitro/Antigravity workspace is offline. GitHub read/write and GitHub-hosted CI remain available, but GitHub file-write capability is not a substitute for the Backend specialist role required to author/fix backend implementation under the project authority model.

No password, secret, production deploy, billing action, or manual engineering is requested from Founder.

When the Backend workspace is online, reply to Manager with only the connectivity result (for example `online`); do not send secrets.

Founder action required: YES — restore Backend implementation workspace connectivity.

`BACKEND_PART_3_ACCEPTANCE_CANDIDATE = NO`
