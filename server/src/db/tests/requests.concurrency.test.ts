import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, USER_A, USER_B } from './harness.js'
import { FakeGemini } from './fakeGemini.js'

/**
 * Atomic chat requests (spec §5, §18.1).
 *
 * These run the real `claim_chat_request` / `complete_chat_request` RPC
 * bodies against a real PostgreSQL engine. The point is not that the SQL
 * parses — it is that a duplicate submission cannot produce a second chat,
 * a second user message, a second provider call, or a second answer.
 */
describe('atomic chat requests', () => {
  let db: PGlite
  beforeAll(async () => { db = await createTestDb() })
  afterAll(async () => { await db.close() })

  const claim = (user: string, reqId: string, text = 'salom', chatId: string | null = null) =>
    db.query<{ outcome: string; chat_id: string; request_id: string; lease_token: string; user_message_id: string }>(
      `select * from claim_chat_request($1,$2,$3,$4)`,
      [user, reqId, chatId, text],
    )

  it('a duplicate submission creates one chat, one user message, one request', async () => {
    const reqId = crypto.randomUUID()
    const first = await claim(USER_A, reqId)
    expect(first.rows[0]?.outcome).toBe('claimed')

    // Same logical request submitted again (double tap / retry).
    const second = await claim(USER_A, reqId)
    expect(['processing', 'claimed']).toContain(second.rows[0]?.outcome)
    // Crucially it must be the SAME chat and the SAME request, not a new pair.
    expect(second.rows[0]?.chat_id).toBe(first.rows[0]?.chat_id)
    expect(second.rows[0]?.request_id).toBe(first.rows[0]?.request_id)

    const chats = await db.query<{ n: number }>(
      `select count(*)::int as n from chats where user_id=$1`, [USER_A])
    expect(chats.rows[0]?.n).toBe(1)

    const msgs = await db.query<{ n: number }>(
      `select count(*)::int as n from messages where request_id=$1 and role='user'`,
      [first.rows[0]?.request_id])
    expect(msgs.rows[0]?.n).toBe(1)
  })

  it('only the first claimer may call the provider (one invocation)', async () => {
    const ai = new FakeGemini()
    const reqId = crypto.randomUUID()

    // Two callers race on the same logical request.
    const [a, b] = await Promise.all([claim(USER_A, reqId, 'x'), claim(USER_A, reqId, 'x')])
    const outcomes = [a.rows[0]?.outcome, b.rows[0]?.outcome]
    // Exactly one is allowed to proceed to the model.
    const owners = outcomes.filter((o) => o === 'claimed')
    expect(owners.length).toBe(1)

    for (const r of [a, b]) {
      if (r.rows[0]?.outcome === 'claimed') {
        await ai.generate({ model: 'fake', prompt: 'x' })
      }
    }
    expect(ai.invocations).toBe(1)
  })

  it('completing a request stores exactly one assistant message, and replays it', async () => {
    const reqId = crypto.randomUUID()
    const c = await claim(USER_A, reqId, 'javob ber')
    const { request_id, lease_token, chat_id } = c.rows[0]!

    await db.query(
      `select * from complete_chat_request($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,
      [USER_A, request_id, lease_token,
       JSON.stringify([{ type: 'note', text: 'ok' }]), JSON.stringify({ topic: 'test' }),
       'matematika', 'source', 'fake-model', 100],
    )

    const assistants = await db.query<{ n: number }>(
      `select count(*)::int as n from messages where request_id=$1 and role='assistant'`, [request_id])
    expect(assistants.rows[0]?.n).toBe(1)

    // A retry after completion must replay, never regenerate.
    const replay = await claim(USER_A, reqId, 'javob ber', chat_id)
    expect(replay.rows[0]?.outcome).toBe('completed')

    const still = await db.query<{ n: number }>(
      `select count(*)::int as n from messages where request_id=$1 and role='assistant'`, [request_id])
    expect(still.rows[0]?.n).toBe(1)
  })

  it('a stale lease cannot overwrite a completed answer', async () => {
    const reqId = crypto.randomUUID()
    const c = await claim(USER_A, reqId, 'lease test')
    const { request_id, lease_token } = c.rows[0]!
    await db.query(`select * from complete_chat_request($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,
      [USER_A, request_id, lease_token,
       JSON.stringify([{ type: 'note', text: 'first' }]), JSON.stringify({}), 's', 'source', 'm', 1])

    // A second worker holding a stale token tries to write its own result.
    const stale = await db.query<{ outcome: string }>(
      `select * from complete_chat_request($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,
      [USER_A, request_id, crypto.randomUUID(),
       JSON.stringify([{ type: 'note', text: 'SECOND' }]), JSON.stringify({}), 's', 'source', 'm', 1])
    expect(stale.rows[0]?.outcome).not.toBe('completed')

    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from messages where request_id=$1 and role='assistant'`, [request_id])
    expect(rows.rows[0]?.n).toBe(1)
  })

  it('the request lease can be extended while generation runs', async () => {
    const reqId = crypto.randomUUID()
    const c = await claim(USER_A, reqId, 'long')
    const { request_id, lease_token } = c.rows[0]!
    const ext = await db.query<{ extend_chat_request_lease: string | null }>(
      `select extend_chat_request_lease($1,$2,$3,$4) as extend_chat_request_lease`,
      [USER_A, request_id, lease_token, 120])
    expect(ext.rows[0]?.extend_chat_request_lease).toBeTruthy()

    // A worker that no longer owns the lease is told so, and must not persist.
    const lost = await db.query<{ extend_chat_request_lease: string | null }>(
      `select extend_chat_request_lease($1,$2,$3,$4) as extend_chat_request_lease`,
      [USER_A, request_id, crypto.randomUUID(), 120])
    expect(lost.rows[0]?.extend_chat_request_lease).toBeNull()
  })

  it('one user cannot claim or complete another user\'s request', async () => {
    const reqId = crypto.randomUUID()
    const c = await claim(USER_A, reqId, 'mine')
    const { request_id, lease_token } = c.rows[0]!

    // Even holding A's real lease token, B is scoped out by user_id: the RPC
    // refuses to find the request at all rather than writing to it.
    await expect(
      db.query(
        `select * from complete_chat_request($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,
        [USER_B, request_id, lease_token,
         JSON.stringify([{ type: 'note', text: 'stolen' }]), JSON.stringify({}), 's', 'source', 'm', 1]),
    ).rejects.toThrow(/request_not_found/)

    // No assistant message was written by the hijack attempt.
    const mine = await db.query<{ n: number }>(
      `select count(*)::int as n from messages where request_id=$1 and role='assistant'`, [request_id])
    expect(mine.rows[0]?.n).toBe(0)
  })
})
