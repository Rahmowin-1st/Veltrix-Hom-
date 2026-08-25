# Veltrix Hom Backend Part 2 — Architecture / Contract Delta

Authority: canonical Product Freeze SHA-256 `65ae6a2bd6a5387c2ce7bf36a51c55c840af661e2733cd975d5dcbd04453e798`.
Accepted Part 1 ancestor: `72e34dc1d2e23131bd8e505f7ed53ede15ab464c`.
Boundary: backend only. Part 1 auth/session/storage/quota/AI/router/security contracts remain accepted and unchanged.

## Canonical Part 2 graph

- `vh_projects`: largest workspace identity; name required, icon/accent/purpose optional, archive/trash/revision.
- `vh_library_assets`: universal per-owner asset record backed by private `vh-library` storage object where binary exists.
- `vh_asset_usages`: origin/context provenance when the same asset is reused by later surfaces.
- `vh_ingest_sessions`: upload authorization → verification → dedup/create → processing queue lifecycle.
- `vh_project_references`: relationship only; binary remains owned by Library; atomic 20 item / 50 MiB cap.
- `vh_library_tags` + `vh_library_asset_tags`: owner-created normalized tags, many-to-many.
- `vh_library_collections` + `vh_collection_assets`: organization only; file/image assets only.
- `vh_notebooks`: research/learning knowledge base with flexible `ai_config` container.
- `vh_project_notebooks`: many-to-many Project↔Notebook relation.
- `vh_notebook_sources`: Add-from-Library relation with plan-configurable count/byte caps.
- `vh_source_chunks`: recreatable derived chunks with exact source revision, locator, range/hash, extraction version and optional embedding metadata.
- `vh_research_sessions` + `vh_research_candidates`: durable Fast/Deep Research history; candidates are not Library/Notebook sources until explicit Add.

## Ingestion invariant

1. canonical opaque session resolves owner;
2. rate-limit;
3. Part 1 Library quota reservation;
4. owner-prefixed private upload ticket;
5. worker downloads exact object and verifies actual byte size, SHA-256 and detected MIME;
6. same-owner hash dedup reuses Library asset and releases duplicate reservation/storage;
7. otherwise Library asset is created, quota committed once, and processing job is queued;
8. failures release reservations and mark safe failure state.

Cross-owner dedup is forbidden.

## Query / pagination invariant

Library query is owner-scoped before filters. Cursor is opaque, HMAC-bound to normalized query fingerprint, sort key/direction and deterministic `id` tie-breaker. Incompatible cursor/query is rejected.

## Knowledge retrieval invariant

Notebook retrieval is scoped through enabled `vh_notebook_sources` belonging to the same owner and an active Notebook. Search hits always return source/chunk provenance. Optional semantic reranking never expands source scope.

Project search scope is the union of Project References and sources of Notebooks explicitly linked to that Project.

## Research trust boundary

Search-provider candidates are review metadata only. Deep Research may generate a report from persisted candidate evidence, but no candidate becomes trusted knowledge automatically. Explicit Add fetches the public HTTP(S) source through SSRF controls, ingests it through Library quota/dedup rules, links it to the Notebook, and preserves discovery provenance.

## Security

All canonical Part 2 tables use RLS and are denied to `public`, `anon`, and `authenticated`; service-role only. API methods must filter every canonical query by owner. SECURITY DEFINER RPCs fix `search_path` and are execute-revoked from client roles.

## Trash

Project, Notebook, Library asset and Collection use 30-day Trash. Asset binary state follows the Library asset. Permanent purge must remove derived chunks/relations before storage object deletion and reconcile Library usage.

## Deferred by authority

- Conversation/Fast Ask integrations: Part 3.
- Full Studio implementation: Part 4; Part 2 only exposes stable Notebook/source/provenance contracts.
- Production Render promotion: intentionally deferred by Manager acceptance instruction.
