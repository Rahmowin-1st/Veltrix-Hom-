#!/usr/bin/env bash
set -euxo pipefail

PROD_BASE=876da378e80ba79a6db649e5af20e63f10201b04
BASELINE=544d7e8f8afefcd8a0a61724a4f3c525078181ce
OUT="$RUNNER_TEMP/v4-route-tail"
H="$OUT/handoff"
mkdir -p "$OUT" "$H/evidence" "$H/docs"

test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
git merge-base --is-ancestor "$BASELINE" "$SOURCE_SHA"
git merge-base --is-ancestor "$PROD_BASE" "$SOURCE_SHA"
CHANGED="$(git diff --name-only "$PROD_BASE" "$SOURCE_SHA")"
printf '%s\n' "$CHANGED" | tee "$OUT/descendant-delta.txt"
test -z "$(printf '%s\n' "$CHANGED" | grep -Ev '^(\.github/workflows/|\.ci/)' || true)"
grep -q 'PERSISTED_ROUTE = "v4.persisted.route"' calculator-v4/app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt
printf 'source_sha=%s\nprod_base=%s\nrun_id=%s\njob=%s\n' "$SOURCE_SHA" "$PROD_BASE" "$GITHUB_RUN_ID" "$GITHUB_JOB" | tee "$OUT/provenance.txt"

pushd calculator-v4
gradle --stacktrace :core:test :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest
APP=app/build/outputs/apk/debug/app-debug.apk
TEST=$(find app/build/outputs/apk/androidTest -name '*androidTest.apk' -type f | head -1)
test -s "$APP"; test -s "$TEST"
test "$(tail -n +3 core/build/registry-export.tsv | wc -l)" -eq 260
diff -u docs/SUBJECT_COVERAGE_MATRIX.tsv core/build/subject-coverage-matrix.tsv
diff -u docs/SOLVE_TARGET_MATRIX.tsv core/build/solve-target-matrix.tsv
sha256sum "$APP" "$TEST" core/build/registry-export.tsv core/build/subject-coverage-matrix.tsv core/build/solve-target-matrix.tsv | tee "$OUT/build-hashes.sha256"
popd

