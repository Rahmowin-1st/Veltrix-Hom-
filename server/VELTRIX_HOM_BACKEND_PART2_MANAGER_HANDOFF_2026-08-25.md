# VELTRIX HOM — BACKEND PART 2 MANAGER HANDOFF

Date: 2026-08-25  
Role producing this document: **VELTRIX BACKEND MASTER — BACKEND ONLY**  
Purpose: durable backend evidence handoff for independent Manager / Check Engine review.  
This document does **not** declare Manager acceptance, Check Engine PASS, or release readiness.

## 1. Authority and exact baseline

- Product Freeze SHA-256: `65ae6a2bd6a5387c2ce7bf36a51c55c840af661e2733cd975d5dcbd04453e798`
- Accepted Part 1 ancestor: `72e34dc1d2e23131bd8e505f7ed53ede15ab464c`
- Part 2 branch: `veltrix-hom-backend-part2-knowledge-core`
- Last fully verified pre-handoff implementation SHA: `77a3638a82622c41e45eb0a52de2859bd2f2bdfd`
- Last fully verified pre-handoff CI run/job: `32862816708` / `97850994713`
- Last fully verified pre-handoff artifact: `9568962119`
- Artifact SHA-256: `448f65ef7c1b9ef6628b1361c350209677e7550ea258191c59e3d61fe2378cf0`

The exact handoff-containing SHA is intentionally not called accepted in this file until its own workflow run is green and its evidence artifact binds this file by SHA-256.

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
| 105 Part 2 integrity hardening | `1bbecb3cf21292279c2c290ae0f1189f035309ed36cb24729f5da296553cb1f2` |
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

## 4. Part 2 acceptance-test evidence

Exact pre-handoff CI `32862816708` / job `97850994713`:

- Production high-severity dependency audit: PASS.
- Real PostgreSQL Project-reference race: PASS.
- Real PostgreSQL Library quota race: PASS.
- Real PostgreSQL performance evidence: PASS.
- Typecheck: PASS.
- Unit + regression + Part 2 acceptance tests: **112/112 PASS**.
- Test files: **18/18 PASS**.
- Build: PASS.
- Exact-source packaging: PASS.
- Evidence artifact upload: PASS.

### Dedicated Part 2 persistence suite

`server/src/v1/part2.persistence.test.ts` executes migrations 100–114 and proves:

1. canonical Part 2 tables are RLS-enabled and unavailable to anon/authenticated direct reads;
2. exact Project Reference 20-count and 50 MiB limits plus idempotent Add;
3. owner-scoped Library dedup/usage and cross-owner non-reuse;
4. 900 MiB warning policy and exact 1 GiB hard quota;
5. normalized Tag policy and file/image-only Collection relationships;
6. deterministic Library keyset pagination, composable filters/search and owner isolation;
7. Notebook quotas, idempotent sources and Project↔Notebook many-to-many semantics;
8. enabled-owner-scoped Notebook/Project retrieval with exact provenance;
9. Research candidate trust boundary and accepted-asset/job owner guards;
10. source/research retry/failure synchronization and partial-chunk cleanup;
11. permanent Trash metadata/relationship cleanup while container deletion preserves universal Library assets.

### Safety suites

`server/src/v1/part2.safety.test.ts` proves:

- a candidate resolving directly to loopback URL is rejected as `RESEARCH_URL_UNSAFE` before network fetch;
- supported type is derived from bytes for PDF/PNG rather than trusting declared MIME;
- Library cursor MAC/fingerprint rejects query mismatch and payload tampering.

`server/src/v1/part2Trash.test.ts` proves scheduled expiration flow calls:

1. physical private-storage removal;
2. atomic `vh_delete_part2_metadata` cleanup;
3. Library quota reconciliation.

`server/src/db/tests/pdfVision.compat.test.ts` proves generated-PDF page rendering works with the hardened PDF dependency tree and releases the renderer cleanly.

## 5. Real PostgreSQL concurrency evidence

Executed against PostgreSQL 16 in CI:

- `PROJECT_REF_RACE=PASS winners=1 refs=2 bytes=52428800`
- losing concurrent writer is rejected with `project_reference_bytes_exceeded`;
- `QUOTA_RACE=PASS winners=1 used=943718400 reserved=104857600 pending=1 hard=1073741824`
- losing concurrent writer is rejected with `quota_exceeded`;
- `PART2_REAL_POSTGRES_RACES=PASS`.

The relevant functions serialize boundary writes using row locks rather than read-then-write application logic.

## 6. Search / retrieval / citation evidence

Executed Part 2 fixtures prove:

- selected Notebook source filtering happens before top-K retrieval;
- disabled and foreign sources are excluded;
- Project retrieval is constrained through linked enabled Notebook sources;
- cross-owner search cannot escape account scope;
- citation provenance is server-derived from canonical chunk rows.

Representative provenance fixture fields:

```json
{
  "sourceRevision": 1,
  "chunkIndex": 0,
  "locator": { "page": 7 },
  "textRange": { "start": 0, "end": 23 },
  "contentHash": "server-generated SHA-256 fixture hash",
  "extractionVersion": "extract-v1"
}
```

The executable fixture asserts the returned `asset_id`, `chunk_index`, `locator`, `content_hash`, `source_revision`, and `extraction_version` match the canonical enabled source row.

## 7. Research evidence

Executed persistence evidence proves:

- Fast/Deep candidate metadata is not a trusted Notebook source merely because it was discovered;
- candidate `accepted_asset_id` starts null;
- a foreign accepted asset is rejected by the DB owner guard;
- a foreign durable Research job is rejected by the DB owner guard;
- explicit Add uses a same-owner Library asset and records `added_via='research'` plus discovery provenance;
- retry and terminal job states synchronize durable Research session state;
- unsafe loopback candidate URL is rejected before fetch.

