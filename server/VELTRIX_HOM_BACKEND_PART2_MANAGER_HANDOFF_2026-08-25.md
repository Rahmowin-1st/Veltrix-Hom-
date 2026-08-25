# VELTRIX HOM — BACKEND PART 2 MANAGER HANDOFF

Date: 2026-08-25  
Role producing this document: **VELTRIX BACKEND MASTER — BACKEND ONLY**  
Purpose: durable backend evidence handoff for independent Manager / Check Engine review.  
This document does **not** declare Manager acceptance, Check Engine PASS, or release readiness.

## 1. Authority and branch

- Product Freeze SHA-256: `65ae6a2bd6a5387c2ce7bf36a51c55c840af661e2733cd975d5dcbd04453e798`
- Accepted Part 1 ancestor: `72e34dc1d2e23131bd8e505f7ed53ede15ab464c`
- Part 2 branch: `veltrix-hom-backend-part2-knowledge-core`
- Canonical source-processing implementation commit: `7e86d83a60f9d80aad9e02187dff5ad20eb6d4b5`
- Canonical source-matrix cleanup commit: `33fb8e3143a2787c2890ab835c97b088fa3462e6`
- Permanent Part-2 workflow source-matrix/extractor binding commit: `88c70f0d2fcdc9a06ae53ec95a619be3cf996a82`
- Temporary source dependency workflow removal commit: `c80f4fd52ebd138c1fcd1262c96d839038ed27ce`
- Temporary source implementation workflow removal commit: `3ad60f8fe3e95fa59c62332f659bf5b3ad9bb99a`

The exact final HEAD containing this handoff is intentionally not hard-coded inside the handoff because changing this file changes the commit SHA. The permanent Part-2 CI evidence manifest records the exact executing `GITHUB_SHA` and the SHA-256 of this handoff on the same immutable source snapshot. That manifest is the final self-binding provenance record.

Part 3 has not been started. Render production promotion remains intentionally deferred.

## 2. Canonical Part 2 backend delivered

Implemented and preserved:

- Projects and Project References.
- Universal private Library ingestion/storage/dedup/usage tracking.
- Library Tags, Collections, composable filters/sorts, opaque cursor pagination and search.
- Durable processing state synchronization, chunks, indexing and exact provenance.
- Notebook CRUD, configurable source quotas, Project↔Notebook many-to-many and source selection.
- Scoped grounded Notebook/Project retrieval.
- Fast Research and Deep Research sessions/candidates.
- Explicit Research candidate Add through Library rules.
- Trash restore/permanent-delete/scheduled purge and quota reconciliation.
- Service-role-only canonical persistence, RLS and owner isolation.
- Real PostgreSQL race, acceptance, source-matrix and performance evidence.
- Permanent production high-severity dependency audit.
- Permanent source-format extractor test gate.

No already-green Part 2 product area was reopened for P2-24 closure.

## 3. Canonical source processing and safety

Canonical supported knowledge sources now include:

1. PDF — page-level locator.
2. DOCX — paragraph-level locator.
3. PPTX — slide-level locator.
4. TXT / Markdown — document-section locator.
5. CSV / spreadsheet text — document-section locator.
6. EPUB — chapter/path/spine provenance.
7. Image — vision-derived knowledge with modality locator.
8. Audio — timestamped transcript provenance.
9. Video — timestamped transcript provenance.
10. Web page — fetched page provenance with final URL/section locator.
11. Pasted text — persistent Library asset and Notebook source with pasted-text locator.

Safety behavior:

- byte signatures are used for supported binary type detection where applicable instead of blindly trusting declared MIME;
- malformed Office/EPUB archives fail safely;
- archive extraction is bounded;
- web HTML is reduced to study text without executable/script content;
- unsafe loopback/private-network Research URLs are rejected before fetch/ingestion;
- redirects are revalidated by the canonical public-URL boundary;
- media provider failure does not fabricate `READY`; failure state and safe failure code remain explicit;
- unsupported source types remain explicit `UNSUPPORTED`/safe-failure states rather than fake grounded content;
- duplicate content remains owner-scoped through canonical Library dedup.

## 4. Durable permanent CI binding

The permanent workflow `.github/workflows/veltrix-hom-backend-part2.yml` now directly enforces on the same exact HEAD:

