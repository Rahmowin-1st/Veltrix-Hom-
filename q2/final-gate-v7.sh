#!/usr/bin/env bash
set -Eeuo pipefail

# Keep the previously proven full gate intact. Inject the dedicated visual-polish patch
# immediately after the clean graph/tag patch so the same runtime/evidence pipeline is reused.
ROOT="$GITHUB_WORKSPACE"
TMP="$RUNNER_TEMP/q2-final-gate-v7.sh"
python3 - "$ROOT/q2/final-gate-v5.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text()
needle = 'patch -p1 < "$ROOT/q2/graph-tags-v2.patch"\n'
insert = needle + 'patch -p1 < "$ROOT/q2/visual-polish-v2.patch"\n'
if src.count(needle) != 1:
    raise SystemExit(f'expected exactly one graph patch hook, found {src.count(needle)}')
Path(sys.argv[2]).write_text(src.replace(needle, insert, 1))
PY
chmod +x "$TMP"
exec bash "$TMP"