Earlier real-DB suites additionally exercised multiple Research sessions, candidate/session dedup, Deep lifecycle and non-auto-add behavior.

## 8. Trash / recovery evidence

Executed DB evidence proves:

- restore path exists and preserves relationships during recovery window;
- permanent Asset deletion removes Project References, Notebook Sources, Collection membership, chunks and storage metadata;
- Project/Notebook/Collection container deletion does not delete the universal Library asset;
- owner mismatch cannot permanent-delete another account's object;
- scheduled asset purge removes physical private-storage object before metadata cleanup and reconciles Library quota.

Trash recovery window remains 30 days per the frozen contract.

## 9. Performance evidence

Environment: GitHub-hosted Ubuntu runner, Node `22.23.2`, npm `10.9.8`, PostgreSQL `16.15` service container.

Synthetic fixture per run:

- Library assets: **10,000**
- Notebook sources: **1,000**
- chunks: **20,000**
- Project References: **20**

Observed on exact pre-handoff run `32862816708`:

- raw Library keyset page: **0.077 ms**, 40 rows, `Index Only Scan using vh_library_assets_active_created_idx`, shared hit=4;
- canonical Library page: **151.146 ms**, 40 rows;
- Library search over 10k assets / 20k chunks: **138.418 ms**, 40 rows;
- scoped Notebook retrieval over 20k chunks: **113.732 ms**, 12 rows;
- `EXPLAIN` scoped retrieval execution: **117.059 ms**;
- bounded Project list: **0.262 ms**;
- bounded Notebook list: **0.168 ms**;
- `PART2_PERFORMANCE_EVIDENCE=PASS`.

CI regression ceilings are deliberately looser than one observed run to detect material regressions without pretending a universal production SLO: Library page 1000 ms, Library search 1500 ms, retrieval 1000 ms, Project/Notebook bounded list 250 ms.

## 10. Security / privacy evidence

- canonical Part 2 tables: RLS enabled;
- anon/authenticated direct canonical-table DML/read path revoked in service-only model;
- service-role backend filters by account/container ownership;
- relation owner guards protect Project/Notebook/Research cross-owner links;
- scoped retrieval/search cannot expand beyond owner-linked sources;
- candidate Add validates public URL safety before fetch and revalidates redirects;
- private storage uses owner-prefixed object paths and server-side access;
- `multer` pinned to `2.2.0`;
- `pdf-to-img` `6.2.0` with nested `pdfjs-dist` override `6.2.108`;
- permanent CI executes `npm audit --omit=dev --audit-level=high`.

Known dependency audit limitation: two **moderate** transitive `uuid` findings remain through `gaxios`; there are no high/critical findings under the enforced gate. No security control was weakened to obtain green CI.

## 11. P2 gate evidence matrix

| Gate | Backend evidence status |
|---|---|
| P2-01 Part1 ancestor | VERIFIED — exact accepted ancestor recorded |
| P2-02 Project | VERIFIED — persistence suite + real DB |
| P2-03 20 refs | VERIFIED — test + real race harness |
| P2-04 50 MiB | VERIFIED — test + real race harness |
| P2-05 auto-save | VERIFIED — canonical persisted Library asset/reference model |
| P2-06 dedup | VERIFIED — same-owner reuse semantics / uniqueness / usage evidence |
| P2-07 900 MiB warning | VERIFIED |
| P2-08 1 GiB block | VERIFIED — sequential boundary + real concurrent race |
| P2-09 filters/sort/pagination | VERIFIED — deterministic keyset + composable filter/search test |
| P2-10 Tags | VERIFIED |
| P2-11 Collections | VERIFIED |
| P2-12 Add from Library | VERIFIED — asset-ID relation RPCs, no binary re-upload path |
| P2-13 processing | VERIFIED — state sync/failure/chunk cleanup |
| P2-14 citation provenance | VERIFIED — canonical chunk provenance fixture |
| P2-15 search/index isolation | VERIFIED — owner/scoped retrieval tests |
| P2-16 Notebook | VERIFIED |
| P2-17 Project↔Notebook | VERIFIED |
| P2-18 grounded retrieval | VERIFIED |
| P2-19 Fast Research | VERIFIED — candidate not trusted until Add |
| P2-20 Deep lifecycle | VERIFIED — durable session/job state evidence |
| P2-21 candidate review/add | VERIFIED — trust boundary + owner guard + research provenance + SSRF reject |
| P2-22 Trash/recovery | VERIFIED — DB cleanup + physical scheduled purge test |
| P2-23 security/isolation | VERIFIED — RLS/service-only/owner/SSRF/audit evidence |
| P2-24 exact evidence | PENDING exact handoff-containing CI/artifact binding |

## 12. Known limits / deliberate non-actions

- Render production promotion is not part of this evidence run and was intentionally not performed.
- External Research provider quality/availability is not treated as deterministic CI evidence; provider-independent lifecycle, trust, ownership and unsafe-fetch boundaries are tested deterministically.
- Legacy PDF extraction tests emit a `standardFontDataUrl` warning for generated fixtures but pass; the separate PDF raster compatibility smoke is green.
- GitHub Action runtime warns that some action versions target deprecated Node 20 internally while the workflow is forced to Node 24 by the runner. This is tooling noise, not server runtime evidence.
- Two moderate transitive `uuid` audit findings remain as documented above.

## 13. Final candidate rule

This handoff is a backend-produced acceptance candidate, not an independent acceptance verdict. The exact handoff-containing commit must pass the permanent Part 2 workflow and produce an evidence artifact whose manifest includes this handoff SHA-256.

BACKEND_PART_2_ACCEPTANCE_CANDIDATE = NO
