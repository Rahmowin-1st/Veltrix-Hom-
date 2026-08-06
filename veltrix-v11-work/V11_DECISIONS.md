# V11 Decisions

## New dependencies
**None.** Every V11 change uses the existing stack. The TOC parser is plain TypeScript
regex rather than a PDF-layout library or a model call, because:
- TOC lines are highly regular (`title … leader … number`), so a parser is reliable;
- routing is only a *hint* that is verified against real pages afterwards, so spending a
  model call — and a user quota unit — on it is not justified;
- it adds no install surface to an already-constrained free-tier deploy.

## Chunk uniqueness key
Changed from `(source_id, page_number, chunk_index, chunker_version, content_hash)` to
`(source_page_id, chunk_index, chunker_version, content_hash)`.

The page row is the real owner of its chunks. Keying on `page_number` means that if a
book is re-extracted and its page numbering shifts, old chunks are no longer addressable
by the new run and can be stranded. Keying on `source_page_id` makes a page's chunk set
exactly replaceable. The old index is left in place (harmless, and dropping it would be a
destructive change on a live database).

## Re-embedding policy
The indexer now reads the existing content hashes for a page at the current chunker and
embedding-model version, and skips any chunk whose hash already exists. Embeddings are
the expensive part of indexing; a re-run over an unchanged page should cost nothing.
`reindex_page_versioned` deletes only rows from a *different* version, so a model upgrade
still forces a clean rebuild.

## Framer Motion gating
CSS `transition-duration` cannot throttle Framer Motion, which animates in JavaScript.
Rather than editing 29 animated components, the whole tree is wrapped in one
`MotionConfig`: `reducedMotion="always"` at level `off`, and a short global transition at
level `reduced`. `useMotionLevel` uses `useSyncExternalStore`, so a level change costs one
re-render, not one per frame.

## TOC extraction placement
Folded into the existing extract page loop (first 25 pages only) instead of a separate
durable stage. A second stage would mean a second full download and open of the PDF for
data that is always in the front matter — exactly the repeated-reparse pattern §6 forbids.

## What was deliberately NOT rebuilt
Account isolation, atomic chat requests, the durable worker, TUS upload, evidence locking,
pagination and navigation were already implemented and covered by passing tests. Execution
contract §6 says not to rebuild `DONE_AND_CONNECTED` systems, so they were left alone.
