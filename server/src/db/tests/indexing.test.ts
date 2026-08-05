import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, USER_A, USER_B } from './harness.js'

/**
 * Crash-idempotent, version-aware indexing (spec §12).
 *
 * The expensive part of indexing is the embedding call, so the rules are:
 * a retry must not duplicate chunks, and unchanged content must not be
 * re-embedded just because the indexer ran again.
 */
describe('page-owned chunk indexing', () => {
  let db: PGlite
  const SRC = '00000000-0000-0000-0000-0000000000d1'
  let pageId = ''

  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`insert into sources (id,user_id,title,status,page_count)
                   values ('${SRC}','${USER_A}','Book','ready',10)`)
    const p = await db.query<{ id: string }>(
      `insert into source_pages (source_id,page_number,pdf_page_index,page_type)
       values ('${SRC}',1,1,'text') returning id`)
    pageId = p.rows[0]!.id
  })
  afterAll(async () => { await db.close() })

  const insertChunk = (index: number, hash: string, chunker = 'v9-900-150', model = 'gemini-embedding-2') =>
    db.query(
      `insert into source_chunks
         (source_id,user_id,source_page_id,page_number,chunk_index,content,content_hash,chunker_version,embedding_model)
       values ($1,$2,$3,1,$4,'text',$5,$6,$7) on conflict do nothing`,
      [SRC, USER_A, pageId, index, hash, chunker, model])

  it('a crash-and-retry cannot duplicate a chunk', async () => {
    await insertChunk(0, 'hash-a')
    await insertChunk(0, 'hash-a')
    await insertChunk(0, 'hash-a')
    const n = await db.query<{ n: number }>(
      `select count(*)::int as n from source_chunks where source_page_id=$1`, [pageId])
    expect(n.rows[0]?.n).toBe(1)
  })

  it('reindex keeps current-version chunks and drops only stale ones', async () => {
    await insertChunk(1, 'hash-b')                              // current
    await insertChunk(2, 'hash-c', 'OLD-CHUNKER')               // stale chunker
    await insertChunk(3, 'hash-d', 'v9-900-150', 'old-model')   // stale model

    const r = await db.query<{ deleted_count: number; kept_count: number }>(
      `select * from reindex_page_versioned($1,$2,$3,$4)`,
      [USER_A, pageId, 'v9-900-150', 'gemini-embedding-2'])

    // Both stale rows go; the two current-version rows survive, so their
    // embeddings are reused rather than paid for again.
    expect(r.rows[0]?.deleted_count).toBe(2)
    expect(r.rows[0]?.kept_count).toBe(2)
  })

  it('a non-owner cannot reindex someone else\'s page', async () => {
    const before = await db.query<{ n: number }>(
      `select count(*)::int as n from source_chunks where source_page_id=$1`, [pageId])
    const r = await db.query<{ deleted_count: number; kept_count: number }>(
      `select * from reindex_page_versioned($1,$2,$3,$4)`,
      [USER_B, pageId, 'ANY', 'ANY'])
    expect(r.rows[0]?.deleted_count).toBe(0)
    const after = await db.query<{ n: number }>(
      `select count(*)::int as n from source_chunks where source_page_id=$1`, [pageId])
    // Nothing was deleted despite a version mismatch, because B does not own it.
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n)
  })

  it('deduplicates identical content within a source', async () => {
    // The base schema carries a per-source unique index on content_hash, so a
    // repeated hash collapses to one row. The indexer hashes
    // `page:index:content`, so genuinely different chunks never collide —
    // this only catchestrue duplicates.
    await insertChunk(7, 'hash-shared')
    await insertChunk(8, 'hash-shared')
    const n = await db.query<{ n: number }>(
      `select count(*)::int as n from source_chunks where source_page_id=$1 and content_hash='hash-shared'`,
      [pageId])
    expect(n.rows[0]?.n).toBe(1)
  })

  it('chunks hashed as page:index:content stay distinct across slots', async () => {
    // This mirrors what the worker actually writes.
    await insertChunk(10, '1:10:abc')
    await insertChunk(11, '1:11:abc')
    const n = await db.query<{ n: number }>(
      `select count(*)::int as n from source_chunks where source_page_id=$1 and content_hash like '1:1%:abc'`,
      [pageId])
    expect(n.rows[0]?.n).toBe(2)
  })
})
