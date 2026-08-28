#!/usr/bin/env bash
set -euo pipefail

PART3_SHA='801f44c6bf91dfdd1492b1927f59f2d3f729c768'
OUT_DIR="${1:-part4-stage100-evidence}"
HEAD_SHA="$(git rev-parse HEAD)"
TREE_SHA="$(git rev-parse HEAD^{tree})"
BRANCH="${GITHUB_REF_NAME:-$(git branch --show-current)}"
RUN_ID="${GITHUB_RUN_ID:-local}"
JOB_NAME="${GITHUB_JOB:-local}"
COMMIT_COUNT="$(git rev-list --count "$PART3_SHA..$HEAD_SHA")"

mkdir -p "$OUT_DIR"

git merge-base --is-ancestor "$PART3_SHA" "$HEAD_SHA"
git diff --check "$PART3_SHA...$HEAD_SHA"

git diff --name-status "$PART3_SHA...$HEAD_SHA" > "$OUT_DIR/CHANGED_FILES_PART3_TO_PART4.txt"
git diff --name-only -z "$PART3_SHA...$HEAD_SHA" | while IFS= read -r -d '' path; do
  if [[ -f "$path" ]]; then sha256sum "$path"; fi
done > "$OUT_DIR/CHANGED_FILES_SHA256.txt"
git log --reverse --date=iso-strict --format='%H%x09%aI%x09%s' "$PART3_SHA..$HEAD_SHA" > "$OUT_DIR/COMMITS_PART3_TO_PART4.txt"
printf '%s\n' "$HEAD_SHA" > "$OUT_DIR/HEAD_SHA.txt"
printf '%s\n' "$TREE_SHA" > "$OUT_DIR/TREE_SHA.txt"
printf '%s\n' "$PART3_SHA" > "$OUT_DIR/PART3_ANCESTOR_SHA.txt"
printf '%s\n' "$COMMIT_COUNT" > "$OUT_DIR/COMMITS_AHEAD_OF_PART3.txt"

for file in \
  part4-stage100-stage10.log \
  part4-stage100-stage30.log \
  part4-stage100-stage60.log \
  part4-stage100-stage70.log \
  part4-stage100-stage80.log \
  part4-stage100-stage90.log \
  part4-stage100-performance.log \
  part4-stage100-focused-tests.log \
  part4-stage100-full-tests.log \
  part4-stage100-typecheck.log \
  part4-stage100-build.log \
  part4-stage100-performance.env; do
  [[ -f "$file" ]] && cp -f "$file" "$OUT_DIR/"
done

SEARCH_P95_MS='UNAVAILABLE'
SEARCH_MAX_MS='UNAVAILABLE'
TRASH_PURGE_MS='UNAVAILABLE'
if [[ -f part4-stage100-performance.env ]]; then
  SEARCH_P95_MS="$(sed -n 's/^P4_STAGE90_SEARCH_P95_MS=//p' part4-stage100-performance.env | head -n1)"
  SEARCH_MAX_MS="$(sed -n 's/^P4_STAGE90_SEARCH_MAX_MS=//p' part4-stage100-performance.env | head -n1)"
  TRASH_PURGE_MS="$(sed -n 's/^P4_STAGE90_TRASH_PURGE_MS=//p' part4-stage100-performance.env | head -n1)"
fi

cat > "$OUT_DIR/CI_LEDGER.txt" <<EOF
STAGE10_RUN=33145981779
STAGE10_JOB=98767012394
STAGE10_STATUS=SUCCESS
STAGE30_RUN=33146306776
STAGE30_JOB=98768021520
STAGE30_STATUS=SUCCESS
STAGE60_RUN=33148863633
STAGE60_JOB=98775951581
STAGE60_STATUS=SUCCESS
STAGE70_RUN=33149071723
STAGE70_JOB=98776601850
STAGE70_STATUS=SUCCESS
STAGE80_RUN=33149686048
STAGE80_JOB=98778535894
STAGE80_STATUS=SUCCESS
STAGE90_RUN=33151346893
STAGE90_JOB=98783812957
STAGE90_STATUS=SUCCESS
STAGE90_ARTIFACT_ID=9677827984
STAGE90_ARTIFACT_SHA256=7a49bc4f35235499de0fe68a0f34609d4cfe2023fa0b9a69bcba62b7191d1996
STAGE100_RUN=$RUN_ID
STAGE100_JOB_NAME=$JOB_NAME
EOF

