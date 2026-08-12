#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$GITHUB_WORKSPACE"
APP_PACKAGE="com.veltrix.calculator"
MAIN_COMPONENT="com.veltrix.calculator/com.veltrix.calculator.app.MainActivity"
mkdir -p "$ROOT"/provenance "$ROOT"/delivery "$ROOT"/evidence/{tests,performance,visual,motion,accessibility,device}
trap 'printf "gate_failed_line=%s\n" "$LINENO" > "$ROOT/evidence/tests/gate-failure.txt"' ERR

printf '\n=== Q2 V5: compose exact production source ===\n'
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/9129072133/zip" > "$ROOT/provenance/baseline-artifact.zip"
echo 'f3d612dd35cd58d024128e93d3c8bc04e0be297e85e307b71956aa0e4d5604f0  provenance/baseline-artifact.zip' | (cd "$ROOT" && sha256sum -c -)
unzip -q "$ROOT/provenance/baseline-artifact.zip" -d "$ROOT/provenance/baseline"
echo 'd7b3a796adf39308a94da4acc58cd0d0ad8ff463372e00cae1714738f5de6029  provenance/baseline/VeltrixCalculator-Frontend-MAX-PRO-TESTED-SOURCE.zip' | (cd "$ROOT" && sha256sum -c -)
rm -rf "$ROOT/ci-project"
mkdir -p "$ROOT/ci-project"
unzip -q "$ROOT/provenance/baseline/VeltrixCalculator-Frontend-MAX-PRO-TESTED-SOURCE.zip" -d "$ROOT/ci-project"
cp "$ROOT/provenance/baseline/core-before.sha256" "$ROOT/provenance/core-before.sha256"
cp "$ROOT/provenance/baseline/app-boundaries-before.sha256" "$ROOT/provenance/app-boundaries-before.sha256"
cat "$ROOT"/q2/patch2/part_00 "$ROOT"/q2/patch2/part_01 "$ROOT"/q2/patch2/part_02 "$ROOT"/q2/patch2/part_03 "$ROOT"/q2/patch2/part_04 "$ROOT"/q2/patch2/part_05 "$ROOT"/q2/patch2/part_06 > "$ROOT/provenance/q2.patch"

PROJECT="$ROOT/ci-project/VeltrixCalculator"
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
grep -q 'RuntimeShader' app/src/main/kotlin/com/veltrix/calculator/app/frontend/glass/GlassMaterialRenderer.kt
grep -q 'Convex-lens center magnification' app/src/main/kotlin/com/veltrix/calculator/app/frontend/glass/GlassMaterialRenderer.kt
printf '%s\n' \
  'accepted_commit=53e055093b1237da612ef3b0efa60f46bcd9e9aa' \
  'accepted_run=31564469655' \
  'accepted_job=94013370817' \
  'accepted_artifact=9129072133' \
  "q2_gate_commit=${GITHUB_SHA}" > "$ROOT/provenance/identity.txt"

printf '\n=== Q2 V5: SDK + clean build ===\n'
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platforms;android-36" "build-tools;35.0.0" "platform-tools" "emulator" "system-images;android-35;google_apis;x86_64" >/dev/null
gradle clean :core:test :app:assembleDebug :app:assembleDebugAndroidTest | tee "$ROOT/evidence/tests/build-core.txt"
grep -q 'BUILD SUCCESSFUL' "$ROOT/evidence/tests/build-core.txt"
APP="$PROJECT/app/build/outputs/apk/debug/app-debug.apk"
TEST="$(find "$PROJECT/app/build/outputs/apk/androidTest" -name '*androidTest.apk' -type f | head -1)"
test -s "$APP"; test -s "$TEST"
sha256sum -c "$ROOT/provenance/core-before.sha256"
sha256sum -c "$ROOT/provenance/app-boundaries-before.sha256"

