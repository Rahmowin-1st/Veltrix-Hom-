#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required}" "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
ROOT=$GITHUB_WORKSPACE
OUT=$ROOT/server/stage90-evidence
rm -rf "$OUT"; mkdir -p "$OUT/reports"
test "$(git -C "$ROOT" rev-parse HEAD)" = "$GITHUB_SHA"
test "$(git -C "$ROOT" rev-parse 4ca7eb8631ca47626da521e4645638813c7c0168)" = 4ca7eb8631ca47626da521e4645638813c7c0168
git -C "$ROOT" merge-base --is-ancestor 4ca7eb8631ca47626da521e4645638813c7c0168 "$GITHUB_SHA"

REPORTS=(part3-stage90-migrations.log part3-stage90-adversarial.log part3-stage90-security.log part3-stage90-performance.log part3-stage90-unit.log part3-stage90-regression.log part3-stage90-typecheck.log part3-stage90-build.log)
for report in "${REPORTS[@]}"; do test -s "$report"; cp "$report" "$OUT/reports/"; done
grep -q 'PART3_STAGE90_RACES=PASS' part3-stage90-adversarial.log
grep -q 'PART3_SECURITY=PASS tables=14' part3-stage90-security.log
grep -q 'PART3_STAGE90_PERFORMANCE=PASS' part3-stage90-performance.log

git -C "$ROOT" archive --format=tar.gz --output="$OUT/source-${GITHUB_SHA}.tar.gz" "$GITHUB_SHA"
git -C "$ROOT" diff --name-status 4ca7eb8631ca47626da521e4645638813c7c0168 "$GITHUB_SHA" > "$OUT/changed-files.txt"
cat > "$OUT/provenance.txt" <<EOF
repository=Rahmowin-1st/Veltrix-Hom-
implementation_sha=$GITHUB_SHA
tranche2_base=4ca7eb8631ca47626da521e4645638813c7c0168
stage80_base=fc25b2312f4aca599b8e6e57732fede2992de2b2
github_run_id=${GITHUB_RUN_ID:-unavailable}
github_job=${GITHUB_JOB:-unavailable}
node=$(node --version)
postgres=$(psql -X -qAt -c 'show server_version')
EOF
(cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
test -s "$OUT/SHA256SUMS"; (cd "$OUT" && sha256sum -c SHA256SUMS)
sha256sum "$OUT/SHA256SUMS" > "$OUT/HANDOFF_SHA256"
test -s "$OUT/HANDOFF_SHA256"