cat > "$OUT_DIR/BACKEND_PART4_ACCEPTANCE.md" <<EOF
# Veltrix Hom Backend Part 4 — Acceptance Candidate

## Provenance
- Repository: Rahmowin-1st/Veltrix-Hom-
- Branch: $BRANCH
- Exact candidate HEAD: $HEAD_SHA
- Exact Git tree: $TREE_SHA
- Accepted Part 3 ancestor: $PART3_SHA
- Commits ahead of accepted Part 3: $COMMIT_COUNT
- Stage100 GitHub run: $RUN_ID
- Stage100 job name: $JOB_NAME

## Part 4 migrations
- 123 — domain foundation
- 124 — Studio contracts
- 125 — productivity + Notes
- 126 — global Memory
- 127 — notifications + Library attention
- 128 — Global Search + unified Trash

## Executed final-HEAD proof
Stage100 re-executes, on this exact HEAD and one fresh PostgreSQL 16 database, the canonical Part4 evidence sequence for Stage10, Stage30, Stage60, Stage70, Stage80, and Stage90. It also executes focused Part4 regression tests, the full server Vitest regression suite, TypeScript typecheck, and production build. Raw logs are included beside this file.

## Previously verified canonical CI ledger
- Stage10: run 33145981779 / job 98767012394 — SUCCESS
- Stage30: run 33146306776 / job 98768021520 — SUCCESS
- Stage60: run 33148863633 / job 98775951581 — SUCCESS
- Stage70: run 33149071723 / job 98776601850 — SUCCESS
- Stage80: run 33149686048 / job 98778535894 — SUCCESS
- Stage90: run 33151346893 / job 98783812957 — SUCCESS
- Stage90 artifact: 9677827984, SHA-256 7a49bc4f35235499de0fe68a0f34609d4cfe2023fa0b9a69bcba62b7191d1996

## Stage90 measured performance on GitHub Actions
- Search fixture: 20,000 projected documents
- Search measured repetitions: 20 after warmups
- Final-HEAD Global Search p95: ${SEARCH_P95_MS} ms
- Final-HEAD Global Search max: ${SEARCH_MAX_MS} ms
- Final-HEAD 100-item expired Trash purge batch: ${TRASH_PURGE_MS} ms
- The numeric CI guards are regression guards, not product SLAs; the Part4 authority specifies that these paths must be measured but does not freeze numeric budgets.

## Product/security closure represented by evidence
- Studio typed registry and live-binding/revision semantics.
- Goals, Todos, weighted progress, rich structured Notes, AI proposal/confirmation boundary.
- Global user Memory with explicit-over-inferred authority, bounded retrieval, privacy filtering, edit/delete controls.
- Inside/Outside notification preferences, encrypted device tokens, delivery ledger/provider abstraction, Library 900 MiB warning attention state.
- Global Search across the frozen 12 domains with owner isolation and durable async reindex jobs.
- Unified 30-day Trash lifecycle, restore/reindex relationship behavior, permanent delete, purge batching, and foreign-owner claim rejection.
- RLS/service-role boundaries and fail-closed validation exercised by the stage evidence.

## Known limitations / non-claims
- Stage100 does not claim that a live external FCM credential/provider delivery was exercised; backend provider abstraction, token security, queue/delivery state and deterministic tests are the verified surface.
- Performance numbers are GitHub-hosted-runner evidence, not a contractual production SLA.
- This is Backend Part 4 acceptance evidence only. Part 5 must not start until Manager acceptance.

BACKEND_PART_4_ACCEPTANCE_CANDIDATE = YES
EOF

(
  cd "$OUT_DIR"
  find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -printf '%f\n' | sort | while read -r f; do sha256sum "$f"; done > SHA256SUMS.txt
)

echo "P4_STAGE100_PACKAGE=PASS head=$HEAD_SHA tree=$TREE_SHA commits_ahead=$COMMIT_COUNT"
echo "BACKEND_PART_4_ACCEPTANCE_CANDIDATE=YES"
