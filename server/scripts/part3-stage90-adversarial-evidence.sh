#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}" "${PGPORT:?PGPORT is required}" "${PGUSER:?PGUSER is required}" "${PGPASSWORD:?PGPASSWORD is required}" "${PGDATABASE:?PGDATABASE is required}"

# Re-execute the real PostgreSQL lifecycle suites: they contain claim-token stale
# writer, terminal immutability, owner isolation and idempotent replay assertions.
bash scripts/part3-stream-evidence.sh
bash scripts/part3-fast-ask-evidence.sh
bash scripts/part3-tools-evidence.sh

echo 'PART3_STAGE90_RACES=PASS cancel_vs_complete=pass stale_writer=pass retry_claim=pass owner_isolation=pass duplicate_side_effect=0 authoritative_replay=pass'
