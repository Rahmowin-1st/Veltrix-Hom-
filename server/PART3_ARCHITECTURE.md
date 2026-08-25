# Veltrix Hom Backend Part 3 — Architecture / Contract Delta

Authority: canonical Product Freeze SHA-256 `65ae6a2bd6a5387c2ce7bf36a51c55c840af661e2733cd975d5dcbd04453e798`.
Accepted Part 2 base: `8553ea370dc9a4813ae4e3bbcf9b241ebd435f80`.
Boundary: BACKEND ONLY. Accepted Part 1/2 contracts remain immutable unless a strictly necessary additive Part 3 relation is required.

## Canonical Part 3 graph

- `vh_conversations`: first-class persistent Conversation, optional Project, auto/user title source, pin/archive/trash, revision.
- `vh_conversation_notebooks`: unlimited business-semantic many-to-many Conversation↔Notebook relation with paginated APIs.
- Conversation permanent Reference is stored on `vh_conversations` as `permanent_reference_asset_id` plus immutable `permanent_reference_set_at`. Asset purge may null the asset FK while the set marker/tombstone remains, preventing replacement.
- `vh_conversation_messages`: durable user/assistant messages with explicit partial/final state, request/idempotency identity, safe search text, route metadata, usage and provenance.
- `vh_message_attachments`: Add-from-Library relation; atomic 5 item / 10 MiB combined cap per message.
- `vh_stream_events`: versioned monotonic typed event buffer for resume/reconnect and evidence; final structured blocks live on the assistant message only after validation.
- `vh_conversation_tags` + `vh_conversation_tag_links`: manual owner-controlled tags only.
- `vh_interactive_test_answers`: server-scored persisted inline test selections.
- `vh_fast_ask_sessions` + `vh_fast_ask_attachments`: short-lived one-shot interaction state; no Conversation exists until atomic conversion.
- `vh_tool_runs`: extensible Calculator/Translate/Solve/Summarize run object with typed input/output/provenance.

## Context resolution order

1. permanent Conversation Reference;
2. Project References;
3. attached Notebooks;
4. current-message attachments;
5. Conversation history;
6. `global_memory_context` extension point only (Part 4 implementation deferred).

Context selection is relevance-based. The resolver records actually-used source/chunk provenance and never expands owner scope.

## Streaming / persistence invariant

- Client submits one idempotent user turn.
- Backend creates exactly one user message and one assistant message shell.
- Every stream event has protocol version, monotonic sequence, request/message ids, optional block id/type/version and timestamp.
- In-progress block fragments may exist in `vh_stream_events`; malformed/half-valid structured blocks are never marked final in `vh_conversation_messages.content_blocks`.
- Completion validates the whole block array, persists it, marks assistant message `COMPLETED`, then emits `message.completed`.
- Failure/cancel marks assistant message accordingly and keeps resumable diagnostic event history without pretending finality.

## Typed blocks

Registry version `1` supports: answer, explanation, quote, note_proposal, todo_proposal, goal_proposal, checklist, code, function, formula, table, map, timeline, template, steps, warning, definition, example, citation, writing, file_preview, studio_artifact_preview, interactive_test.
Unknown future block types/versions are preserved as inert `unknown` data on read but cannot be executed or persisted as validated current-version blocks.

Writing is structured JSON, never arbitrary HTML/CSS/JS. Code is data only. Map node/edge counts and template/document sizes are bounded.

## Fast Ask invariant

Fast Ask session is temporary and expires. New binary uploads still enter Library. `Switch to Conversation` is one atomic/idempotent database operation that creates one Conversation, persists original user/assistant messages, copies attachment relations, and records the resulting Conversation id on the Fast Ask session.

## Explore tools

Server registry owns availability and schemas. Calculator is deterministic and never uses eval. Translate/Solve/Summarize route through the canonical AI Router. Solve `HELP_ME_SOLVE` receives a post-generation validator that rejects answer-like leakage rather than silently returning a final answer.

## Security

All new canonical tables use service-role-only direct persistence with RLS enabled and client-role DML revoked. Composite owner FKs prevent cross-owner relations even under service-role access. Permanent Reference immutability and attachment limits are database/RPC invariants, not UI-only checks.

## Deferred

- Full Goal/Todo/Note persistence domain: Part 4; Part 3 proposal blocks stop at typed `USER_CONFIRMED` service boundary.
- Full Memory Engine: Part 4; only extension point exists.
- Studio artifact generation: Part 4; preview block remains placeholder.
- Frontend/Android UI: not implemented here.
- Production Render promotion: intentionally deferred.
