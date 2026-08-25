# VELTRIX HOM — BACKEND PART 2 MANAGER HANDOFF

Date: 2026-08-25  
Role producing this document: **VELTRIX BACKEND MASTER — BACKEND ONLY**  
Purpose: durable backend evidence handoff for independent Manager / Check Engine review.  
This document does **not** declare Manager acceptance, Check Engine PASS, or release readiness.

## 1. Authority and exact baseline

- Product Freeze SHA-256: `65ae6a2bd6a5387c2ce7bf36a51c55c840af661e2733cd975d5dcbd04453e798`
- Accepted Part 1 ancestor: `72e34dc1d2e23131bd8e505f7ed53ede15ab464c`
- Part 2 branch: `veltrix-hom-backend-part2-knowledge-core`
- Exact verified predecessor handoff-containing SHA: `097baa768a9e3bc6f99a546f88762b8357133d31`
- Exact verified predecessor CI run/job: `32863449280` / `97852915170`
- Exact verified predecessor artifact: `9569186365`
- Artifact SHA-256: `e55be2f9d3a6fb531d489ad3b2669d07b88218f59a42fbf46f6cf85c2bbcb95c`
- Exact source ZIP SHA-256: `6ec04974a2a618e954432a273fb83c8479a903e82a321b94f860989774f5ac8f`
- Handoff SHA-256 bound by that artifact manifest: `aea0612682a19def639c8550d19de59ef55371f44cac193519438619544c0430`

The GitHub artifact digest matched the locally downloaded artifact ZIP SHA-256. The manifest source ZIP SHA-256 matched the locally extracted exact-source ZIP, and the manifest handoff SHA-256 matched the locally extracted handoff. This closes the predecessor provenance chain without inference.

## 2. Canonical Part 2 implementation delivered

Implemented and preserved on the Part 2 branch:

- Projects and Project References.
- Universal private Library ingestion/storage/dedup/usage tracking.
- Library Tags, Collections, filters, sort, opaque cursor pagination, linked/unlinked views and search.
- Processing state synchronization, chunks, indexing and provenance.
- Notebook CRUD, source quotas, Project↔Notebook many-to-many links and source selection.
- Scoped grounded retrieval with exact source/chunk provenance.
- Fast Research and Deep Research durable sessions/candidates.
- Explicit candidate Add path through Library rules and Notebook source provenance.
- Trash list/restore/permanent-delete/scheduled purge with physical-storage removal and quota reconciliation.
- Service-role-only canonical persistence and owner isolation.
- Real PostgreSQL concurrency race checks.
- Real PostgreSQL performance evidence with large fixtures.
- Production dependency high-severity audit gate.

Part 3 has not been started.

## 3. Migration chain and SHA-256 provenance

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

## 4. Exact executed test evidence

Exact predecessor handoff-containing CI `32863449280` / job `97852915170`:

- Production high-severity dependency audit: PASS.
- Real PostgreSQL Project-reference race: PASS.
- Real PostgreSQL Library quota race: PASS.
- Real PostgreSQL performance evidence: PASS.
- Typecheck: PASS.
- Unit + regression + dedicated Part 2 acceptance tests: **112/112 PASS**.
- Test files: **18/18 PASS**.
- Build: PASS.
- Exact-source packaging: PASS.
- Evidence artifact upload: PASS.

Dedicated Part 2 evidence files include:

- `server/src/v1/part2.persistence.test.ts`
- `server/src/v1/part2.safety.test.ts`
- `server/src/v1/part2Trash.test.ts`
- `server/src/db/tests/pdfVision.compat.test.ts`
- `server/scripts/part2-race-evidence.sh`
- `server/scripts/part2-performance-evidence.sh`

The persistence suite executes migrations 100–114 and directly exercises Project caps, Library dedup/quota/query, Tags, Collections, Notebook quotas and links, scoped retrieval/provenance, Research trust/owner guards/state synchronization, and Trash cleanup. Safety tests exercise unsafe Research URL rejection, byte-derived source detection and cryptographically bound Library cursor rejection. Trash scheduled-purge testing verifies physical storage removal before metadata cleanup and quota reconciliation.

## 5. Real PostgreSQL concurrency evidence

Executed against PostgreSQL 16:

- `PROJECT_REF_RACE=PASS winners=1 refs=2 bytes=52428800`
- losing concurrent Project writer rejected with `project_reference_bytes_exceeded`
- `QUOTA_RACE=PASS winners=1 used=943718400 reserved=104857600 pending=1 hard=1073741824`
- losing concurrent quota writer rejected with `quota_exceeded`
- `PART2_REAL_POSTGRES_RACES=PASS`

The relevant functions serialize boundary writes using row locks rather than application read-then-write logic.

## 6. Search, retrieval and citation evidence

Executed fixtures prove:

- selected Notebook source filtering occurs before top-K retrieval;
- disabled and foreign sources are excluded;
- Project retrieval is constrained through linked enabled Notebook sources;
- cross-owner search cannot escape account scope;
- citation provenance is server-derived from canonical chunk rows.

Representative verified provenance shape contains `sourceRevision`, `chunkIndex`, `locator`, `textRange`, `contentHash` and `extractionVersion`. Tests assert those values match the canonical enabled source/chunk fixture rather than model-provided metadata.

## 7. Research evidence

Executed evidence proves:

- Fast/Deep candidate metadata is not automatically trusted or added as a Notebook source;
- `accepted_asset_id` starts null;
- foreign accepted assets are rejected by DB owner guard;
- foreign durable Research jobs are rejected by DB owner guard;
- explicit Add uses a same-owner Library asset and records `added_via='research'` plus discovery provenance;
- retry/terminal job states synchronize durable Research session state;
- loopback/unsafe candidate URLs are rejected before fetch.

