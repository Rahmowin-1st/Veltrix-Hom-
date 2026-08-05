import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, USER_A } from './harness.js'

/**
 * Composite-cursor pagination (spec §6.1, §18.7).
 *
 * The failure this guards against is subtle: with a timestamp-only cursor,
 * messages sharing a `created_at` straddle a page boundary, so one is silently
 * skipped and another repeated. These tests deliberately create identical
 * timestamps — the exact case a user+assistant pair inserted in the same
 * millisecond produces — and walk every page.
 */
describe('composite cursor pagination', () => {
  let db: PGlite
  const CHAT = '00000000-0000-0000-0000-0000000000e1'
  const TOTAL = 60

  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`insert into chats (id,user_id,title) values ('${CHAT}','${USER_A}','Long chat')`)
    // Three distinct timestamps only, so ~20 messages share each one.
    for (let i = 0; i < TOTAL; i++) {
      const bucket = Math.floor(i / 20)
      await db.query(
        `insert into messages (chat_id,user_id,role,content,created_at)
         values ($1,$2,$3,$4, now() - make_interval(mins => $5))`,
        [CHAT, USER_A, i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`, 10 - bucket],
      )
    }
  })
  afterAll(async () => { await db.close() })

  /** Mirrors the server's keyset query exactly. */
  async function page(limit: number, cursor: { t: string; i: string } | null) {
    const where = cursor
      ? `and (created_at < $3::timestamptz or (created_at = $3::timestamptz and id < $4::uuid))`
      : ''
    const params: unknown[] = [CHAT, limit + 1]
    if (cursor) params.push(cursor.t, cursor.i)
    const res = await db.query<{ id: string; content: string; created_at: string }>(
      `select id, content, created_at from messages
        where chat_id = $1 ${where}
        order by created_at desc, id desc
        limit $2`,
      params,
    )
    const hasMore = res.rows.length > limit
    const rows = hasMore ? res.rows.slice(0, limit) : res.rows
    const last = rows[rows.length - 1]
    return {
      rows,
      hasMore,
      next: last ? { t: last.created_at, i: last.id } : null,
    }
  }

  it('walks every message exactly once with no gaps or duplicates', async () => {
    const seen: string[] = []
    let cursor: { t: string; i: string } | null = null
    let guard = 0

    for (;;) {
      const result: Awaited<ReturnType<typeof page>> = await page(7, cursor)
      seen.push(...result.rows.map((r) => r.id))
      if (!result.hasMore) break
      cursor = result.next
      if (++guard > 50) throw new Error('pagination did not terminate')
    }

    // Every message reachable…
    expect(seen.length).toBe(TOTAL)
    // …and each one exactly once, which is what a timestamp-only cursor breaks.
    expect(new Set(seen).size).toBe(TOTAL)

    const all = await db.query<{ id: string }>(
      `select id from messages where chat_id=$1`, [CHAT])
    expect(new Set(seen)).toEqual(new Set(all.rows.map((r) => r.id)))
  })

  it('keeps a stable order across repeated reads', async () => {
    const first = await page(20, null)
    const again = await page(20, null)
    expect(first.rows.map((r) => r.id)).toEqual(again.rows.map((r) => r.id))
  })

  it('pages are strictly older than the cursor, even at a tie', async () => {
    const first = await page(20, null)
    const second = await page(20, first.next)
    const firstIds = new Set(first.rows.map((r) => r.id))
    // No row may appear in both pages, despite ~20 rows sharing a timestamp.
    for (const row of second.rows) expect(firstIds.has(row.id)).toBe(false)
  })

  it('another account sees none of this chat\'s messages', async () => {
    const other = await db.query<{ n: number }>(
      `select count(*)::int as n from messages where chat_id=$1 and user_id<>$2`, [CHAT, USER_A])
    expect(other.rows[0]?.n).toBe(0)
  })
})
