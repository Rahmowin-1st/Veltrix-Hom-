#!/usr/bin/env bash
set -euo pipefail

BASE_SHA='b60a20ff286443ae6f1918cd7323cc8aa2e970f2'
OUT_DIR="${1:-part5-final-evidence}"
HEAD_SHA="$(git rev-parse HEAD)"
TREE_SHA="$(git rev-parse HEAD^{tree})"
BRANCH="${GITHUB_REF_NAME:-$(git branch --show-current)}"
RUN_ID="${GITHUB_RUN_ID:-local}"
JOB_NAME="${GITHUB_JOB:-local}"
SOURCE_ARCHIVE="source-${HEAD_SHA}.tar.gz"

mkdir -p "$OUT_DIR"

git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA"
git diff --check "$BASE_SHA...$HEAD_SHA"
[[ -s PART5_CANONICAL_FREEZE_LEDGER.md ]]
grep -Fq "$BASE_SHA" PART5_CANONICAL_FREEZE_LEDGER.md

printf '%s\n' "$HEAD_SHA" > "$OUT_DIR/HEAD_SHA.txt"
printf '%s\n' "$TREE_SHA" > "$OUT_DIR/TREE_SHA.txt"
printf '%s\n' "$BASE_SHA" > "$OUT_DIR/ACCEPTED_PART4_BASE_SHA.txt"
printf '%s\n' "$BRANCH" > "$OUT_DIR/BRANCH.txt"
printf '%s\n' "$RUN_ID" > "$OUT_DIR/CI_RUN_ID.txt"
printf '%s\n' "$JOB_NAME" > "$OUT_DIR/CI_JOB_NAME.txt"

git diff --name-status "$BASE_SHA...$HEAD_SHA" > "$OUT_DIR/CHANGED_FILES_PART4_TO_PART5.txt"
git diff --name-only -z "$BASE_SHA...$HEAD_SHA" | while IFS= read -r -d '' path; do
  [[ -f "$path" ]] && sha256sum "$path"
done > "$OUT_DIR/CHANGED_FILES_SHA256.txt"
git log --reverse --date=iso-strict --format='%H%x09%aI%x09%s' "$BASE_SHA..$HEAD_SHA" > "$OUT_DIR/COMMITS_PART4_TO_PART5.txt"
cp PART5_CANONICAL_FREEZE_LEDGER.md "$OUT_DIR/"

find src/db -maxdepth 1 -type f -name 'migration-*.sql' -printf '%f\n' | sort -V > "$OUT_DIR/MIGRATION_FILES.txt"
for n in $(seq 100 129); do
  grep -Eq "^migration-${n}(-|\\.)" "$OUT_DIR/MIGRATION_FILES.txt" || {
    echo "PART5_REQUIRED_MIGRATION_MISSING=$n" >&2
    exit 1
  }
done

for file in \
  part5-ancestry.log \
  part5-fresh-migrations.log \
  part5-upgrade-migrations.log \
  part5-part1-tests.log \
  part5-part2-tests.log \
  part5-part3-core.log \
  part5-part3-fast-ask.log \
  part5-part3-history.log \
  part5-part3-interactions.log \
  part5-part3-stream.log \
  part5-part3-tools.log \
  part5-part3-security.log \
  part5-part3-adversarial.log \
  part5-part3-performance.log \
  part5-part4-stage10.log \
  part5-part4-studio.log \
  part5-part4-studio-lifecycle.log \
  part5-part4-productivity.log \
  part5-part4-memory.log \
  part5-part4-notifications.log \
  part5-part4-search-trash.log \
  part5-part4-performance.log \
  part5-ai-router.log \
  part5-full-tests.log \
  part5-typecheck.log \
  part5-build.log \
  part5-secret-scan.log \
  part5-contract-manifest.log; do
  [[ -s "$file" ]] || { echo "PART5_REQUIRED_EVIDENCE_MISSING=$file" >&2; exit 1; }
  cp "$file" "$OUT_DIR/"
done

# The exact source archive comes from the tested commit object, never a mutable workspace.
git archive --format=tar.gz --prefix="Veltrix-Hom-${HEAD_SHA}/" -o "$OUT_DIR/$SOURCE_ARCHIVE" "$HEAD_SHA"
SOURCE_SHA256="$(sha256sum "$OUT_DIR/$SOURCE_ARCHIVE" | awk '{print $1}')"
printf '%s  %s\n' "$SOURCE_SHA256" "$SOURCE_ARCHIVE" > "$OUT_DIR/SOURCE_ARCHIVE_SHA256.txt"

cat > "$OUT_DIR/PART5_CI_CANDIDATE.md" <<EOF
# Veltrix Hom Backend Part 5 — Exact CI Candidate Evidence

Repository: Rahmowin-1st/Veltrix-Hom-
Branch: $BRANCH
Accepted Part 4 base: $BASE_SHA
Exact candidate HEAD: $HEAD_SHA
Exact Git tree: $TREE_SHA
GitHub Actions run: $RUN_ID
Job name: $JOB_NAME
Exact source archive: $SOURCE_ARCHIVE
Exact source archive SHA-256: $SOURCE_SHA256

This package proves the final-source CI/integration surface only. Live Supabase upgrade state and exact production-like deployment revision are provider-side gates and are not silently inferred from CI.

PART5_CI_CANDIDATE = PASS
BACKEND_FINAL_ACCEPTANCE_CANDIDATE = PENDING_PROVIDER_GATES
EOF

cat > "$OUT_DIR/EVIDENCE_MANIFEST.txt" <<EOF
B5-01=PART5_CANONICAL_FREEZE_LEDGER.md + part5-ancestry.log
B5-02=part5-ancestry.log
B5-03=part5-fresh-migrations.log + part5-upgrade-migrations.log
B5-04=part5-part1-tests.log
B5-05=part5-part1-tests.log + part5-part2-tests.log
B5-06=part5-part1-tests.log
B5-07=part5-part2-tests.log
B5-08=part5-part2-tests.log
B5-09=part5-part2-tests.log
B5-10=part5-part3-core.log + part5-part3-history.log
B5-11=part5-part3-fast-ask.log
B5-12=part5-part3-core.log + part5-full-tests.log
B5-13=part5-part3-tools.log
B5-14=part5-part4-studio.log + part5-part4-studio-lifecycle.log
B5-15=part5-part4-productivity.log
B5-16=part5-part4-productivity.log
B5-17=part5-part4-productivity.log
B5-18=part5-part4-memory.log
B5-19=part5-part4-notifications.log
B5-20=part5-part4-search-trash.log
B5-21=part5-part4-search-trash.log
B5-22=part5-ai-router.log
B5-23=part5-part3-security.log + part5-part3-adversarial.log + part5-part4-search-trash.log
B5-24=part5-part1-tests.log + part5-full-tests.log
B5-25=part5-part3-performance.log + part5-part4-performance.log
B5-26=part5-full-tests.log + part5-ai-router.log
B5-28=HEAD_SHA.txt + SOURCE_ARCHIVE_SHA256.txt + SHA256SUMS.txt
EOF

(
  cd "$OUT_DIR"
  find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -printf '%f\n' | sort | while read -r f; do sha256sum "$f"; done > SHA256SUMS.txt
  sha256sum -c SHA256SUMS.txt
  tar -tzf "$SOURCE_ARCHIVE" >/dev/null
)

echo "PART5_SOURCE_ARCHIVE_SHA256=$SOURCE_SHA256"
echo "PART5_PACKAGE=PASS head=$HEAD_SHA tree=$TREE_SHA"
echo 'PART5_CI_CANDIDATE=PASS'