"$SDKMANAGER" "platforms;android-36" "build-tools;35.0.0" "platform-tools" "emulator" "system-images;android-35;google_apis;x86_64" >/dev/null
test -x "$ADB"; test -x "$EMULATOR"; test -x "$AVDMANAGER"
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=kvm
mkdir -p "$ANDROID_AVD_HOME"
echo no | "$AVDMANAGER" create avd -n veltrix_route_tail_v3 -k "system-images;android-35;google_apis;x86_64" -f
nohup "$EMULATOR" @veltrix_route_tail_v3 -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -no-snapshot -no-metrics -accel on > "$OUT/emulator.log" 2>&1 &
timeout 180 "$ADB" wait-for-device
for i in $(seq 1 120); do
  [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
  sleep 2
done
test "$("$ADB" shell getprop sys.boot_completed | tr -d '\r')" = 1
"$ADB" devices -l | tee "$OUT/device.txt"
APP=calculator-v4/app/build/outputs/apk/debug/app-debug.apk
TEST=$(find calculator-v4/app/build/outputs/apk/androidTest -name '*androidTest.apk' -type f | head -1)
"$ADB" install -r -t "$APP" | tee "$OUT/install-app.txt"
"$ADB" install -r -t "$TEST" | tee "$OUT/install-test.txt"
"$ADB" shell am force-stop com.veltrix.calculator
"$ADB" shell am start -W -n com.veltrix.calculator/com.veltrix.calculator.app.MainActivity | tee "$OUT/cold-launch.txt"
grep -q 'Status: ok' "$OUT/cold-launch.txt"

I=$("$ADB" shell pm list instrumentation | sed -n 's/^instrumentation:\([^ ]*\).*target=com.veltrix.calculator.*/\1/p' | head -1 | tr -d '\r')
test -n "$I"
for cls in V4NavigationRuntimeTest BackendMasterRuntimeTest; do
  "$ADB" shell am instrument -w -e class "com.veltrix.calculator.app.$cls" "$I" | tee "$OUT/$cls.txt"
  grep -q 'OK (' "$OUT/$cls.txt"
  ! grep -q 'FAILURES!!!' "$OUT/$cls.txt"
done
"$ADB" shell am instrument -w -e liveProbe true -e class com.veltrix.calculator.app.LiveCurrencyRuntimeTest "$I" | tee "$OUT/live-currency.txt"
grep -q 'OK (1 test)' "$OUT/live-currency.txt"

launch_uri(){ local uri="$1"; "$ADB" shell "am start -W -a android.intent.action.VIEW -d '$uri' com.veltrix.calculator"; }
restore_route(){
  local name="$1" uri="$2" detail="$3" parent="$4"
  "$ADB" shell am force-stop com.veltrix.calculator
  launch_uri "$uri" | tee "$OUT/$name-launch.txt"
  grep -q 'Status: ok' "$OUT/$name-launch.txt"
  sleep 1
  "$ADB" shell uiautomator dump "/sdcard/$name-before.xml" >/dev/null
  "$ADB" pull "/sdcard/$name-before.xml" "$OUT/$name-before.xml" >/dev/null
  grep -q "content-desc=\"$detail\"" "$OUT/$name-before.xml"
  "$ADB" shell input keyevent KEYCODE_HOME
  sleep 1
  PID="$("$ADB" shell pidof com.veltrix.calculator 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  test -n "$PID"
  printf 'case=%s\npre_pid=%s\n' "$name" "$PID" | tee "$OUT/$name-kill.txt"
  "$ADB" shell "run-as com.veltrix.calculator kill -9 $PID"
  for i in $(seq 1 40); do
    CUR="$("$ADB" shell pidof com.veltrix.calculator 2>/dev/null | tr -d '\r' || true)"
    case " $CUR " in *" $PID "*) sleep .25;; *) break;; esac
  done
  CUR="$("$ADB" shell pidof com.veltrix.calculator 2>/dev/null | tr -d '\r' || true)"
  printf 'post_pid_list=%s\n' "$CUR" | tee -a "$OUT/$name-kill.txt"
  case " $CUR " in *" $PID "*) exit 1;; esac
  "$ADB" shell am start -W --activity-reorder-to-front -n com.veltrix.calculator/com.veltrix.calculator.app.MainActivity | tee "$OUT/$name-restore.txt"
  grep -q 'Status: ok' "$OUT/$name-restore.txt"
  sleep 1
  "$ADB" shell uiautomator dump "/sdcard/$name-after.xml" >/dev/null
  "$ADB" pull "/sdcard/$name-after.xml" "$OUT/$name-after.xml" >/dev/null
  grep -q "content-desc=\"$detail\"" "$OUT/$name-after.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  sleep 1
  "$ADB" shell uiautomator dump "/sdcard/$name-parent.xml" >/dev/null
  "$ADB" pull "/sdcard/$name-parent.xml" "$OUT/$name-parent.xml" >/dev/null
  grep -q "content-desc=\"$parent\"" "$OUT/$name-parent.xml"
}
restore_route tool 'veltrix://tool/physics-ohms-law' 'route-tool-physics-ohms-law' 'route-workspace-library'
restore_route converter 'veltrix://converter/Length?from=km&to=mi&amount=100' 'route-converter-detail' 'route-workspace-converters'

launch_uri 'veltrix://home/standard-calculator?expression=6*7' | tee "$OUT/calc-launch.txt"
grep -q 'Status: ok' "$OUT/calc-launch.txt"
launch_uri 'veltrix://converter/Length?from=km&to=mi&amount=100' | tee "$OUT/converter-launch.txt"
grep -q 'Status: ok' "$OUT/converter-launch.txt"
sleep 1
"$ADB" shell uiautomator dump /sdcard/converter.xml >/dev/null
"$ADB" pull /sdcard/converter.xml "$OUT/converter.xml" >/dev/null
grep -q 'content-desc="route-converter-detail"' "$OUT/converter.xml"

"$ADB" logcat -c
printf 'sample\ttotalTimeMs\n' > "$OUT/startup.tsv"
for i in $(seq 1 10); do
  "$ADB" shell am force-stop com.veltrix.calculator
  R=$("$ADB" shell am start -W -n com.veltrix.calculator/com.veltrix.calculator.app.MainActivity)
  T=$(printf '%s\n' "$R" | awk -F': ' '/TotalTime:/{print $2}' | tr -d '\r')
  test -n "$T"; test "$T" -gt 0
  printf '%s\t%s\n' "$i" "$T" >> "$OUT/startup.tsv"
done
awk 'NR>1{sum+=$2;if(min==0||$2<min)min=$2;if($2>max)max=$2} END{printf "samples=%d\nmin_ms=%d\navg_ms=%.1f\nmax_ms=%d\n",NR-1,min,sum/(NR-1),max}' "$OUT/startup.tsv" | tee "$OUT/startup-summary.txt"
"$ADB" shell am instrument -w -e class 'com.veltrix.calculator.app.V4FinalRuntimeAcceptanceTest#eMeasuredBackendRuntimeOperations' "$I" | tee "$OUT/performance.txt"
grep -q 'OK (1 test)' "$OUT/performance.txt"
for n in calculator_execute registry_lookup conversion navigation history_load currency_refresh; do grep -q "VELTRIX_PERF name=$n" "$OUT/performance.txt"; done
"$ADB" logcat -d -v threadtime > "$OUT/logcat.txt"
! grep -E 'ANR in com\.veltrix\.calculator|FATAL EXCEPTION:.*com\.veltrix\.calculator' "$OUT/logcat.txt"
grep -q 'android:usesCleartextTraffic="false"' calculator-v4/app/src/main/AndroidManifest.xml
! grep -R -n -E '(sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)' calculator-v4/app/src/main calculator-v4/core/src/main

