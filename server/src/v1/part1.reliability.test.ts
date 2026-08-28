import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Response } from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { writeEvent } from './stream.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DB_DIR = join(HERE, '..', 'db')
const MIGRATIONS = [100,101,102,103].map(n => {
  const suffix = n === 100 ? 'vh-part1-foundation' : n === 101 ? 'vh-part1-hardening' : n === 102 ? 'vh-part1-service-only' : 'vh-part1-index-hardening'
  return `migration-${n}-${suffix}.sql`
})
let opened: PGlite[] = []

afterEach(async () => { for (const db of opened.splice(0)) await db.close() })

async function dbWithPart1() {
  const db = await PGlite.create({ extensions: { pgcrypto } })
  opened.push(db)
  await db.exec(`
    create extension if not exists pgcrypto;
    create schema if not exists storage;
    create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint);
    do $$ begin if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
    do $$ begin if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
    do $$ begin if not exists (select from pg_roles where rolname='anon') then create role anon; end if; end $$;
  `)
  for (const file of MIGRATIONS) await db.exec(readFileSync(join(DB_DIR, file), 'utf8'))
  await db.exec(`insert into public.vh_accounts(id,email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reliability@example.com')`)
  return db
}

describe('Part 1 durable reliability primitives', () => {
  it('rejects duplicate authoritative objects within an idempotency scope', async () => {
    const db = await dbWithPart1()
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    await db.query(`insert into public.vh_idempotency(account_id,route,idempotency_key,request_hash) values ($1,'POST:/api/v1/test','same-key','hash-a')`, [id])
    await expect(db.query(`insert into public.vh_idempotency(account_id,route,idempotency_key,request_hash) values ($1,'POST:/api/v1/test','same-key','hash-a')`, [id])).rejects.toThrow()
    await db.query(`insert into public.vh_idempotency(account_id,route,idempotency_key,request_hash) values ($1,'POST:/api/v1/other','same-key','hash-b')`, [id])
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from public.vh_idempotency where account_id=$1`, [id])
    expect(rows.rows[0]?.n).toBe(2)
  })

  it('enforces a persistent rate-limit boundary atomically', async () => {
    const db = await dbWithPart1()
    const a = await db.query<{ allowed: boolean }>(`select allowed from public.vh_consume_rate_limit('auth:probe',2,600)`)
    const b = await db.query<{ allowed: boolean }>(`select allowed from public.vh_consume_rate_limit('auth:probe',2,600)`)
    const c = await db.query<{ allowed: boolean; retry_after_seconds: number }>(`select allowed,retry_after_seconds from public.vh_consume_rate_limit('auth:probe',2,600)`)
    expect([a.rows[0]?.allowed,b.rows[0]?.allowed,c.rows[0]?.allowed]).toEqual([true,true,false])
    expect(c.rows[0]?.retry_after_seconds).toBeGreaterThan(0)
  })

  it('claims a queued job with a lease exactly once per claim operation', async () => {
    const db = await dbWithPart1()
    const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const inserted = await db.query<{ id: string }>(`insert into public.vh_jobs(account_id,kind,payload,idempotency_key) values ($1,'part1_probe','{}','job-key') returning id`, [accountId])
    const jobId = inserted.rows[0]!.id
    const claimed = await db.query<{ id: string; state: string; attempts: number; lease_owner: string }>(`select id,state,attempts,lease_owner from public.vh_claim_job('worker-a',60)`)
    expect(claimed.rows[0]).toMatchObject({ id: jobId, state: 'running', attempts: 1, lease_owner: 'worker-a' })
    const second = await db.query(`select * from public.vh_claim_job('worker-b',60)`)
    expect(second.rows).toHaveLength(0)
  })
})

class FakeResponse extends EventEmitter {
  writableEnded = false
  destroyed = false
  writes: string[] = []
  backpressure = false
  write(chunk: string) {
    this.writes.push(chunk)
    if (!this.backpressure) return true
    this.backpressure = false
    queueMicrotask(() => this.emit('drain'))
    return false
  }
}

describe('Part 1 SSE transport envelope', () => {
  it('emits typed sequence-addressable JSON SSE events', async () => {
    const res = new FakeResponse()
    await writeEvent(res as unknown as Response, { requestId: 'req-1', seq: 7, type: 'block_delta', payload: { block: { kind: 'text', delta: 'hello' } } })
    expect(res.writes).toHaveLength(1)
    expect(res.writes[0]).toContain('id: 7\n')
    expect(res.writes[0]).toContain('event: block_delta\n')
    expect(res.writes[0]).toContain('"requestId":"req-1"')
    expect(res.writes[0]).toContain('"kind":"text"')
  })

  it('waits for drain when the response applies backpressure', async () => {
    const res = new FakeResponse()
    res.backpressure = true
    await expect(writeEvent(res as unknown as Response, { requestId: 'req-2', seq: 1, type: 'heartbeat', payload: { ts: 1 } })).resolves.toBeUndefined()
    expect(res.writes[0]).toContain('event: heartbeat')
  })

  it('does not write after disconnect/end', async () => {
    const res = new FakeResponse()
    res.destroyed = true
    await writeEvent(res as unknown as Response, { requestId: 'req-3', seq: 1, type: 'done', payload: { completed: true } })
    expect(res.writes).toHaveLength(0)
  })
})
