# VELTRIX HOM — BACKEND PART 2 MANAGER HANDOFF

Date: 2026-08-25  
Role producing this document: **VELTRIX BACKEND MASTER — BACKEND ONLY**  
Purpose: durable backend evidence handoff for independent Manager / Check Engine review.  
This document does **not** declare Manager acceptance, Check Engine PASS, or release readiness.

## 1. Authority and exact verified predecessor

- Product Freeze SHA-256: `65ae6a2bd6a5387c2ce7bf36a51c55c840af661e2733cd975d5dcbd04453e798`
- Accepted Part 1 ancestor: `72e34dc1d2e23131bd8e505f7ed53ede15ab464c`
- Part 2 branch: `veltrix-hom-backend-part2-knowledge-core`
- Exact verified acceptance-enforced predecessor SHA: `aede8f72ea27c059ef1e542686bd523f478c6125`
- Exact verified CI run/job: `32865385551` / `97859354793`
- Exact verified artifact: `9569937775`
- Artifact ZIP SHA-256: `bdc31f6e709555db37a41c6acc9ae2b10a682e862b39e9827c9c455a0338cf4d`
- Exact source ZIP SHA-256: `b75bf900af5e38d56cc1b193ec4006646bc5b62035690b9e099e17b57e46b4ea`
- Predecessor handoff SHA-256 bound in that artifact manifest: `8f78083f80fe07cd4da91711c792ccd1785e66b0e48c7146878a5a8f22fffdc9`

The GitHub artifact digest matched the locally downloaded artifact ZIP SHA-256. The manifest source ZIP SHA-256 matched the locally extracted source ZIP. The final commit containing this revised handoff is intentionally re-run through the same permanent workflow; its exact SHA, source ZIP SHA-256 and this revised handoff SHA-256 are bound by that final run's `PART2_CI_EVIDENCE.txt` manifest.

## 2. Canonical Part 2 backend delivered

Implemented and preserved on the Part 2 branch:

- Projects and Project References.
- Universal private Library ingestion/storage/dedup/usage tracking.
- Library Tags, Collections, composable filters/sorts, opaque cursor pagination, linked/unlinked views and search.
- Processing state synchronization, chunks, indexing and exact provenance.
- Notebook CRUD, configurable source quotas, Project↔Notebook many-to-many links and source selection.
- Scoped grounded retrieval with exact source/chunk provenance.
- Fast Research and Deep Research durable sessions/candidates.
- Explicit Research candidate Add through Library rules with discovery provenance.
- Trash list/restore/permanent-delete/scheduled purge, physical storage deletion and quota reconciliation.
- Service-role-only canonical persistence, RLS and owner isolation.
- Real PostgreSQL concurrency, acceptance and performance evidence.
- Permanent production high-severity dependency audit gate.

Part 3 has not been started. Render production promotion remains intentionally deferred.

## 3. Migration chain SHA-256

| Migration | SHA-256 |
|---|---|
| 100 foundation | `e53d12b1ac4c0234569d569b1286abbdf6844cbd71b7010fed147614d19c9186` |
| 101 hardening | `55157807b56237768494ac9712b9fd56ebeb11df1858ad8ff569234e9aa44500` |
| 102 service-only | `10ff28e79c67ef2fed84656720c0e169bad8792c92b6faf22f7d3028f2688064` |
| 103 index hardening | `a998f51443c436c7ca1685b32284a8fc4009a396c3a5152fdf2b322b1806a312` |
| 104 Part 2 knowledge core | `7969a17475f9269f963de1505aff6c406bf570ca5da794f0e608884f12579305` |
| 105 integrity hardening | `1bbecb3cf21292279c2c290ae0f1189f035309ed36cb24729f5da296553cb1f2` |
| 106 Library query | `38eaaaa8c1ba65ef8e33c5937f7be27cb2c6f640d789828e6a57383a2e0b0716` |
| 107 job-state sync | `2d6942a3f6af363e2347380630e1ebac5e379d55ca753ee0f18784582ceb1d5a` |
| 108 scoped Notebook retrieval | `2322d695720007105e2fe7703ee6abcb302401dba91fffd57dec9d44a1308bb5` |
| 109 Research owner guards | `1188af1544901a3b0693cafb909023d487ae8884f5aee2c206f55a80f9b724c0` |
| 110 Trash metadata delete | `520a5ce1a542001a4522ac0087ff196070fac8873840b574a171c1c2845a176e` |
| 111 FK index hardening | `2aa4279075e30ad8545fa65ea99523e1ccdb314607993f18234a281a7d8bd675` |
| 112 Library keyset indexes | `4b1e3f549e7c6a4080b18224f0b9d15040f7b003ccc8296bcbef0359427fd22e` |
| 113 Library page-first enrichment | `d1ac05b4b5d8739f4673e27bc654855350a277c7b260c7dc2b7c0cac1b79fa3f` |
| 114 Library search-hits optimization | `f56f1d79e96e86a4d1d0649869d389d646ba70363b035b7e5b34609c2c0eddd7` |