"$ADB" uninstall com.veltrix.calculator | tee "$OUT/uninstall.txt"
grep -q Success "$OUT/uninstall.txt"
"$ADB" install -t "$APP" | tee "$OUT/reinstall.txt"
grep -q Success "$OUT/reinstall.txt"
"$ADB" shell am start -W -n com.veltrix.calculator/com.veltrix.calculator.app.MainActivity | tee "$OUT/relaunch.txt"
grep -q 'Status: ok' "$OUT/relaunch.txt"
"$ADB" install -r -t "$TEST" >/dev/null
I=$("$ADB" shell pm list instrumentation | sed -n 's/^instrumentation:\([^ ]*\).*target=com.veltrix.calculator.*/\1/p' | head -1 | tr -d '\r')
"$ADB" shell am instrument -w -e class 'com.veltrix.calculator.app.BackendMasterRuntimeTest#aColdLaunchStandardAndScientificProgrammer' "$I" | tee "$OUT/post-reinstall.txt"
grep -q 'OK (1 test)' "$OUT/post-reinstall.txt"

git diff --exit-code
git diff --cached --exit-code
git archive --format=zip --output="$H/VeltrixCalculator-V4-FINAL-TESTED-SOURCE.zip" "$SOURCE_SHA" calculator-v4
cp "$APP" "$H/VeltrixCalculator-V4-FINAL.apk"
cp "$OUT"/*.txt "$OUT"/*.xml "$OUT"/*.tsv "$OUT"/*.sha256 "$H/evidence/" 2>/dev/null || true
cp calculator-v4/docs/{NAVIGATION_ARCHITECTURE.md,LIBRARY_CATALOG_VNEXT.md,SUBJECT_RESEARCH_MAP.md,SUBJECT_COVERAGE_MATRIX.tsv,SOLVE_TARGET_MATRIX.tsv,CONVERTER_CATALOG_VNEXT.md,WIDGET_PRODUCT_SPEC.md,MIGRATION_REPORT.md,TEST_REPORT.md,VERIFIED_CLAIMED_NOT_VERIFIED.md,FRONTEND_HANDOFF_VNEXT.md,AC_NAV_FINAL_LEDGER.tsv} "$H/docs/"
(
  cd "$H/evidence"
  zip -qr "$H/VeltrixCalculator-V4-FINAL-GREEN-EVIDENCE.zip" .
)
printf 'exact_tested_source_sha=%s\nrun_id=%s\njob=%s\npredecessor_full_v3_run=32448354092\npredecessor_full_v3_head=9643c73e67e7ae12ea6bda42ccf9aa189c0fd1a1\npredecessor_green_gates=V3_steps_1_through_12\n' "$SOURCE_SHA" "$GITHUB_RUN_ID" "$GITHUB_JOB" > "$H/FINAL_HANDOFF_INDEX.txt"
(
  cd "$H"
  sha256sum VeltrixCalculator-V4-FINAL.apk VeltrixCalculator-V4-FINAL-TESTED-SOURCE.zip VeltrixCalculator-V4-FINAL-GREEN-EVIDENCE.zip FINAL_HANDOFF_INDEX.txt docs/* > SHA256SUMS.txt
  sha256sum -c SHA256SUMS.txt
)

git config user.name veltrix-backend-bot
git config user.email veltrix-backend-bot@users.noreply.github.com
git switch --detach "$SOURCE_SHA"
mkdir -p .ci/v4-final
printf 'status=SUCCESS\ntested_source_sha=%s\nrun_id=%s\njob=%s\nartifact_name=veltrix-v4-final-route-tail-v3-%s\n' "$SOURCE_SHA" "$GITHUB_RUN_ID" "$GITHUB_JOB" "$SOURCE_SHA" > ".ci/v4-final/${SOURCE_SHA}-route-tail-v3.txt"
git add ".ci/v4-final/${SOURCE_SHA}-route-tail-v3.txt"
git commit -m "evidence(v4): route tail v3 $SOURCE_SHA"
git push origin "HEAD:refs/heads/evidence/v4-route-tail-v3-${SOURCE_SHA}-${GITHUB_RUN_ID}"