- `npm audit --omit=dev --audit-level=high`;
- real PostgreSQL Project Reference and Library quota races;
- real PostgreSQL Part-2 acceptance suite;
- real PostgreSQL 11-source canonical source matrix;
- real PostgreSQL performance regression suite;
- Typecheck;
- explicit `part2SourceExtract.test.ts` source-format gate;
- full regression tests;
- Build;
- exact Git source archive;
- final evidence manifest and evidence artifact.

The manifest hashes and includes:

- migration chain 100–114;
- architecture/package lock inputs;
- race, acceptance, source-matrix and performance scripts/logs;
- source extractor implementation/test;
- canonical Part-2 routers/services/tests;
- exact source ZIP;
- this Manager handoff if present.

The separate read-only permanent source-matrix workflow remains as an additional focused gate; temporary write-capable source upgrade/implementation workflows were removed before the final handoff commit.

## 5. Real PostgreSQL 11/11 source matrix evidence

The corrected source matrix executed on PostgreSQL 16 and produced PASS markers for all eleven canonical kinds:

- `SOURCE_MATRIX_KIND=PASS kind=pdf`
- `SOURCE_MATRIX_KIND=PASS kind=document`
- `SOURCE_MATRIX_KIND=PASS kind=pptx`
- `SOURCE_MATRIX_KIND=PASS kind=text`
- `SOURCE_MATRIX_KIND=PASS kind=spreadsheet`
- `SOURCE_MATRIX_KIND=PASS kind=epub`
- `SOURCE_MATRIX_KIND=PASS kind=image`
- `SOURCE_MATRIX_KIND=PASS kind=audio`
- `SOURCE_MATRIX_KIND=PASS kind=video`
- `SOURCE_MATRIX_KIND=PASS kind=web`
- `SOURCE_MATRIX_KIND=PASS kind=pasted`

It additionally emitted:

- `SOURCE_MATRIX_SELECTION=PASS disabled_excluded=1`
- `SOURCE_MATRIX_ISOLATION=PASS cross_owner_excluded=1`
- final clean `PART2_SOURCE_MATRIX=PASS kinds=11 persistence=postgres16 grounded_retrieval=pass provenance=pass selection=pass isolation=pass`

Each source fixture is persisted as a canonical Library asset, linked as a Notebook source, represented by a canonical `vh_source_chunks` row, retrieved through canonical Notebook search and checked for source revision, chunk index, content hash, extraction version and locator provenance.

Focused green source-matrix predecessor run:

- Run: `32872225804`
- Job: `97881753802`
- Source-matrix artifact: `9572503959`
- Source-matrix artifact GitHub digest: `sha256:6fe28c7aaea42656f6fb9922d02631ac6beda256b56795dc80c954c65fe9dccd`

The final acceptance candidate requires the same matrix to pass again inside the permanent Part-2 workflow on the exact final HEAD containing this handoff.

## 6. Source-format extractor evidence

`server/src/v1/part2SourceExtract.test.ts` covers canonical fixtures for:

- DOCX paragraph extraction/provenance;
- PPTX numeric slide ordering/provenance;
- EPUB spine/chapter/path provenance;
- image provider response → grounded vision knowledge;
- audio/video provider responses → timestamped transcript knowledge;
- web HTML sanitization;
- malformed archive safe failure.

A previously executed implementation validation produced **119/119 tests PASS across 19/19 files**, including **7/7 source extractor tests**, with Typecheck and Build PASS. The final exact-head permanent workflow reruns the dedicated extractor gate and the full suite; only that final run is authoritative for final P2-24 closure.

## 7. Migration chain SHA-256

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

## 8. Real PostgreSQL acceptance and concurrency evidence

Acceptance suite markers include:

- `P2_PROJECT_CRUD_IDEMPOTENCY=PASS`
- `P2_PROJECT_REFERENCE_BOUNDARIES=PASS`
- `P2_LIBRARY_DEDUP_QUOTA=PASS warning_boundary=943718400 hard=1073741824`
- `P2_LIBRARY_QUERY_TAG_COLLECTION=PASS`
- `P2_NOTEBOOK_PROCESS_RETRIEVAL=PASS`
- `P2_RESEARCH_CANDIDATE_LIFECYCLE=PASS`
- `P2_TRASH_RECOVERY_DELETE=PASS`
- `P2_SECURITY_ISOLATION=PASS`
- `PART2_ACCEPTANCE=PASS`

