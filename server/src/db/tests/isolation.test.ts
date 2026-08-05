import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, USER_A, USER_B } from './harness.js'

/**
 * Account isolation (spec §4, §18.2).
 *
 * Account B must not be able to read or mutate anything belonging to A —
 * through RLS for direct Data API access, and through the user_id parameter
 * on every security-definer RPC for backend access.
 */
describe('account isolation', () => {
  let db: PGlite
  const SRC_A = '00000000-0000-0000-0000-0000000000a1'

  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`
      insert into sources (id,user_id,title,status,page_count)
        values ('${SRC_A}','${USER_A}','A book','ready',10);
      insert into source_pages (source_id,page_number,pdf_page_index,page_type,ocr_status)
        values ('${SRC_A}',1,1,'scanned','pending');
    `)
  })
  afterAll(async () => { await db.close() })

  it('RLS hides another account\'s rows from a direct read', async () => {
    // auth.uid() is stubbed to USER_A, and RLS is enforced for a non-owner role.
    await db.exec(`set role authenticated`)
    try {
      const visible = await db.query<{ n: number }>(`select count(*)::int as n from sources`)
      // A sees their own book…
      expect(visible.rows[0]?.n).toBe(1)
      const mine = await db.query<{ user_id: string }>(`select user_id from sources`)
      // …and every visible row belongs to A, never to B.
      for (const row of mine.rows) expect(row.user_id).toBe(USER_A)
    } finally {
      await db.exec(`reset role`)
    }
  })

  it('B cannot OCR-claim a page inside A\'s source', async () => {
    const stolen = await db.query(
      `select * from claim_ocr_page($1,$2,$3,$4)`, [USER_B, SRC_A, 'w-b', 300])
    expect(stolen.rows.length).toBe(0)

    // A can, proving the page really was claimable and B was the blocker.
    const own = await db.query<{ page_id: string }>(
      `select * from claim_ocr_page($1,$2,$3,$4)`, [USER_A, SRC_A, 'w-a', 300])
    expect(own.rows.length).toBe(1)
  })

  it('B cannot write an OCR result into A\'s page', async () => {
    const page = await db.query<{ id: string }>(
      `select id from source_pages where source_id=$1 limit 1`, [SRC_A])
    const pageId = page.rows[0]!.id
    const bad = await db.query<{ complete_ocr_page: boolean }>(
      `select complete_ocr_page($1,$2,$3,$4,$5,$6,$7) as complete_ocr_page`,
      [USER_B, pageId, 'injected', 0.9, 'm', 'v1', null])
    expect(bad.rows[0]?.complete_ocr_page).toBe(false)

    const text = await db.query<{ ocr_text: string | null }>(
      `select ocr_text from source_pages where id=$1`, [pageId])
    expect(text.rows[0]?.ocr_text).toBeNull()
  })

  it('B cannot raise OCR priority or set an anchor on A\'s source', async () => {
    const prio = await db.query<{ prioritize_ocr_pages: number }>(
      `select prioritize_ocr_pages($1,$2,$3,$4,$5) as prioritize_ocr_pages`,
      [USER_B, SRC_A, 1, 10, 100])
    expect(prio.rows[0]?.prioritize_ocr_pages).toBe(0)

    const anchor = await db.query<{ set_printed_page_anchor: boolean }>(
      `select set_printed_page_anchor($1,$2,$3,$4) as set_printed_page_anchor`,
      [USER_B, SRC_A, 3, 99])
    expect(anchor.rows[0]?.set_printed_page_anchor).toBe(false)
  })

  it('B cannot resume, cancel, or clean up A\'s work', async () => {
    await db.exec(`insert into processing_jobs (user_id,source_id,job_type,status,priority,stage)
                   values ('${USER_A}','${SRC_A}','extract','paused_quota',50,'extract')`)
    const resumed = await db.query<{ resume_processing_job: boolean }>(
      `select resume_processing_job($1,$2) as resume_processing_job`, [USER_B, SRC_A])
    expect(resumed.rows[0]?.resume_processing_job).toBe(false)

    const cancelled = await db.query<{ cancel_processing_job: boolean }>(
      `select cancel_processing_job($1,$2) as cancel_processing_job`, [USER_B, SRC_A])
    expect(cancelled.rows[0]?.cancel_processing_job).toBe(false)

    const still = await db.query<{ status: string }>(
      `select status from processing_jobs where source_id=$1`, [SRC_A])
    expect(still.rows[0]?.status).toBe('paused_quota')
  })

  it('usage counters are per-account, not shared', async () => {
    await db.query(`select * from bump_usage_counter($1,$2,$3,$4)`, [USER_A, 'ocr_pages', 1, 3600])
    // A is now at their limit; B must still be allowed their own first unit.
    const bFirst = await db.query<{ allowed: boolean }>(
      `select * from bump_usage_counter($1,$2,$3,$4)`, [USER_B, 'ocr_pages', 1, 3600])
    expect(bFirst.rows[0]?.allowed).toBe(true)
    const aSecond = await db.query<{ allowed: boolean }>(
      `select * from bump_usage_counter($1,$2,$3,$4)`, [USER_A, 'ocr_pages', 1, 3600])
    expect(aSecond.rows[0]?.allowed).toBe(false)
  })
})
