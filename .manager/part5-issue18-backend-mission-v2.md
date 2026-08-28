# Backend mission — Part 5 issue #18 only

Base tree authority:
- current merged main commit: 5f584dbc0f22fa2f756810ba6842cd847770f84d
- accepted Part 5 candidate tree source: a9ca0ae44a7d624fce6f4ea8b88fb67cba6edbd8
- issue: #18

Mission:
Implement the smallest correct V1 worker runtime reliability fix required by issue #18. Preserve all unrelated Part 5 GREEN.

Required behavior:
- transient provider/DB failure at the worker iteration boundary must not terminate the Node API process;
- bounded backoff, no hot loop;
- clean stop/abort behavior;
- safe logs only;
- recovery proof after dependency returns;
- preserve claim/idempotency/no-duplicate execution semantics;
- terminal programming/configuration failures must not be silently swallowed forever.

Focused tests required before final closure:
1. claim/provider reject once -> loop does not reject outward;
2. bounded retry/backoff;
3. recovery resumes work;
4. repeated failure does not spin hot;
5. successful iteration unchanged;
6. shutdown during backoff exits cleanly;
7. claim/idempotency semantics preserved;
8. terminal/non-retryable behavior follows the intended lifecycle contract.

Boundary:
Do not touch unrelated product/domain/security/PF code. Do not merge automatically. Remove this mission marker before the PR is ready for final Manager review.
