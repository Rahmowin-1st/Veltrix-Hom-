import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, USER_A } from './harness.js'

/**
 * Durable worker crash / recovery (spec §8, §18.3).
 *
 * These exercise the real lease, fencing and checkpoint RPCs. The scenarios
 * that matter are the ugly ones: a worker dies mid-job, a zombie worker wakes
 * up still holding a stale token, the quota runs out, the user cancels.
 */
describe('durable worker recovery', () => {
  let db: PGlite
  const SRC = '00000000-0000-0000-0000-0000000000c1'

  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`insert into sources (id,user_id,title,status,page_count)
                   values ('${SRC}','${USER_A}','Book','extracting',100)`)
  })
  afterAll(async () => { await db.close() })

  const enqueue = (type = 'extract') =>
    db.exec(`insert into processing_jobs (user_id,source_id,job_type,status,priority,stage,extractor_version)
             values ('${USER_A}','${SRC}','${type}','queued',50,'${type}','pdfjs-1')`)

  /**
   * `claim_processing_job` returns the composite `processing_jobs` type, so an
   * empty claim comes back as ONE row of NULLs rather than zero rows. Treat a
   * null id as "nothing claimed" — the same check the real worker makes.
   */
  const claim = async (worker: string) => {
    const res = await db.query<{ id: string | null; lease_token: string; checkpoint_page: number | null; lease_version: string }>(
      `select * from claim_processing_job($1,$2)`, [120, worker])
    const row = res.rows[0]
    return row?.id ? row : null
  }

  it('a job is claimed by exactly one worker', async () => {
    await enqueue()
    const first = await claim('w1')
    expect(first).not.toBeNull()
    // A second worker polling at the same moment must get nothing, not a copy.
    expect(await claim('w2')).toBeNull()
    await db.exec(`delete from processing_jobs where source_id='${SRC}'`)
  })

  it('a crashed worker\'s job is reclaimed only after its lease expires', async () => {
    await enqueue()
    const first = (await claim('w1'))!
    const jobId = first.id!

    // Worker 1 "crashes" — no more heartbeats. Before expiry, nobody may take it.
    expect(await claim('w2')).toBeNull()

    // Simulate the lease running out.
    await db.query(`update processing_jobs set lease_expires_at = now() - interval '1 minute' where id=$1`, [jobId])
    const recovered = (await claim('w2'))!
    expect(recovered).not.toBeNull()
    expect(recovered.id).toBe(jobId)
    // The fencing version must advance so the zombie's writes can be rejected.
    expect(Number(recovered.lease_version)).toBeGreaterThan(Number(first.lease_version))
    await db.exec(`delete from processing_jobs where source_id='${SRC}'`)
  })

  it('a zombie worker holding a stale token cannot write', async () => {
    await enqueue()
    const first = (await claim('w1'))!
    const jobId = first.id!
    const staleToken = first.lease_token

    await db.query(`update processing_jobs set lease_expires_at = now() - interval '1 minute' where id=$1`, [jobId])
    const freshToken = (await claim('w2'))!.lease_token

    // The checkpoint RPC returns the NEW lease expiry, or NULL when the caller
    // no longer owns the lease. The zombie must get NULL and write nothing.
    const zombie = await db.query<{ checkpoint_processing_job: string | null }>(
      `select checkpoint_processing_job($1,$2,$3,$4,$5,$6,$7) as checkpoint_processing_job`,
      [jobId, staleToken, 999, 100, 999, 0, 120])
    expect(zombie.rows[0]?.checkpoint_processing_job).toBeNull()

    // The rightful owner still can.
    const owner = await db.query<{ checkpoint_processing_job: string | null }>(
      `select checkpoint_processing_job($1,$2,$3,$4,$5,$6,$7) as checkpoint_processing_job`,
      [jobId, freshToken, 12, 100, 12, 500, 120])
    expect(owner.rows[0]?.checkpoint_processing_job).toBeTruthy()

    // And the zombie's bogus page 999 was never recorded.
    const state = await db.query<{ checkpoint_page: number }>(
      `select checkpoint_page from processing_jobs where id=$1`, [jobId])
    expect(state.rows[0]?.checkpoint_page).toBe(12)
    await db.exec(`delete from processing_jobs where source_id='${SRC}'`)
  })

  it('resumes from the checkpoint instead of restarting at page 1', async () => {
    await enqueue()
    const first = (await claim('w1'))!
    const jobId = first.id!
    await db.query(`select checkpoint_processing_job($1,$2,$3,$4,$5,$6,$7)`,
      [jobId, first.lease_token, 47, 100, 47, 9000, 120])

    // Process dies; lease expires; a new worker picks it up.
    await db.query(`update processing_jobs set lease_expires_at = now() - interval '1 minute' where id=$1`, [jobId])
    const resumed = (await claim('w2'))!
    expect(resumed.checkpoint_page).toBe(47)
    await db.exec(`delete from processing_jobs where source_id='${SRC}'`)
  })

  it('a quota pause is temporary and auto-resumes when it is due', async () => {
    await enqueue()
    const first = (await claim('w1'))!
    const jobId = first.id!
    await db.query(`select pause_processing_job_quota($1,$2,$3)`, [jobId, first.lease_token, 900])

    const paused = await db.query<{ status: string }>(`select status from processing_jobs where id=$1`, [jobId])
    expect(paused.rows[0]?.status).toBe('paused_quota')

    // Not yet due — a worker must leave it alone.
    expect(await claim('w2')).toBeNull()

    // Once next_retry_at passes it becomes claimable again on its own, with no
    // human intervention. This is what stops paused_quota being permanent.
    await db.query(`update processing_jobs set next_retry_at = now() - interval '1 second' where id=$1`, [jobId])
    expect(await claim('w2')).not.toBeNull()
    await db.exec(`delete from processing_jobs where source_id='${SRC}'`)
  })

  it('cancellation stops the job and preserves finished pages', async () => {
    await enqueue()
    const first = (await claim('w1'))!
    const jobId = first.id!
    await db.query(`select checkpoint_processing_job($1,$2,$3,$4,$5,$6,$7)`,
      [jobId, first.lease_token, 30, 100, 30, 100, 120])

    const cancelled = await db.query<{ cancel_processing_job: boolean }>(
      `select cancel_processing_job($1,$2) as cancel_processing_job`, [USER_A, SRC])
    expect(cancelled.rows[0]?.cancel_processing_job).toBe(true)

    const after = await db.query<{ status: string; cancel_requested_at: string | null; checkpoint_page: number }>(
      `select status, cancel_requested_at, checkpoint_page from processing_jobs where id=$1`, [jobId])
    expect(after.rows[0]?.cancel_requested_at).toBeTruthy()
    // Work already done is not thrown away.
    expect(after.rows[0]?.checkpoint_page).toBe(30)
    await db.exec(`delete from processing_jobs where source_id='${SRC}'`)
  })

  it('chunk inserts are idempotent across a crash-and-retry', async () => {
    const pageRow = await db.query<{ id: string }>(
      `insert into source_pages (source_id,page_number,pdf_page_index,page_type)
       values ('${SRC}',5,5,'text') returning id`)
    const pageId = pageRow.rows[0]!.id
    const insertChunk = () => db.query(
      `insert into source_chunks (source_id,user_id,source_page_id,page_number,chunk_index,content,content_hash,chunker_version)
       values ($1,$2,$3,5,0,'hello',encode(sha256('hello'::bytea),'hex'),'v9-900-150')
       on conflict do nothing`,
      [SRC, USER_A, pageId])

    await insertChunk()
    // The worker crashed after inserting but before marking the page done, so
    // the retry re-inserts the identical chunk. The logical unique index must
    // absorb it rather than producing a duplicate.
    await insertChunk()
    await insertChunk()

    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from source_chunks where source_id=$1 and page_number=5`, [SRC])
    expect(count.rows[0]?.n).toBe(1)
  })
})