printf '\n=== Q2 V5: boot API 35 emulator ===\n'
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules >/dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=kvm
export ANDROID_AVD_HOME="$RUNNER_TEMP/q2-v5-avd"
mkdir -p "$ANDROID_AVD_HOME"
echo no | avdmanager create avd -n q2_v5_api35 -k "system-images;android-35;google_apis;x86_64" -f >/dev/null
printf '\nhw.lcd.width=1080\nhw.lcd.height=2400\nhw.lcd.density=420\nhw.ramSize=3072\n' >> "$ANDROID_AVD_HOME/q2_v5_api35.avd/config.ini"
nohup "$ANDROID_HOME/emulator/emulator" @q2_v5_api35 -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -no-snapshot -no-metrics -accel on > "$ROOT/evidence/tests/emulator.log" 2>&1 &
timeout 180 adb wait-for-device
for _ in $(seq 1 120); do
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
  sleep 2
done
test "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1
adb shell wm size | tee "$ROOT/evidence/tests/wm-size.txt"
adb shell wm density | tee "$ROOT/evidence/tests/wm-density.txt"

printf '\n=== Q2 V5: install + cold launch + targeted contracts ===\n'
adb install -r -t "$APP" | tee "$ROOT/evidence/tests/install-app.txt"
adb install -r -t "$TEST" | tee "$ROOT/evidence/tests/install-test.txt"
grep -q Success "$ROOT/evidence/tests/install-app.txt"
grep -q Success "$ROOT/evidence/tests/install-test.txt"
I="$(adb shell pm list instrumentation | sed -n 's/^instrumentation:\([^ ]*\).*target=com.veltrix.calculator.*/\1/p' | head -1 | tr -d '\r')"
test -n "$I"
adb shell am force-stop "$APP_PACKAGE"
adb shell am start -W -S -n "$MAIN_COMPONENT" | tee "$ROOT/evidence/tests/cold-launch.txt"
grep -q 'Status: ok' "$ROOT/evidence/tests/cold-launch.txt"
adb shell am instrument -w -e class com.veltrix.calculator.app.FrontendQ2QualityRuntimeTest "$I" | tee "$ROOT/evidence/tests/q2-targeted.txt"
grep -q 'OK (3 tests)' "$ROOT/evidence/tests/q2-targeted.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/tests/q2-targeted.txt"
adb shell am instrument -w -e class com.veltrix.calculator.app.FrontendMaxProRuntimeTest "$I" | tee "$ROOT/evidence/tests/maxpro-targeted.txt"
grep -q 'OK (2 tests)' "$ROOT/evidence/tests/maxpro-targeted.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/tests/maxpro-targeted.txt"

printf '\n=== Q2 V5: full connected regression ===\n'
gradle :app:connectedDebugAndroidTest | tee "$ROOT/evidence/tests/connected.txt"
grep -q 'BUILD SUCCESSFUL' "$ROOT/evidence/tests/connected.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/tests/connected.txt"
sha256sum -c "$ROOT/provenance/core-before.sha256"
sha256sum -c "$ROOT/provenance/app-boundaries-before.sha256"

printf '\n=== Q2 V5: compile evidence harness + restore target app ===\n'
cp "$ROOT"/q2/final-tests/*.kt app/src/androidTest/kotlin/com/veltrix/calculator/app/
patch -p1 < "$ROOT/q2/final-tests-hotfix.patch"
patch -p1 < "$ROOT/q2/final-tests-graph-hotfix.patch"
gradle :app:assembleDebugAndroidTest | tee "$ROOT/evidence/tests/evidence-harness-build.txt"
grep -q 'BUILD SUCCESSFUL' "$ROOT/evidence/tests/evidence-harness-build.txt"
APP="$PROJECT/app/build/outputs/apk/debug/app-debug.apk"
TEST="$(find "$PROJECT/app/build/outputs/apk/androidTest" -name '*androidTest.apk' -type f | head -1)"
test -s "$APP"; test -s "$TEST"
adb install -r -t "$APP" | tee "$ROOT/evidence/tests/evidence-app-reinstall.txt"
adb install -r -t "$TEST" | tee "$ROOT/evidence/tests/evidence-test-install.txt"
grep -q Success "$ROOT/evidence/tests/evidence-app-reinstall.txt"
grep -q Success "$ROOT/evidence/tests/evidence-test-install.txt"
adb shell pm path "$APP_PACKAGE" | grep -q '^package:'
I="$(adb shell pm list instrumentation | sed -n 's/^instrumentation:\([^ ]*\).*target=com.veltrix.calculator.*/\1/p' | head -1 | tr -d '\r')"
test -n "$I"
adb shell cmd appwidget grantbind --package "$APP_PACKAGE" || adb shell appwidget grantbind --package "$APP_PACKAGE" || true