External Research provider quality/availability is intentionally not treated as deterministic CI evidence.

## 8. Trash / recovery evidence

Executed evidence proves:

- restore preserves recoverable relationships during the recovery window;
- permanent Asset deletion removes Project References, Notebook Sources, Collection membership, chunks and storage metadata;
- Project/Notebook/Collection container deletion does not delete the universal Library asset;
- owner mismatch cannot permanent-delete another account’s object;
- scheduled asset purge removes the physical private-storage object before metadata cleanup and reconciles Library quota.

Trash recovery window remains 30 days per the frozen contract.

## 9. Performance evidence

Environment: GitHub-hosted Ubuntu runner, Node `22.23.2`, npm `10.9.8`, PostgreSQL `16.15` service container.

Synthetic fixture:

- Library assets: **10,000**
- Notebook sources: **1,000**
- chunks: **20,000**
- Project References: **20**

Observed on exact handoff-containing run `32863449280`:

- raw Library keyset page: **0.071 ms**, 40 rows, `Index Only Scan using vh_library_assets_active_created_idx`;
- canonical Library page: **143.992 ms**, 40 rows;
- Library search over 10k assets / 20k chunks: **135.973 ms**, 40 rows;
- scoped Notebook retrieval over 20k chunks: **111.348 ms**, 12 rows;
- `EXPLAIN` scoped retrieval execution: **114.955 ms**;
- bounded Project list: **0.255 ms**;
- bounded Notebook list: **0.176 ms**;
- `PART2_PERFORMANCE_EVIDENCE=PASS`.

CI regression ceilings are intentionally looser than one observed run and are regression guards, not universal production SLO claims.

## 10. Security / privacy evidence

- canonical Part 2 tables use RLS;
- anon/authenticated direct canonical-table path is revoked under the service-only model;
- owner guards protect Project/Notebook/Research relationships;
- scoped retrieval/search cannot expand beyond owner-linked sources;
- candidate Add validates public URL safety before fetch and revalidates redirects;
- private storage uses owner-prefixed paths and server-side access;
- `multer` pinned to `2.2.0`;
- `pdf-to-img` `6.2.0` with nested `pdfjs-dist` override `6.2.108`;
- permanent CI runs `npm audit --omit=dev --audit-level=high`.

Known dependency limitation: two **moderate** transitive `uuid` findings remain through `gaxios`; no high/critical finding passes the enforced gate. No security control was weakened for green CI.

## 11. P2 gate evidence matrix

| Gate | Backend evidence status |
|---|---|
| P2-01 Part1 ancestor | VERIFIED |
| P2-02 Project | VERIFIED |
| P2-03 20 refs | VERIFIED — persistence test + real race harness |
| P2-04 50 MiB | VERIFIED — persistence test + real race harness |
| P2-05 auto-save/persistence | VERIFIED — canonical revision-safe persisted state |
| P2-06 dedup | VERIFIED — owner-scoped uniqueness/usage evidence |
| P2-07 900 MiB warning | VERIFIED |
| P2-08 1 GiB block | VERIFIED — sequential boundary + real concurrent race |
| P2-09 filters/sort/pagination | VERIFIED — deterministic keyset + composable filter/search test |
| P2-10 Tags | VERIFIED |
| P2-11 Collections | VERIFIED |
| P2-12 Add from Library | VERIFIED — asset-ID relation path, no binary re-upload |
| P2-13 processing | VERIFIED — retry/failure state sync and chunk cleanup |
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
| P2-24 exact evidence | VERIFIED — SHA `097baa768a9e3bc6f99a546f88762b8357133d31`, CI `32863449280` / job `97852915170`, artifact `9569186365`, exact artifact/source/handoff SHA-256 chain cross-checked |

## 12. Exact evidence binding closure

Verified predecessor handoff-containing chain:

- SHA: `097baa768a9e3bc6f99a546f88762b8357133d31`
- CI run/job: `32863449280` / `97852915170` — SUCCESS
- artifact ID: `9569186365`
- artifact SHA-256: `e55be2f9d3a6fb531d489ad3b2669d07b88218f59a42fbf46f6cf85c2bbcb95c`
- exact source ZIP SHA-256: `6ec04974a2a618e954432a273fb83c8479a903e82a321b94f860989774f5ac8f`
- handoff SHA-256: `aea0612682a19def639c8550d19de59ef55371f44cac193519438619544c0430`
- tests: **112/112 PASS**, **18/18 files PASS**
- races/performance/security audit/typecheck/build/package/artifact: PASS

P2-24 is closed for that verified evidence chain. This candidate metadata commit is deliberately re-run through the same permanent workflow before it is reported externally as complete.

## 13. Known limits / deliberate non-actions

- Render production promotion was intentionally not performed as part of this evidence closure.
- External Research provider quality/availability is not deterministic CI evidence; lifecycle, trust, ownership and unsafe-fetch boundaries are tested.
- Legacy generated-PDF extraction fixtures can emit a `standardFontDataUrl` warning while tests pass; the dedicated PDF raster compatibility smoke is green.
- GitHub Actions can warn that some action versions target deprecated Node 20 internally while the hosted runner forces Node 24; this is tooling noise, not server runtime evidence.
- Two moderate transitive `uuid` audit findings remain as documented above.

## 14. Final candidate rule

This handoff is a **backend-produced acceptance candidate**, not an independent Manager or Check Engine verdict. The predecessor handoff-containing evidence chain is fully verified. This final candidate metadata revision must also pass the permanent Part 2 workflow; if it does not, this candidate is invalid and must return to `NO`.

BACKEND_PART_2_ACCEPTANCE_CANDIDATE = YES