Architecture SHA-256: `dd3882cd39102efa6ae8d148347877f7f463c962f9dd75fbf3461405fc803ebe`.

## 4. Exact executed verification at predecessor SHA

CI `32865385551` / job `97859354793` on `aede8f72ea27c059ef1e542686bd523f478c6125`:

- Production dependency audit with `--audit-level=high`: **PASS**; no high/critical finding.
- Real PostgreSQL Project Reference race: **PASS**.
- Real PostgreSQL Library quota race: **PASS**.
- Real PostgreSQL Part 2 acceptance suite: **PASS**.
- Real PostgreSQL large-fixture performance suite: **PASS**.
- Typecheck: **PASS**.
- Unit/regression/dedicated Part 2 tests: **112/112 PASS**.
- Test files: **18/18 PASS**.
- Build: **PASS**.
- Exact-source packaging: **PASS**.
- Evidence artifact upload: **PASS**.

Dedicated Part 2 evidence files:

- `server/src/v1/part2.persistence.test.ts`
- `server/src/v1/part2.safety.test.ts`
- `server/src/v1/part2Trash.test.ts`
- `server/src/db/tests/pdfVision.compat.test.ts`
- `server/scripts/part2-race-evidence.sh`
- `server/scripts/part2-acceptance-evidence.sh`
- `server/scripts/part2-performance-evidence.sh`

## 5. Real PostgreSQL acceptance evidence

`server/scripts/part2-acceptance-evidence.sh` executed against PostgreSQL 16 and emitted:

- `P2_PROJECT_CRUD_IDEMPOTENCY=PASS`
- `P2_PROJECT_REFERENCE_BOUNDARIES=PASS`
- `P2_LIBRARY_DEDUP_QUOTA=PASS warning_boundary=943718400 hard=1073741824`
- `P2_LIBRARY_QUERY_TAG_COLLECTION=PASS`
- `P2_NOTEBOOK_PROCESS_RETRIEVAL=PASS`
- `P2_RESEARCH_CANDIDATE_LIFECYCLE=PASS`
- `P2_TRASH_RECOVERY_DELETE=PASS`
- `P2_SECURITY_ISOLATION=PASS`
- `PART2_ACCEPTANCE=PASS`

This supplements, rather than replaces, the dedicated PGlite/route-level Part 2 tests.

## 6. Concurrency evidence

Executed against PostgreSQL 16:

- `PROJECT_REF_RACE=PASS winners=1 refs=2 bytes=52428800`
- losing concurrent Project writer is rejected at the 50 MiB boundary;
- `QUOTA_RACE=PASS winners=1 used=943718400 reserved=104857600 pending=1 hard=1073741824`
- losing concurrent quota writer is rejected at the 1 GiB hard boundary;
- `PART2_REAL_POSTGRES_RACES=PASS`.

Boundary mutations serialize through database row locks rather than application read-then-write checks.

## 7. Search, retrieval and citation evidence

Executed fixtures prove:

- Library search/filter/pagination remains owner-scoped and deterministic;
- selected Notebook source filtering occurs before top-K retrieval;
- disabled and foreign sources are excluded;
- Project retrieval remains constrained through linked enabled owner sources;
- citation provenance is server-derived from canonical chunk rows.

Representative provenance fields verified by tests are `sourceRevision`, `chunkIndex`, `locator`, `textRange`, `contentHash` and `extractionVersion`. The real PostgreSQL acceptance fixture verifies a page locator, text range, 64-character content hash and extraction version on canonical chunk data.

## 8. Research evidence

Executed evidence proves:

- Fast/Deep candidates are metadata only until explicit Add;
- candidates begin without `accepted_asset_id`;
- foreign accepted assets are rejected by owner guards;
- foreign durable Research jobs are rejected;
- explicit Add links the same-owner Library asset to Notebook with `added_via='research'` and discovery provenance;
- retry/terminal job states synchronize durable Research state;
- unsafe loopback Research candidates are rejected before network fetch or Library ingestion.

External Research provider quality/availability is intentionally not treated as deterministic CI evidence.

## 9. Trash / recovery evidence

Executed evidence proves:

- recoverable objects can be restored inside the recovery window;
- permanent Asset deletion removes Project References, Notebook Sources, Collection membership, chunks and storage metadata;
- Project/Notebook/Collection deletion does not implicitly delete the universal Library asset;
- owner mismatch cannot permanent-delete another account's object;
- scheduled expired-Asset purge removes physical private-storage content before metadata cleanup and reconciles Library quota.

Trash recovery window remains 30 days.

## 10. Performance evidence

