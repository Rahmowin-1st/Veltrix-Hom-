# V11 Production Smoke Test

Run straight after deploying, in order.

## Health
- [ ] `GET /health` → `{ ok: true }`
- [ ] `GET /health/worker` → counts, `stale_leases: 0`

## Account safety
- [ ] Sign in as A, note a chat and a source. Sign out, sign in as B → none of A's data
      appears, not even briefly during bootstrap.
- [ ] Back to A → data intact.

## Chat
- [ ] Send a message; double-tap send on the next one → exactly one question, one answer.
- [ ] Send, drop the network mid-request, restore → the answer appears exactly **once**.
- [ ] Refresh mid-request → the pending request reconciles; no empty assistant bubble.

## History
- [ ] Open a 200+ message chat, scroll to the top → older pages load with nothing missing
      or repeated; scroll position does not jump.

## Sources
- [ ] Upload a text PDF → `ready`, full-text search available, citations point at real pages.
- [ ] Upload a scanned PDF → `ready` with OCR coverage progressing (`X / Y`), **not** an
      instant "fully searchable".
- [ ] Upload a book with a contents page → `toc_status` becomes `done` with a plausible
      `toc_entry_count`; a topic question routes to the right region.
- [ ] Ask for a specific printed page → correct printed page, not the PDF index.
- [ ] Correct a wrong mapping via the page-anchor action → later lookups in that region
      are right.
- [ ] Re-run indexing on an unchanged source → it completes quickly and **no new
      embeddings are spent** (watch quota / logs).

## Upload robustness
- [ ] >6 MB file uses the resumable path; server memory stays flat.
- [ ] Interrupt and resume a large upload → resumes, does not restart.
- [ ] Non-PDF renamed to `.pdf` → rejected on magic bytes. >20 MB → rejected.
- [ ] Log out mid-upload → aborts, no orphan source.
- [ ] Call cleanup → stale `uploading` reservations are removed.

## Worker
- [ ] Redeploy while a book indexes → resumes from checkpoint after boot.
- [ ] Quota-paused job auto-resumes; manual Resume works; Cancel preserves finished pages.

## Navigation
- [ ] Open an overlay, press browser Back → overlay closes and the route does **not** also
      change. Forward reopens it.
- [ ] 20 open/close cycles then repeated Back → history unwinds sanely.
- [ ] Sending a message adds no history entry.

## Security
- [ ] With B's token, call an endpoint for one of A's source IDs → rejected.
- [ ] `sources` storage bucket is private.
- [ ] Search the deployed bundle for a service-role or Gemini key → absent.
- [ ] Exceed the hourly chat limit → clear 429; the app stays usable afterwards.
