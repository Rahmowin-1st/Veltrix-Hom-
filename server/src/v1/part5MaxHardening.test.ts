import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const DB_DIR = join(HERE, '..', 'db')
const ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let opened: PGlite[] = []

afterEach(async () => { for (const db of opened.splice(0)) await db.close() })

async function hardeningDb() {
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
  await db.exec(readFileSync(join(DB_DIR, 'migration-100-vh-part1-foundation.sql'), 'utf8'))
  await db.exec(readFileSync(join(DB_DIR, 'migration-133-vh-part5-max-hardening-durability.sql'), 'utf8'))
  await db.exec(`insert into public.vh_accounts(id,email) values ('${ACCOUNT_A}','max-a@example.invalid')`)
  return db
}

describe('Part5 MAX canonical job durability hardening', () => {
  it('reclaims an expired canonical RUNNING job and fences the zombie owner', async () => {
    const db = await hardeningDb()
    const inserted = await db.query<{ id: string }>(`
      insert into public.vh_jobs(account_id,kind,payload,max_attempts)
      values ($1,'max.lease.probe','{}',3) returning id`, [ACCOUNT_A])
    const id = inserted.rows[0]!.id

    const first = await db.query<{ id: string; attempts: number; lease_owner: string }>(
      `select id,attempts,lease_owner from public.vh_claim_job('worker-a',60)`)
    expect(first.rows[0]).toMatchObject({ id, attempts: 1, lease_owner: 'worker-a' })

    await db.query(`update public.vh_jobs set lease_expires_at=now()-interval '1 second' where id=$1`, [id])
    const recovered = await db.query<{ id: string; attempts: number; lease_owner: string }>(
      `select id,attempts,lease_owner from public.vh_claim_job('worker-b',60)`)
    expect(recovered.rows[0]).toMatchObject({ id, attempts: 2, lease_owner: 'worker-b' })

    const zombieWrite = await db.query<{ id: string }>(`
      update public.vh_jobs set checkpoint='{"zombie":true}'::jsonb
      where id=$1 and state='running' and lease_owner='worker-a' returning id`, [id])
    expect(zombieWrite.rows).toHaveLength(0)
  })

  it('fails an exhausted stale canonical job instead of leaving it RUNNING forever', async () => {
    const db = await hardeningDb()
    const inserted = await db.query<{ id: string }>(`
      insert into public.vh_jobs(account_id,kind,payload,max_attempts)
      values ($1,'max.lease.exhausted','{}',1) returning id`, [ACCOUNT_A])
    const id = inserted.rows[0]!.id
    await db.query(`select * from public.vh_claim_job('worker-a',60)`)
    await db.query(`update public.vh_jobs set lease_expires_at=now()-interval '1 second' where id=$1`, [id])

    const next = await db.query(`select * from public.vh_claim_job('worker-b',60)`)
    expect(next.rows).toHaveLength(0)
    const row = await db.query<{ state: string; last_error_code: string | null; lease_owner: string | null }>(
      `select state,last_error_code,lease_owner from public.vh_jobs where id=$1`, [id])
    expect(row.rows[0]).toEqual({ state: 'failed', last_error_code: 'JobLeaseExpired', lease_owner: null })
  })

  it('renews only a currently valid lease owned by the same worker', async () => {
    const db = await hardeningDb()
    const inserted = await db.query<{ id: string }>(`
      insert into public.vh_jobs(account_id,kind,payload,max_attempts)
      values ($1,'max.lease.renew','{}',3) returning id`, [ACCOUNT_A])
    const id = inserted.rows[0]!.id
    await db.query(`select * from public.vh_claim_job('worker-a',60)`)

    const ok = await db.query<{ renewed: boolean }>(`select public.vh_renew_job_lease($1,'worker-a',60) renewed`, [id])
    const wrong = await db.query<{ renewed: boolean }>(`select public.vh_renew_job_lease($1,'worker-b',60) renewed`, [id])
    expect(ok.rows[0]?.renewed).toBe(true)
    expect(wrong.rows[0]?.renewed).toBe(false)

    await db.query(`update public.vh_jobs set lease_expires_at=now()-interval '1 second' where id=$1`, [id])
    const stale = await db.query<{ renewed: boolean }>(`select public.vh_renew_job_lease($1,'worker-a',60) renewed`, [id])
    expect(stale.rows[0]?.renewed).toBe(false)
  })
})
