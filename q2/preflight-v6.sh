#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$GITHUB_WORKSPACE"
mkdir -p "$ROOT/preflight" "$ROOT/provenance"
trap 'printf "preflight_failed_line=%s\n" "$LINENO" > "$ROOT/preflight/failure.txt"' ERR

printf '\n=== Q2 PREFLIGHT: exact accepted source ===\n'
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/9129072133/zip" > "$ROOT/provenance/baseline-artifact.zip"
echo 'f3d612dd35cd58d024128e93d3c8bc04e0be297e85e307b71956aa0e4d5604f0  provenance/baseline-artifact.zip' | (cd "$ROOT" && sha256sum -c -)
unzip -q "$ROOT/provenance/baseline-artifact.zip" -d "$ROOT/provenance/baseline"
echo 'd7b3a796adf39308a94da4acc58cd0d0ad8ff463372e00cae1714738f5de6029  provenance/baseline/VeltrixCalculator-Frontend-MAX-PRO-TESTED-SOURCE.zip' | (cd "$ROOT" && sha256sum -c -)
rm -rf "$ROOT/preflight-project"
mkdir -p "$ROOT/preflight-project"
unzip -q "$ROOT/provenance/baseline/VeltrixCalculator-Frontend-MAX-PRO-TESTED-SOURCE.zip" -d "$ROOT/preflight-project"
cp "$ROOT/provenance/baseline/core-before.sha256" "$ROOT/provenance/core-before.sha256"
cp "$ROOT/provenance/baseline/app-boundaries-before.sha256" "$ROOT/provenance/app-boundaries-before.sha256"
cat "$ROOT"/q2/patch2/part_00 "$ROOT"/q2/patch2/part_01 "$ROOT"/q2/patch2/part_02 "$ROOT"/q2/patch2/part_03 "$ROOT"/q2/patch2/part_04 "$ROOT"/q2/patch2/part_05 "$ROOT"/q2/patch2/part_06 > "$ROOT/provenance/q2.patch"

PROJECT="$ROOT/preflight-project/VeltrixCalculator"
cd "$PROJECT"
patch -p3 < "$ROOT/provenance/q2.patch"
patch -p1 < "$ROOT/q2/gesture-arch-fix.patch"
patch -p1 < "$ROOT/q2/completion-ui.patch"
patch -p1 < "$ROOT/q2/graph-tags-v2.patch"
sha256sum -c "$ROOT/provenance/core-before.sha256"
sha256sum -c "$ROOT/provenance/app-boundaries-before.sha256"
test "$(grep -c 'setContentView(' app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt)" -eq 1
grep -q 'BrainGestureLayout' app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt
grep -q 'polynomial_degree_lens' app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt
grep -q 'library_subject_lens' app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt
grep -q 'keyboard.visibility = if (focused) View.VISIBLE else View.GONE' app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt
grep -q 'tag = "graph_plot"' app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt
grep -q 'RuntimeShader' app/src/main/kotlin/com/veltrix/calculator/app/frontend/glass/GlassMaterialRenderer.kt
grep -q 'Convex-lens center magnification' app/src/main/kotlin/com/veltrix/calculator/app/frontend/glass/GlassMaterialRenderer.kt

printf '\n=== Q2 PREFLIGHT: final evidence sources ===\n'
cp "$ROOT"/q2/final-tests/*.kt app/src/androidTest/kotlin/com/veltrix/calculator/app/
patch -p1 < "$ROOT/q2/final-tests-hotfix.patch"
patch -p1 < "$ROOT/q2/final-tests-graph-hotfix.patch"
EVID=app/src/androidTest/kotlin/com/veltrix/calculator/app/FrontendQ2FinalEvidenceTest.kt
PERF=app/src/androidTest/kotlin/com/veltrix/calculator/app/FrontendQ2PerformanceRuntimeTest.kt
MOTION=app/src/androidTest/kotlin/com/veltrix/calculator/app/FrontendQ2MotionEvidenceTest.kt
grep -q 'MethodSorters.NAME_ASCENDING' "$EVID"
grep -q 'physics-ohms-law' "$EVID"
grep -q 'finance-compound-interest' "$EVID"
grep -q 'field_rhs' "$EVID"
grep -q 'refreshHistoryScreen' "$EVID"
grep -q 'renderLibrary' "$EVID"
grep -q 'runCatching.*deleteAppWidgetId' "$EVID"
grep -q 'key__' "$PERF"
grep -q 'renderLibrary' "$PERF"
grep -q 'key__' "$MOTION"
grep -q 'graph_plot' "$MOTION"
! grep -q 'key_equals' "$PERF"
! grep -q 'openTool(scenario, "ohms-law")' "$EVID"
! grep -q 'openTool(scenario, "compound-interest")' "$EVID"

printf '\n=== Q2 PREFLIGHT: compile exact final harness ===\n'
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platforms;android-36" "build-tools;35.0.0" "platform-tools" >/dev/null
gradle :core:test :app:assembleDebug :app:assembleDebugAndroidTest 2>&1 | tee "$ROOT/preflight/compile.txt"
grep -q 'BUILD SUCCESSFUL' "$ROOT/preflight/compile.txt"
test -s app/build/outputs/apk/debug/app-debug.apk
find app/build/outputs/apk/androidTest -name '*androidTest.apk' -type f -size +0c | grep -q .
sha256sum -c "$ROOT/provenance/core-before.sha256"
sha256sum -c "$ROOT/provenance/app-boundaries-before.sha256"
printf 'preflight=PASS\ncommit=%s\n' "$GITHUB_SHA" | tee "$ROOT/preflight/result.txt"