Race evidence includes:

- `PROJECT_REF_RACE=PASS winners=1 refs=2 bytes=52428800`
- `QUOTA_RACE=PASS winners=1 used=943718400 reserved=104857600 pending=1 hard=1073741824`
- `PART2_REAL_POSTGRES_RACES=PASS`

These are database-enforced boundaries, not application read-then-write claims.

## 9. Search / retrieval / citation provenance

Executed fixtures prove:

- selected Notebook source filtering occurs before top-K retrieval;
- disabled and foreign sources are excluded;
- Project retrieval is constrained through linked enabled owner sources;
- canonical chunk provenance includes `sourceRevision`, `chunkIndex`, `locator`, `textRange`, `contentHash` and `extractionVersion`;
- Research candidates remain untrusted until explicit Add;
- explicit Add records discovery provenance and links the accepted Library asset rather than creating a parallel truth store.

## 10. Performance evidence

The permanent performance harness uses PostgreSQL 16 with a synthetic fixture of:

- 10,000 Library assets;
- 1,000 Notebook sources;
- 20,000 source chunks;
- 20 Project References.

Prior accepted measurements demonstrated indexed bounded Library paging/search, scoped retrieval and bounded Project/Notebook lists inside CI regression ceilings. `PART2_PERFORMANCE_EVIDENCE=PASS` is required again on the exact final HEAD. These ceilings are regression guards, not universal production SLO claims.

## 11. Security / privacy

- canonical Part-2 tables use RLS;
- anon/authenticated direct DML is revoked in the service-only model;
- owner guards protect Project/Notebook/Research relationships;
- scoped search cannot expand outside owner-linked sources;
- public URL safety is checked before server fetch and after redirects;
- private storage remains owner-prefixed/server-mediated;
- `multer` is pinned to `2.2.0`;
- `pdf-to-img` remains `6.2.0` with nested `pdfjs-dist` override `6.2.108`;
- PDF raster compatibility smoke remains part of the full suite;
- permanent CI rejects high/critical production dependency audit findings.

Known dependency limitation: two **moderate** transitive `uuid` findings remain through `gaxios`; they are documented and are not bypassed with a forced dependency downgrade.

## 12. External-provider limitations

The following are explicit limitations rather than hidden success claims:

- image understanding requires the configured server-side multimodal provider to be available; provider failure produces explicit failed state/safe failure rather than invented grounded content;
- audio/video transcript extraction requires the configured provider path; timestamp provenance is validated with deterministic provider fixtures in CI;
- direct YouTube URL Notebook ingestion does not pretend to have transcript knowledge when a YouTube transcript provider is not configured; the canonical route returns explicit `VIDEO_TRANSCRIPT_PROVIDER_UNAVAILABLE`;
- external web/research quality and availability are not deterministic CI guarantees; SSRF/trust/persistence/lifecycle boundaries are deterministic and tested;
- Render production promotion remains intentionally deferred and is not required for Part-2 evidence closure.

## 13. P2 gate status entering final exact-head CI

| Gate | Backend status |
|---|---|
| P2-01 through P2-12 | VERIFIED and KEEP |
| P2-13 processing | IMPLEMENTATION-CLOSED; final exact-head CI required |
| P2-14 through P2-17 | VERIFIED and KEEP |
| P2-18 grounded retrieval | IMPLEMENTATION-CLOSED; final exact-head CI required |
| P2-19 through P2-23 | VERIFIED and KEEP |
| P2-24 exact evidence | OPEN until the exact final HEAD permanent CI and artifact are green and cross-checked |

## 14. Final candidate rule

This handoff is a Backend evidence document only. It does not confer Manager acceptance.

`BACKEND_PART_2_ACCEPTANCE_CANDIDATE = YES` is valid only if the permanent Part-2 workflow on the exact final HEAD containing this handoff passes all required gates and produces an artifact whose manifest binds:

- exact `sha` = final HEAD;
- accepted Part-1 ancestor;
- final test totals/files;
- `PART2_SOURCE_MATRIX=PASS kinds=11 ...`;
- exact source ZIP SHA-256;
- SHA-256 of this handoff.

If the exact-final-head workflow or artifact cross-check fails, candidate status remains `NO` until a narrow fix and exact-head rerun succeed.

No Part 3 work is authorized by this document.