Environment: GitHub-hosted Ubuntu runner; Node `22.23.2`; npm `10.9.8`; PostgreSQL `16.15` service container.

Fixture:

- Library assets: **10,000**
- Notebook sources: **1,000**
- source chunks: **20,000**
- Project References: **20**

Observed on run `32865385551`:

- raw Library keyset EXPLAIN execution: **0.063 ms**, 40 rows, `Index Only Scan using vh_library_assets_active_created_idx`;
- canonical Library page: **107.223 ms**, 40 rows;
- Library search over 10k assets / 20k chunks: **95.414 ms**, 40 rows;
- scoped Notebook retrieval: **77.513 ms**, 12 rows;
- scoped retrieval EXPLAIN execution: **90.163 ms**;
- bounded Project list: **0.209 ms**;
- bounded Notebook list: **0.098 ms**;
- `PART2_PERFORMANCE_EVIDENCE=PASS`.

CI ceilings are regression guards, not universal production SLO claims.

## 11. Security / privacy evidence

- canonical Part 2 tables use RLS;
- anon/authenticated direct canonical-table DML is revoked in the service-only model;
- owner guards protect Project/Notebook/Research relationships;
- scoped search/retrieval cannot expand outside owner-linked sources;
- candidate Add validates public URL safety before fetch and redirects are revalidated;
- private storage remains owner-prefixed/server-mediated;
- `multer` is pinned to `2.2.0`;
- `pdf-to-img` remains `6.2.0` with nested `pdfjs-dist` override `6.2.108`;
- PDF raster compatibility smoke is green;
- permanent CI enforces `npm audit --omit=dev --audit-level=high`.

Known dependency limitation: two **moderate** transitive `uuid` findings remain through `gaxios`; no high/critical finding passes the enforced gate. No security control was weakened for CI.

## 12. P2 gate matrix

| Gate | Backend evidence status |
|---|---|
| P2-01 Part1 ancestor | VERIFIED |
| P2-02 Project | VERIFIED — persistence + real PostgreSQL acceptance |
| P2-03 20 refs | VERIFIED — persistence + real PostgreSQL acceptance + race harness |
| P2-04 50 MiB | VERIFIED — persistence + real PostgreSQL acceptance + race harness |
| P2-05 auto-save/persistence | VERIFIED — canonical revision-safe persisted state |
| P2-06 dedup | VERIFIED — owner-scoped uniqueness/usage evidence |
| P2-07 900 MiB warning | VERIFIED |
| P2-08 1 GiB block | VERIFIED — sequential boundary + real concurrency |
| P2-09 filters/sort/pagination | VERIFIED — deterministic keyset + composable real/PGlite evidence |
| P2-10 Tags | VERIFIED |
| P2-11 Collections | VERIFIED |
| P2-12 Add from Library | VERIFIED — asset-ID relationship path; no binary re-upload |
| P2-13 processing | VERIFIED — state sync + partial chunk cleanup |
| P2-14 citation provenance | VERIFIED |
| P2-15 search/index isolation | VERIFIED |
| P2-16 Notebook | VERIFIED |
| P2-17 Project↔Notebook | VERIFIED |
| P2-18 grounded retrieval | VERIFIED |
| P2-19 Fast Research | VERIFIED |
| P2-20 Deep lifecycle | VERIFIED |
| P2-21 candidate review/add | VERIFIED |
| P2-22 Trash/recovery | VERIFIED |
| P2-23 security/isolation | VERIFIED |
| P2-24 exact evidence | VERIFIED for predecessor chain; final metadata revision must pass permanent workflow and bind itself via manifest |

## 13. Known limits / deliberate non-actions

- Render production promotion was intentionally not performed for Part 2 evidence closure.
- External Research provider quality/availability is not deterministic CI evidence; lifecycle, trust, ownership and unsafe-fetch boundaries are tested.
- Generated-PDF extraction fixtures can emit `standardFontDataUrl` warnings while passing; dedicated PDF raster compatibility is green.
- GitHub Actions may warn that some action versions target deprecated Node 20 internally while hosted runners force Node 24; server runtime remains Node 22 in this workflow.
- Two moderate transitive `uuid` audit findings remain as documented above.

## 14. Final candidate rule

This is a **Backend-produced acceptance candidate**, not an independent Manager or Check Engine verdict. The verified predecessor evidence chain is green and directly includes Part 2 acceptance, race, performance, safety, persistence, Trash, typecheck, build and exact-source packaging evidence.

The commit containing this revised handoff must itself receive a successful permanent Part 2 workflow and evidence artifact. If that final run fails, this candidate immediately becomes invalid and must return to `NO`. If it succeeds, the final artifact manifest provides the exact self-binding commit SHA, source ZIP SHA-256 and revised handoff SHA-256 for Manager review.

BACKEND_PART_2_ACCEPTANCE_CANDIDATE = YES
