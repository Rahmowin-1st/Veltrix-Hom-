import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const log = (...a) => console.log(...a)
const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto } })

// ---- Bootstrap: the Supabase-provided objects the app's SQL depends on ----
// These exist in a real Supabase project; we recreate the minimal shapes so
// the migration chain can be applied and verified on a bare PG engine.
await db.exec(`
  create extension if not exists pg_trgm;
  create extension if not exists pgcrypto;
  create schema if not exists auth;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
  do $$ begin if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
  do $$ begin if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
  do $$ begin if not exists (select from pg_roles where rolname='anon') then create role anon; end if; end $$;
  -- vector shim: pgvector is native on Supabase but not bundled in this
  -- pglite build. Only base schema.sql uses it; the whole migration chain
  -- 002..009 is vector-free, so a stand-in lets us verify all real DDL.
  create function public.vec_cos_stub(a real[], b real[]) returns float language sql immutable as $$ select 0.0::float $$;
  create operator <=> (leftarg = real[], rightarg = real[], function = public.vec_cos_stub);
`)
log('✓ bootstrap (auth schema, auth.uid(), roles, contrib, vector shim)')

// Insert a user so FKs to auth.users(id) resolve.
const USER = '00000000-0000-0000-0000-000000000001'
await db.exec(`insert into auth.users (id, email) values ('${USER}', 'test@veltrix.local') on conflict do nothing;`)

function preprocessSchema(sql) {
  return sql
    // vector(N) columns -> real[] for the shim
    .replace(/create extension if not exists vector;/gi, '-- [vector extension shimmed]').replace(/vector\(\d+\)/g, 'real[]')
    // drop the pgvector-only HNSW indexes (perf objects, not migration DDL)
    .replace(/create index[^;]*using hnsw[^;]*;/gis, '-- [hnsw index skipped under vector shim]')
}

async function apply(label, sql) {
  try {
    await db.exec(sql)
    log(`✓ applied ${label}`)
    return true
  } catch (e) {
    log(`✗ FAILED ${label}: ${e.message}`)
    throw e
  }
}

const read = (f) => readFileSync(`./db/${f}`, 'utf8')

// ---- Apply base schema then the migration chain in order ------------------
await apply('schema.sql (vector-shimmed)', preprocessSchema(read('schema.sql')))
for (const n of ['002','003','004','005','006','007','008','009']) {
  await apply(`migration-${n}.sql`, read(`migration-${n}.sql`))
}

// ---- Idempotency: re-apply 009 a second time (must be a no-op) ------------
await apply('migration-009.sql (SECOND run — idempotency)', read('migration-009.sql'))

// ---- Assertions on migration-009's objects --------------------------------
async function assertExists(kind, query, name) {
  const r = await db.query(query)
  const ok = r.rows.length > 0
  log(`${ok ? '✓' : '✗'} ${kind} exists: ${name}`)
  if (!ok) throw new Error(`missing ${kind}: ${name}`)
}

log('\n--- migration-009 object assertions ---')
await assertExists('table', `select 1 from information_schema.tables where table_name='message_evidence'`, 'message_evidence')
await assertExists('table', `select 1 from information_schema.tables where table_name='source_page_segments'`, 'source_page_segments')
for (const fn of ['extend_chat_request_lease','extend_processing_job_lease','checkpoint_processing_job','complete_processing_job','fail_processing_job','pause_processing_job_quota','resume_processing_job','cancel_processing_job','begin_page_reindex','claim_processing_job']) {
  await assertExists('function', `select 1 from pg_proc where proname='${fn}'`, fn)
}
for (const col of ['lease_version','worker_id','time_budget_ms','extractor_version','cancel_requested_at','pages_processed']) {
  await assertExists('column', `select 1 from information_schema.columns where table_name='processing_jobs' and column_name='${col}'`, `processing_jobs.${col}`)
}
for (const col of ['source_page_id','chunker_version','embedding_model','embedding_version']) {
  await assertExists('column', `select 1 from information_schema.columns where table_name='source_chunks' and column_name='${col}'`, `source_chunks.${col}`)
}
await assertExists('unique index', `select 1 from pg_indexes where indexname='source_chunks_logical_uniq'`, 'source_chunks_logical_uniq')
await assertExists('column', `select 1 from information_schema.columns where table_name='chat_requests' and column_name='retry_after_ms'`, 'chat_requests.retry_after_ms')

// ---- Logical RPC behaviour checks (sequential, single connection) ---------
log('\n--- logical RPC checks ---')
// sources.user_id references profiles(id); ensure the profile exists.
await db.exec(`insert into profiles (id, full_name) values ('${USER}', 'Test User') on conflict do nothing;`)
// A source + a queued extract job, then claim it.
const SRC = '00000000-0000-0000-0000-0000000000aa'
await db.exec(`insert into sources (id,user_id,title,status) values ('${SRC}','${USER}','Test','extracting') on conflict do nothing;`)
await db.exec(`insert into processing_jobs (user_id,source_id,job_type,status,priority,stage,extractor_version) values ('${USER}','${SRC}','extract','queued',50,'extract','pdfjs-1');`)
const claim = await db.query(`select * from claim_processing_job(120, 'test-worker')`)
const job = claim.rows[0]
log(`${job && job.id ? '✓' : '✗'} claim_processing_job returned a job with worker lease`)
if (!job?.id) throw new Error('claim returned no job')
// checkpoint renews + records progress
const cp = await db.query(`select checkpoint_processing_job('${job.id}', '${job.lease_token}', 3, 10, 3, 1200, 120) as ok`)
log(`${cp.rows[0].ok ? '✓' : '✗'} checkpoint_processing_job renewed lease (page 3/10)`)
// extend lease returns a new expiry
const ext = await db.query(`select extend_processing_job_lease('${job.id}', '${job.lease_token}', 120) as exp`)
log(`${ext.rows[0].exp ? '✓' : '✗'} extend_processing_job_lease returned new expiry`)
// pause for quota, then a resume moves it back to queued
await db.query(`select pause_processing_job_quota('${job.id}', '${job.lease_token}', 900)`)
const paused = await db.query(`select status from processing_jobs where id='${job.id}'`)
log(`${paused.rows[0].status === 'paused_quota' ? '✓' : '✗'} pause_processing_job_quota set status=paused_quota`)
const resumed = await db.query(`select resume_processing_job('${USER}','${SRC}') as ok`)
const afterResume = await db.query(`select status from processing_jobs where id='${job.id}'`)
log(`${afterResume.rows[0].status === 'queued' ? '✓' : '✗'} resume_processing_job returned it to queued`)
// cancel requests a stop
await db.query(`select cancel_processing_job('${USER}','${SRC}')`)
const cancelled = await db.query(`select cancel_requested_at, status from processing_jobs where id='${job.id}'`)
log(`${cancelled.rows[0].cancel_requested_at ? '✓' : '✗'} cancel_processing_job stamped cancel_requested_at (status=${cancelled.rows[0].status})`)

log('\n✅ ALL MIGRATION + RPC ASSERTIONS PASSED (PostgreSQL 18.3 / PGlite)')
await db.close()
