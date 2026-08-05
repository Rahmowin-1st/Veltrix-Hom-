import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A real PostgreSQL engine for tests.
 *
 * PGlite is genuine PostgreSQL compiled to WASM, so these tests exercise the
 * actual SQL — real constraints, real `FOR UPDATE SKIP LOCKED`, real RPC
 * bodies — rather than a mock. `pgvector` is not bundled in this build, so
 * the base schema's `vector(n)` columns are shimmed; the entire migration
 * chain 002→010 is vector-free, so nothing under test is affected.
 *
 * Caveat stated honestly: PGlite is single-connection, so it cannot prove
 * multi-process parallel claiming. Those runs belong on a real Postgres and
 * are listed in TEST_REPORT_V10.md.
 */

const DB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(DB_DIR, f), 'utf8')

export const USER_A = '00000000-0000-0000-0000-00000000000a'
export const USER_B = '00000000-0000-0000-0000-00000000000b'

const shim = (sql: string) =>
  sql
    .replace(/create extension if not exists vector;/gi, '-- vector shimmed')
    .replace(/vector\(\d+\)/g, 'real[]')
    .replace(/create index[^;]*using hnsw[^;]*;/gis, '-- hnsw shimmed')

/** Boots a database with the full V10 schema and both test accounts. */
export async function createTestDb(opts: { skip009?: boolean } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto } })
  await db.exec(`
    create extension if not exists pg_trgm; create extension if not exists pgcrypto;
    create schema if not exists auth; create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${USER_A}'::uuid $$;
    do $$ begin if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
    do $$ begin if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
    do $$ begin if not exists (select from pg_roles where rolname='anon') then create role anon; end if; end $$;
    create function public.vec_cos_stub(a real[], b real[]) returns float language sql immutable as $$ select 0.0::float $$;
    create operator <=> (leftarg=real[], rightarg=real[], function=public.vec_cos_stub);
  `)
  await db.exec(`insert into auth.users (id,email) values ('${USER_A}','a@v.local'),('${USER_B}','b@v.local') on conflict do nothing;`)
  await db.exec(shim(read('schema.sql')))
  const chain = opts.skip009
    ? ['002', '003', '004', '005', '006', '007', '008']
    : ['002', '003', '004', '005', '006', '007', '008', '009']
  for (const n of chain) await db.exec(read(`migration-${n}.sql`))
  await db.exec(read('migration-010.sql'))
  await db.exec(read('migration-011.sql'))
  await db.exec(`insert into profiles (id, full_name) values ('${USER_A}','A'),('${USER_B}','B') on conflict do nothing;`)

  // Supabase grants the `authenticated` role table-level access and then lets
  // RLS decide which ROWS it may see. Without these grants the role is denied
  // at the table level and an RLS test would pass for the wrong reason.
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant select on all tables in schema public to anon;
  `)
  return db
}

export function migrationSql(name: string): string {
  return read(name)
}
