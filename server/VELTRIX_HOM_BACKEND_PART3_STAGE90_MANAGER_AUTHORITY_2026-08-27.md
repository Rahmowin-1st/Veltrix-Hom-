# Veltrix Hom Backend Part 3 — Stage90 Manager Authority

Date: 2026-08-27
Status: CONTINUATION — NOT RESTART
Canonical execution mission: GitHub Issue #14

This document is later Manager authority and supersedes conflicting Stage90 checkpoint wording only. It does not reopen or redo verified Stage10–80 work.

## KEEP / scope

- Repository: `Rahmowin-1st/Veltrix-Hom-`
- Stage90 branch: `veltrix-hom-backend-part3-stage90-work`
- Starting Stage90 checkpoint HEAD: `9cfa9b0f04a92f869a93a00f689b6ccd0cd5574f`
- Exact verified Stage80 implementation base: `fc25b2312f4aca599b8e6e57732fede2992de2b2`
- Accepted Part2 ancestor: `8553ea370dc9a4813ae4e3bbcf9b241ebd435f80`
- KEEP Stage10–80.
- Do not start Part4.
- D6 cursor/keyset pagination is REMOVED FROM Stage90 scope. Do not implement it solely for Stage90.

## Product-contract provenance

Manager source `03_VELTRIX_HOM_BACKEND_PART3_CONVERSATIONS_FASTASK_TOOLS.md` has SHA-256:
`c1f719c77c287a35e7e281d7fb28acd3290b8ac4d349acc012da9a9d48b60a8c`

For Stage90 execution, current GitHub Issue #14 plus this later Manager authority are the repo-resolvable execution authority. Do not infer new product scope from older checkpoint text.

## Required implementation defects

- D1 — Fast Ask converted replay HTTP title/result consistency.
- D2 — completed-but-unconverted Fast Ask expiry semantics.
- D3 — HELP_ME_SOLVE final-answer leakage hardening.
- D4 — deterministic provider timeout for Translate/Solve/Summarize.
- D5 — primary/fallback provider circuit isolation.
- D7 — completed authoritative idempotent replay before AI-tool execution rate limiting.

## Security correction — 14 Part3 tables

Codex review exposed a stale count of 13. Stage90 security proof MUST cover the complete Part3 table surface from migrations 115–121, currently 14 tables, including `vh_fast_ask_stream_events` from migration 120, plus every Part3 RPC/function privilege boundary.

The proof must enumerate the actual tables/RPCs from source at execution time rather than hardcoding only the old 13-table inventory. Required expectations include owner isolation, RLS where applicable, client privilege revocation, service-role-only RPC execution where frozen, hostile cross-owner attempts, and no false-green omission of newly added Part3 tables.

## Performance gate — frozen measurable budget

Use the same CI class as existing backend evidence: GitHub Actions Ubuntu runner, PostgreSQL 16 localhost, Node 22. External AI-provider/network latency is excluded; this gate measures deterministic Part3 database/API plumbing only.

Fixture minimums:
- 2 accounts for isolation checks;
- 500 conversations for owner A and 100 for owner B;
- at least 20,000 Conversation messages for owner A and 2,000 for owner B;
- at least 2,000 Fast Ask stream events across multiple sessions;
- at least 1,000 ToolRun rows including completed replay fixtures.

Measurement protocol:
- 2 warm-up executions per measured operation;
- 10 measured repetitions for latency metrics;
- 5 measured batches for concurrency metrics;
- concurrency batch size: 16 simultaneous operations;
- print fixture cardinalities, every measured sample or aggregate, p95, throughput where applicable, and explicit PASS/FAIL markers.

Fail-closed ceilings:
1. `vh_list_conversation_history` bounded page (`limit <= 100`): p95 <= 250 ms.
2. `vh_search_conversations` exact lexical search over the full fixture (`limit <= 20`): p95 <= 1500 ms.
3. Fast Ask event resume/read of up to 250 events from a 2,000+ event fixture: p95 <= 250 ms.
4. Completed Fast Ask idempotent replay, 16-way concurrency: p95 <= 500 ms and throughput >= 25 ops/s; exactly one logical session/result and no duplicate side effect.
5. Completed ToolRun idempotent replay, 16-way concurrency: p95 <= 500 ms and throughput >= 25 ops/s; no duplicate execution/side effect and one authoritative result.
6. Total Stage90 performance harness runtime <= 90 seconds on the specified CI class.

Any threshold miss is Stage90 RED. The harness may be stricter, but must not silently weaken these budgets.

## Adversarial proof still required

- streaming cancel-vs-complete races;
- stale-writer protection;
- malformed/partial provider output handling;
- hostile typed-block binding and existing depth/node/size caps;
- ToolRun retry/claim/ownership/isolation;
- complete 14-table + all-Part3-RPC security matrix;
- permanent fail-closed Stage90 CI tied to exact source SHA;
- exact source/evidence artifacts with hashes;
- Stage10–80 relevant regressions, Typecheck, tests and Build GREEN.

## Provenance clarification

The canonical GitHub branch ref/history is authoritative for acceptance. Synthetic/squashed review-environment commits are not accepted as replacement branch ancestry. Do not rewrite or force-push history merely to match a review sandbox commit shape. Verify actual branch refs and merge-base before final evidence.

Stage90 becomes GREEN only on one exact implementation SHA with complete executed proof.