printf '\n=== Q2 V5: non-zero FrameMetrics workload ===\n'
adb shell am instrument -w -e class com.veltrix.calculator.app.FrontendQ2PerformanceRuntimeTest "$I" | tee "$ROOT/evidence/performance/test.txt"
grep -q 'OK (1 test)' "$ROOT/evidence/performance/test.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/performance/test.txt"
rm -rf "$ROOT/evidence/device/q2evidence"
adb pull "/sdcard/Android/data/$APP_PACKAGE/files/q2evidence" "$ROOT/evidence/device/" >/dev/null
PERF="$(find "$ROOT/evidence/device" -name frame_metrics.json -type f | head -1)"
test -s "$PERF"
cp "$PERF" "$ROOT/evidence/performance/frame_metrics.json"
python3 - "$ROOT/evidence/performance/frame_metrics.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
assert int(d['framesMeasured']) > 20, d
print(json.dumps(d, indent=2))
PY
adb shell dumpsys meminfo "$APP_PACKAGE" > "$ROOT/evidence/performance/meminfo.txt" || true
adb shell dumpsys gfxinfo "$APP_PACKAGE" > "$ROOT/evidence/performance/gfxinfo-supplemental.txt" || true

printf '\n=== Q2 V5: 55+ real visual frames ===\n'
adb shell am instrument -w -e class com.veltrix.calculator.app.FrontendQ2FinalEvidenceTest "$I" | tee "$ROOT/evidence/visual/test.txt"
grep -q 'OK (4 tests)' "$ROOT/evidence/visual/test.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/visual/test.txt"
adb shell am instrument -w -e class com.veltrix.calculator.app.FrontendQ2AdditionalVisualEvidenceTest "$I" | tee "$ROOT/evidence/visual/additional-test.txt"
grep -q 'OK (1 test)' "$ROOT/evidence/visual/additional-test.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/visual/additional-test.txt"
rm -rf "$ROOT/evidence/device/q2evidence"
adb pull "/sdcard/Android/data/$APP_PACKAGE/files/q2evidence" "$ROOT/evidence/device/" >/dev/null
VIS="$(find "$ROOT/evidence/device" -type d -path '*/q2evidence/visual' | head -1)"
test -d "$VIS"
cp -a "$VIS"/. "$ROOT/evidence/visual/"
COUNT="$(find "$ROOT/evidence/visual" -maxdepth 1 -name '*.png' -type f | wc -l | tr -d ' ')"
echo "$COUNT" | tee "$ROOT/evidence/visual/count.txt"
test "$COUNT" -ge 55
python3 -c 'import PIL' >/dev/null 2>&1 || python3 -m pip install --quiet pillow
python3 - "$ROOT/evidence/visual" <<'PY'
from PIL import Image, ImageDraw
import os, math, sys
root = sys.argv[1]
fs = sorted(f for f in os.listdir(root) if f.endswith('.png'))
assert len(fs) >= 55
cells = []
for f in fs:
    im = Image.open(os.path.join(root, f)).convert('RGB')
    im.thumbnail((176, 390))
    c = Image.new('RGB', (186, 420), 'white')
    c.paste(im, ((186-im.width)//2, 4))
    ImageDraw.Draw(c).text((5, 400), f[:26], fill='black')
    cells.append(c)
cols = 5
sheet = Image.new('RGB', (cols*186, math.ceil(len(cells)/cols)*420), (235,235,235))
for i, c in enumerate(cells):
    sheet.paste(c, ((i%cols)*186, (i//cols)*420))
sheet.save(os.path.join(root, 'Q2_VISUAL_CONTACT_SHEET.jpg'), quality=88)
open(os.path.join(root, 'manifest.txt'), 'w').write('\n'.join(fs) + '\n')
PY

printf '\n=== Q2 V5: 17 real motion clips ===\n'
capture_motion() {
  local method="$1" name="$2" remote="/sdcard/$2.mp4"
  adb shell rm -f "$remote" || true
  timeout 10 adb shell screenrecord --size 720x1600 --bit-rate 4000000 --time-limit 9 "$remote" >/dev/null 2>&1 &
  local rec_pid=$!
  sleep 0.55
  adb shell am instrument -w -e class "com.veltrix.calculator.app.FrontendQ2MotionEvidenceTest#$method" "$I" | tee "$ROOT/evidence/motion/$name.txt"
  grep -q 'OK (1 test)' "$ROOT/evidence/motion/$name.txt"; ! grep -q 'FAILURES!!!' "$ROOT/evidence/motion/$name.txt"
  wait "$rec_pid" || true
  adb pull "$remote" "$ROOT/evidence/motion/$name.mp4" >/dev/null
  test "$(stat -c%s "$ROOT/evidence/motion/$name.mp4")" -gt 15000
}
capture_motion clip01_standard_press_rapid_equals 01_key_press_typing_equals
capture_motion clip02_standard_scientific_continuity 02_standard_scientific
capture_motion clip03_main_brain_icon_open_close 03_brain_icon_open_close
capture_motion clip04_main_brain_direct_drag_cancel_complete 04_brain_direct_drag
capture_motion clip05_library_subject_moving_lens 05_library_lens
capture_motion clip06_library_custom_keyboard_biyt_vieta 06_library_biyt
capture_motion clip07_library_item_to_purpose_tool 07_library_to_tool
capture_motion clip08_polynomial_degree_morph 08_polynomial_degree
capture_motion clip09_converter_swap 09_converter_swap
capture_motion clip10_currency_refresh_state 10_currency_refresh
capture_motion clip11_segmented_rapid_retarget 11_segmented_retarget
capture_motion clip12_slider_direct_manipulation 12_slider
capture_motion clip13_expanded_glass_control_space 13_expanded_glass
capture_motion clip14_graph_parameter_change 14_graph_parameter
capture_motion clip15_graph_pan_pinch_crosshair 15_graph_pan_pinch_crosshair
capture_motion clip16_system_back_behavior 16_system_back
capture_motion clip17_reduced_motion_comparison 17_reduced_motion
test "$(find "$ROOT/evidence/motion" -maxdepth 1 -name '*.mp4' -type f | wc -l | tr -d ' ')" -eq 17

printf '\n=== Q2 V5: offline, relaunch, frozen hashes ===\n'
adb shell settings put global airplane_mode_on 1 || true
adb shell svc wifi disable || true
adb shell svc data disable || true
adb shell am force-stop "$APP_PACKAGE"
adb shell am start -W -S -n "$MAIN_COMPONENT" | tee "$ROOT/evidence/tests/offline-launch.txt"
grep -q 'Status: ok' "$ROOT/evidence/tests/offline-launch.txt"
gradle :core:test | tee "$ROOT/evidence/tests/offline-core.txt"
grep -q 'BUILD SUCCESSFUL' "$ROOT/evidence/tests/offline-core.txt"
adb shell settings put global airplane_mode_on 0 || true
adb shell svc wifi enable || true
adb shell svc data enable || true
adb shell am force-stop "$APP_PACKAGE"
adb shell am start -W -S -n "$MAIN_COMPONENT" | tee "$ROOT/evidence/tests/final-relaunch.txt"
grep -q 'Status: ok' "$ROOT/evidence/tests/final-relaunch.txt"
sha256sum -c "$ROOT/provenance/core-before.sha256"
sha256sum -c "$ROOT/provenance/app-boundaries-before.sha256"

printf '\n=== Q2 V5: package exact deliverables ===\n'
cp "$APP" "$ROOT/delivery/VeltrixCalculator-Frontend-MAX-PRO-Q2-FINAL.apk"
rm -rf app/build core/build .gradle
cd "$ROOT/ci-project"
zip -qr "$ROOT/delivery/VeltrixCalculator-Frontend-MAX-PRO-Q2-TESTED-SOURCE.zip" VeltrixCalculator -x '*/build/*' 'VeltrixCalculator/.gradle/*'
cd "$ROOT"
cp -a provenance evidence/provenance
cat > evidence/accessibility/ACCESSIBILITY.md <<'EOF'
Reduced Transparency is captured in visual evidence; Reduced Motion is captured in motion clip 17. Physical TalkBack/OEM accessibility remains a real-device gate.
EOF
cat > delivery/KNOWN_LIMITATIONS.md <<'EOF'
# Known Limitations
Physical Android-device visual/performance perception is NOT VERIFIED by emulator CI. API 35 x86_64 SwiftShader differs from phone GPUs. Full AGSL optical path requires API 33+; older/accessibility modes use fallback. Physical 60/90/120 Hz jank, OEM GPU and TalkBack remain Founder/Check Engine gates. Emulator AppWidget bind permission may be unavailable; widget runtime contracts remain covered separately and any unavailable widget visual captures are explicitly marked in evidence.
EOF
cat > delivery/VERIFIED_CLAIMED_NOT_VERIFIED.md <<'EOF'
# VERIFIED / CLAIMED / NOT VERIFIED
VERIFIED: accepted baseline provenance; frozen backend hashes; clean Android build/core tests; APK install/cold launch; Q2 targeted tests; connected regression; non-zero FrameMetrics workload; 55+ real visual captures; 17 motion clips; offline/relaunch.
CLAIMED: product intent is premium Android-native Veltrix Liquid Glass and motion-centric UX, evaluated against captured emulator evidence.
NOT VERIFIED: physical-device perceived glass quality, physical-device frame pacing/touch latency, OEM GPU behavior, TalkBack/OEM accessibility, broad 60/90/120 Hz matrix.
EOF
cat > delivery/FINAL_REPORT.md <<EOF
# Veltrix Calculator Frontend MAX PRO Q2 Final
Gate commit: ${GITHUB_SHA}
Workflow run: ${GITHUB_RUN_ID}
Accepted baseline: 53e055093b1237da612ef3b0efa60f46bcd9e9aa / run 31564469655 / job 94013370817 / artifact 9129072133
Frozen backend: byte-hash protected.
Production architecture: persistent shell, Android AGSL/RuntimeShader optical Liquid Glass, direct Main Brain gesture host, one-object moving lenses, purpose-built tool environments, cached graph rendering.
Engineering verification: see EVIDENCE, VISUAL, MOTION and PERFORMANCE archives.
Physical-device perception/performance: NOT VERIFIED by this gate.
EOF
cat > delivery/glass_architecture.md <<'EOF'
# Liquid Glass Architecture
API33+ RuntimeShader/AGSL samples the captured scene through transmission, convex lensing, edge refraction, chromatic sampling, adaptive tint, edge concentration, apparent thickness/caustic response and touch-origin deformation. GlassSceneHost reuses dirty-driven scene snapshots; dense controls stay lightweight.
EOF
cat > delivery/MOTION_SYSTEM.md <<'EOF'
# Motion System
Context-specific press compression, moving segmented lens, finger-following slider, direct Main Brain drag with velocity-aware settle, converter swap, graph pan/pinch/crosshair, retargetable motion and reduced-motion fallback. See 17 clips.
EOF
zip -qr delivery/VeltrixCalculator-Frontend-MAX-PRO-Q2-VISUAL.zip evidence/visual
zip -qr delivery/VeltrixCalculator-Frontend-MAX-PRO-Q2-MOTION.zip evidence/motion
zip -qr delivery/VeltrixCalculator-Frontend-MAX-PRO-Q2-PERFORMANCE.zip evidence/performance
mkdir -p evidence/docs
cp delivery/*.md evidence/docs/
zip -qr delivery/VeltrixCalculator-Frontend-MAX-PRO-Q2-EVIDENCE.zip evidence
cd delivery
sha256sum VeltrixCalculator-Frontend-MAX-PRO-Q2-FINAL.apk VeltrixCalculator-Frontend-MAX-PRO-Q2-TESTED-SOURCE.zip VeltrixCalculator-Frontend-MAX-PRO-Q2-EVIDENCE.zip VeltrixCalculator-Frontend-MAX-PRO-Q2-VISUAL.zip VeltrixCalculator-Frontend-MAX-PRO-Q2-MOTION.zip VeltrixCalculator-Frontend-MAX-PRO-Q2-PERFORMANCE.zip > SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt
find . -maxdepth 1 -type f -printf '%f\t%s bytes\n' | sort > FINAL_INVENTORY.txt
printf '\n=== Q2 V5 COMPLETE ===\n'
