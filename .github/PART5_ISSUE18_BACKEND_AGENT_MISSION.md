# Temporary Backend Agent Mission — Part 5 Issue #18

Base SHA: b0d0ec76dc12ace9c61b26eced1ec39fb0c8e926
Target base branch: veltrix-hom-backend-part5-final-closure
Issue: #18

Implement only the narrow worker runtime reliability fix required by issue #18.

Required acceptance:
- Confirm runtime path index.ts -> V1Worker.runLoop -> runOnce -> claimJob -> provider/DB rejection.
- Transient operational provider/DB errors do not reject runLoop outward or crash the API process.
- Iteration boundary owns rejection handling with bounded backoff and no tight loop.
- Recovery resumes work after dependency restoration.
- Shutdown during backoff exits responsively.
- Preserve job claim/idempotency semantics and successful iteration behavior.
- Do not globally suppress unhandled rejections, disable the worker, weaken provider checks, or swallow terminal programming/config failures forever.
- Logs expose safe class/context only, never secrets.
- Add focused deterministic tests for transient failure, recovery, repeated failure/backoff, success unchanged, shutdown during backoff, idempotency/claim preservation, and terminal/non-retryable behavior where architecture distinguishes it.
- Run affected worker/provider/job/health tests first.
- Do not alter unrelated Part1-4 product/security/PF logic.
- Remove this temporary mission file before declaring the PR ready.

Return implementation + executed evidence in the PR. Do not merge.