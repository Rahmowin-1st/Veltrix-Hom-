import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const DB_DIR = join(HERE, '..', 'db')
const MIGRATIONS = [
  'migration-100-vh-part1-foundation.sql',
  'migration-101-vh-part1-hardening.sql',
  'migration-102-vh-part1-service-only.sql',
  'migration-103-vh-part1-index-hardening.sql',
]

let opened: PGlite[] = []

afterEach(async () => {
  for (const db of opened.splice(0)) await db.close()
})

async function freshDb() {
  const db = await PGlite.create({ extensions: { pgcrypto } })
  opened.push(db)
  await db.exec(`
    create extension if not exists pgcrypto;
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint
    );
    do $$ begin if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
    do $$ begin if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
    do $$ begin if not exists (select from pg_roles where rolname='anon') then create role anon; end if; end $$;
  `)
  return db
}

async function applyPart1(db: PGlite) {
  for (const file of MIGRATIONS) await db.exec(readFileSync(join(DB_DIR, file), 'utf8'))
}

describe('Part 1 migration chain', () => {
  it('applies from a fresh PostgreSQL database and creates the canonical private foundation', async () => {
    const db = await freshDb()
    await applyPart1(db)

    const tables = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'vh_%'`)
    expect(tables.rows[0]?.n).toBe(15)

    const buckets = await db.query<{ id: string; public: boolean }>(`select id, public from storage.buckets where id like 'vh-%' order by id`)
    expect(buckets.rows).toEqual([
      { id: 'vh-library', public: false },
      { id: 'vh-profile', public: false },
      { id: 'vh-studio', public: false },
    ])

    const indexes = await db.query<{ indexname: string }>(`
      select indexname from pg_indexes where schemaname='public' and indexname in (
        'vh_profiles_photo_object_idx','vh_quota_overrides_policy_key_idx',
        'vh_quota_reservations_account_idx','vh_sessions_rotated_from_idx'
      ) order by indexname`)
    expect(indexes.rows.map(r => r.indexname)).toHaveLength(4)
  })

  it('upgrades an existing legacy database without deleting legacy data and is repeatable', async () => {
    const db = await freshDb()
    await db.exec(`create table public.subjects_legacy_probe(id uuid primary key, marker text not null); insert into public.subjects_legacy_probe values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','keep-me')`)
    await applyPart1(db)
    await applyPart1(db)

    const legacy = await db.query<{ marker: string }>(`select marker from public.subjects_legacy_probe where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`)
    expect(legacy.rows[0]?.marker).toBe('keep-me')
    const migrationObjects = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='vh_accounts'`)
    expect(migrationObjects.rows[0]?.n).toBe(1)
  })

  it('enforces exact Library quota atomically and retains the frozen 900 MiB warning policy', async () => {
    const db = await freshDb()
    await applyPart1(db)
    const accountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await db.exec(`insert into public.vh_accounts(id,email) values ('${accountId}','quota@example.com')`)

    const policy = await db.query<{ hard_bytes: string; warning_bytes: string }>(`select hard_bytes::text, warning_bytes::text from public.vh_quota_policies where policy_key='library.storage'`)
    expect(policy.rows[0]).toEqual({ hard_bytes: '1073741824', warning_bytes: '943718400' })

    const reservation = await db.query<{ id: string }>(`select public.vh_reserve_quota($1,'library',$2,$3) as id`, [accountId, 1073741824, 1073741824])
    expect(reservation.rows[0]?.id).toBeTruthy()
    await expect(db.query(`select public.vh_reserve_quota($1,'library',1,$2)`, [accountId, 1073741824])).rejects.toThrow(/quota_exceeded/)
    const usage = await db.query<{ bytes_used: string; bytes_reserved: string }>(`select bytes_used::text, bytes_reserved::text from public.vh_quota_usage where account_id=$1 and scope='library'`, [accountId])
    expect(usage.rows[0]).toEqual({ bytes_used: '0', bytes_reserved: '1073741824' })
  })

  it('enforces canonical profile constraints and service-only direct database access', async () => {
    const db = await freshDb()
    await applyPart1(db)
    const accountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    await db.exec(`insert into public.vh_accounts(id,email) values ('${accountId}','profile@example.com')`)

    await expect(db.exec(`insert into public.vh_profiles(account_id,avatar_id) values ('${accountId}','dragon')`)).rejects.toThrow()
    await expect(db.exec(`insert into public.vh_profiles(account_id,class_level) values ('${accountId}','12')`)).rejects.toThrow()
    await expect(db.exec(`insert into public.vh_profiles(account_id,language) values ('${accountId}','uz')`)).rejects.toThrow()
    await db.exec(`insert into public.vh_profiles(account_id,avatar_id,class_level,language) values ('${accountId}','wolf','11','en')`)

    await db.exec(`set role anon`)
    try {
      await expect(db.query(`select * from public.vh_accounts`)).rejects.toThrow()
    } finally {
      await db.exec(`reset role`)
    }
  })

  it('persists session rotation/revocation and 30-day Trash lifecycle fields without raw tokens', async () => {
    const db = await freshDb()
    await applyPart1(db)
    const accountId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    await db.exec(`insert into public.vh_accounts(id,email) values ('${accountId}','session@example.com')`)
    const first = await db.query<{ id: string }>(`
      insert into public.vh_sessions(account_id,access_digest,refresh_digest,access_expires_at,refresh_expires_at)
      values ($1,'access-digest-1','refresh-digest-1',now()+interval '1 hour',now()+interval '30 days') returning id`, [accountId])
    const firstId = first.rows[0]!.id
    await db.query(`update public.vh_sessions set revoked_at=now() where id=$1`, [firstId])
    await db.query(`insert into public.vh_sessions(account_id,access_digest,refresh_digest,access_expires_at,refresh_expires_at,rotated_from) values ($1,'access-digest-2','refresh-digest-2',now()+interval '1 hour',now()+interval '30 days',$2)`, [accountId, firstId])
    const chain = await db.query<{ revoked: boolean; rotations: number }>(`select (revoked_at is not null) as revoked, (select count(*)::int from public.vh_sessions where rotated_from=$1) as rotations from public.vh_sessions where id=$1`, [firstId])
    expect(chain.rows[0]).toEqual({ revoked: true, rotations: 1 })

    const columns = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name='vh_sessions'`)
    const names = columns.rows.map(r => r.column_name)
    expect(names).toContain('access_digest')
    expect(names).toContain('refresh_digest')
    expect(names).not.toContain('access_token')
    expect(names).not.toContain('refresh_token')

    const object = await db.query<{ id: string }>(`insert into public.vh_storage_objects(account_id,bucket,object_path,kind,state,size_bytes,trashed_at,purge_after) values ($1,'vh-library',$2,'library','trashed',10,now(),now()+interval '30 days') returning id`, [accountId, `${accountId}/x/original`])
    const trash = await db.query<{ days: number }>(`select round(extract(epoch from (purge_after-trashed_at))/86400)::int as days from public.vh_storage_objects where id=$1`, [object.rows[0]!.id])
    expect(trash.rows[0]?.days).toBe(30)
  })
})
