-- Veltrix Hom Backend Part 4: Studio + Productivity + Memory + Notifications + Search foundation.
-- Additive only over Manager-accepted Part 3 exact SHA 801f44c6bf91dfdd1492b1927f59f2d3f729c768.

create extension if not exists pgcrypto;

-- Studio registry: type/version/capability based and intentionally not a single Markdown contract.
create table if not exists public.vh_studio_artifact_registry (
  artifact_type text not null,
  version integer not null check (version > 0),
  display_name text not null check (char_length(display_name) between 1 and 120),
  renderer_key text not null check (char_length(renderer_key) between 1 and 120),
  output_kind text not null check (output_kind in ('structured','binary','hybrid','audio')),
  input_schema jsonb not null check (jsonb_typeof(input_schema)='object'),
  output_schema jsonb not null check (jsonb_typeof(output_schema)='object'),
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities)='object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(artifact_type,version)
);

insert into public.vh_studio_artifact_registry(artifact_type,version,display_name,renderer_key,output_kind,input_schema,output_schema,capabilities)
values
 ('flashcards',1,'Flashcards','studio.flashcards.v1','structured','{"type":"object","properties":{"prompt":{"type":"string"}}}'::jsonb,'{"type":"object","required":["cards"],"properties":{"cards":{"type":"array"}}}'::jsonb,'{"editable":true,"regeneratable":true}'::jsonb),
 ('quiz',1,'Quiz','studio.quiz.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["questions"],"properties":{"questions":{"type":"array"}}}'::jsonb,'{"editable":true,"scorable":true}'::jsonb),
 ('practice_test',1,'Practice Test','studio.practice-test.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"}}}'::jsonb,'{"editable":true,"scorable":true}'::jsonb),
 ('study_guide',1,'Study Guide','studio.study-guide.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"}}}'::jsonb,'{"editable":true}'::jsonb),
 ('mind_map',1,'Mind Map','studio.mind-map.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["nodes","edges"],"properties":{"nodes":{"type":"array"},"edges":{"type":"array"}}}'::jsonb,'{"editable":true,"graph":true}'::jsonb),
 ('summary',1,'Summary','studio.summary.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"},"keyPoints":{"type":"array"}}}'::jsonb,'{"editable":true}'::jsonb),
 ('notes',1,'Notes','studio.notes.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["blocks"],"properties":{"blocks":{"type":"array"}}}'::jsonb,'{"editable":true,"noteCompatible":true}'::jsonb),
 ('presentation',1,'Presentation / Slides','studio.presentation.v1','binary','{"type":"object"}'::jsonb,'{"type":"object","required":["slides"],"properties":{"slides":{"type":"array"},"binaryObjectId":{"type":["string","null"]}}}'::jsonb,'{"editable":true,"binary":true}'::jsonb),
 ('infographic',1,'Infographic','studio.infographic.v1','binary','{"type":"object"}'::jsonb,'{"type":"object","required":["layout"],"properties":{"layout":{"type":"object"},"binaryObjectId":{"type":["string","null"]}}}'::jsonb,'{"editable":true,"binary":true}'::jsonb),
 ('audio_lesson',1,'Audio Lesson / Recap','studio.audio-lesson.v1','audio','{"type":"object"}'::jsonb,'{"type":"object","required":["segments"],"properties":{"segments":{"type":"array"},"binaryObjectId":{"type":["string","null"]}}}'::jsonb,'{"editable":true,"binary":true,"audio":true}'::jsonb),
 ('cheat_sheet',1,'Cheat Sheet / Quick Review','studio.cheat-sheet.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["items"],"properties":{"items":{"type":"array"}}}'::jsonb,'{"editable":true}'::jsonb),
 ('question_bank',1,'Question Bank','studio.question-bank.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["questions"],"properties":{"questions":{"type":"array"}}}'::jsonb,'{"editable":true,"scorable":true}'::jsonb),
 ('timeline',1,'Timeline','studio.timeline.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["events"],"properties":{"events":{"type":"array"}}}'::jsonb,'{"editable":true,"chronological":true}'::jsonb),
 ('concept_breakdown',1,'Concept Breakdown','studio.concept-breakdown.v1','structured','{"type":"object"}'::jsonb,'{"type":"object","required":["concepts"],"properties":{"concepts":{"type":"array"}}}'::jsonb,'{"editable":true}'::jsonb)
on conflict (artifact_type,version) do update set
 display_name=excluded.display_name,
 renderer_key=excluded.renderer_key,
 output_kind=excluded.output_kind,
 input_schema=excluded.input_schema,
 output_schema=excluded.output_schema,
 capabilities=excluded.capabilities,
 active=excluded.active,
 updated_at=now();

create table if not exists public.vh_studio_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  title text check (title is null or char_length(title) <= 200),
  prompt text check (prompt is null or char_length(prompt) <= 20000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create unique index if not exists vh_studio_sessions_id_owner_uq on public.vh_studio_sessions(id,account_id);
create index if not exists vh_studio_sessions_recent_idx on public.vh_studio_sessions(account_id,last_used_at desc,id desc);
alter table public.vh_studio_sessions enable row level security;

create table if not exists public.vh_studio_generations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  session_id uuid references public.vh_studio_sessions(id) on delete set null,
  artifact_type text not null,
  artifact_type_version integer not null default 1,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  prompt text not null default '' check (char_length(prompt) <= 20000),
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress smallint not null default 0 check (progress between 0 and 100),
  resolved_context_fingerprint text check (resolved_context_fingerprint is null or resolved_context_fingerprint ~ '^[0-9a-f]{64}$'),
  ai_route jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_route)='object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  safe_error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key(artifact_type,artifact_type_version) references public.vh_studio_artifact_registry(artifact_type,version),
  unique(account_id,idempotency_key)
);
create unique index if not exists vh_studio_generations_id_owner_uq on public.vh_studio_generations(id,account_id);
create index if not exists vh_studio_generations_recent_idx on public.vh_studio_generations(account_id,created_at desc,id desc);
alter table public.vh_studio_generations enable row level security;

create table if not exists public.vh_studio_input_bindings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  generation_id uuid not null references public.vh_studio_generations(id) on delete cascade,
  binding_kind text not null check (binding_kind in ('project','notebook','conversation','library_asset','library_selection','collection','tag','note','direct_text','direct_attachment')),
  target_id uuid,
  selector jsonb not null default '{}'::jsonb check (jsonb_typeof(selector)='object'),
  direct_text text,
  resolved_revision text,
  resolved_fingerprint text check (resolved_fingerprint is null or resolved_fingerprint ~ '^[0-9a-f]{64}$'),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(generation_id,account_id) references public.vh_studio_generations(id,account_id) on delete cascade,
  check ((binding_kind='direct_text' and direct_text is not null and target_id is null) or binding_kind<>'direct_text')
);
create index if not exists vh_studio_bindings_generation_idx on public.vh_studio_input_bindings(account_id,generation_id,id);
alter table public.vh_studio_input_bindings enable row level security;

create table if not exists public.vh_studio_generation_attachments (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  generation_id uuid not null references public.vh_studio_generations(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete restrict,
  source_size_bytes bigint not null check (source_size_bytes >= 0),
  created_at timestamptz not null default now(),
  primary key(generation_id,asset_id),
  foreign key(generation_id,account_id) references public.vh_studio_generations(id,account_id) on delete cascade
);
create index if not exists vh_studio_attachments_owner_idx on public.vh_studio_generation_attachments(account_id,generation_id);
alter table public.vh_studio_generation_attachments enable row level security;

create table if not exists public.vh_studio_artifacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  artifact_type text not null,
  artifact_type_version integer not null default 1,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  current_version integer not null default 1 check (current_version > 0),
  revision bigint not null default 1 check (revision > 0),
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(artifact_type,artifact_type_version) references public.vh_studio_artifact_registry(artifact_type,version),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create unique index if not exists vh_studio_artifacts_id_owner_uq on public.vh_studio_artifacts(id,account_id);
create index if not exists vh_studio_artifacts_recent_idx on public.vh_studio_artifacts(account_id,trashed_at,updated_at desc,id desc);
alter table public.vh_studio_artifacts enable row level security;

create table if not exists public.vh_studio_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  artifact_id uuid not null references public.vh_studio_artifacts(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  source_kind text not null check (source_kind in ('AI_GENERATED','USER_EDIT','REGENERATED','PROMPT_REVISION','RESTORED')),
  generation_id uuid references public.vh_studio_generations(id) on delete set null,
  based_on_version integer,
  content jsonb not null default '{}'::jsonb,
  binary_object_id uuid references public.vh_storage_objects(id) on delete restrict,
  source_fingerprint text check (source_fingerprint is null or source_fingerprint ~ '^[0-9a-f]{64}$'),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(artifact_id,version_no),
  foreign key(artifact_id,account_id) references public.vh_studio_artifacts(id,account_id) on delete cascade
);
create index if not exists vh_studio_artifact_versions_owner_idx on public.vh_studio_artifact_versions(account_id,artifact_id,version_no desc);
alter table public.vh_studio_artifact_versions enable row level security;

-- Independent first-class Goals and Todos.
create table if not exists public.vh_goals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  parent_goal_id uuid references public.vh_goals(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text check (description is null or char_length(description) <= 10000),
  deadline timestamptz,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  state text not null default 'ACTIVE' check (state in ('ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
  pinned boolean not null default false,
  manual_order bigint not null default 0,
  progress_basis_points integer not null default 0 check (progress_basis_points between 0 and 10000),
  weight numeric(12,6) not null default 1 check (weight >= 0),
  revision bigint not null default 1 check (revision > 0),
  trashed_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (parent_goal_id is null or parent_goal_id <> id),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create unique index if not exists vh_goals_id_owner_uq on public.vh_goals(id,account_id);
create index if not exists vh_goals_owner_idx on public.vh_goals(account_id,trashed_at,state,pinned desc,manual_order,updated_at desc,id desc);
alter table public.vh_goals enable row level security;

create table if not exists public.vh_goal_milestones (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  goal_id uuid not null references public.vh_goals(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  weight numeric(12,6) not null default 1 check (weight >= 0),
  completed boolean not null default false,
  archived_at timestamptz,
  trashed_at timestamptz,
  manual_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(goal_id,account_id) references public.vh_goals(id,account_id) on delete cascade
);
create index if not exists vh_goal_milestones_goal_idx on public.vh_goal_milestones(account_id,goal_id,trashed_at,archived_at,manual_order,id);
alter table public.vh_goal_milestones enable row level security;

create table if not exists public.vh_todos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text check (description is null or char_length(description) <= 10000),
  deadline timestamptz,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  pinned boolean not null default false,
  manual_order bigint not null default 0,
  revision bigint not null default 1 check (revision > 0),
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create unique index if not exists vh_todos_id_owner_uq on public.vh_todos(id,account_id);
create index if not exists vh_todos_owner_idx on public.vh_todos(account_id,trashed_at,archived_at,status,deadline,id);
alter table public.vh_todos enable row level security;

create table if not exists public.vh_todo_check_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  todo_id uuid not null references public.vh_todos(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  completed boolean not null default false,
  manual_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(todo_id,account_id) references public.vh_todos(id,account_id) on delete cascade
);
create index if not exists vh_todo_check_items_idx on public.vh_todo_check_items(account_id,todo_id,manual_order,id);
alter table public.vh_todo_check_items enable row level security;

create table if not exists public.vh_goal_todo_links (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  goal_id uuid not null references public.vh_goals(id) on delete cascade,
  todo_id uuid not null references public.vh_todos(id) on delete cascade,
  weight numeric(12,6) not null default 1 check (weight >= 0),
  created_at timestamptz not null default now(),
  primary key(goal_id,todo_id),
  foreign key(goal_id,account_id) references public.vh_goals(id,account_id) on delete cascade,
  foreign key(todo_id,account_id) references public.vh_todos(id,account_id) on delete cascade
);
create index if not exists vh_goal_todo_links_todo_idx on public.vh_goal_todo_links(account_id,todo_id,goal_id);
alter table public.vh_goal_todo_links enable row level security;

create table if not exists public.vh_productivity_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('goal','todo','note')),
  owner_id uuid not null,
  target_kind text not null check (target_kind in ('project','notebook','conversation','library_asset','goal','todo','note','tag')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique(account_id,owner_kind,owner_id,target_kind,target_id)
);
create index if not exists vh_productivity_links_owner_idx on public.vh_productivity_links(account_id,owner_kind,owner_id);
alter table public.vh_productivity_links enable row level security;

-- Structured rich Notes. Content remains JSON blocks with schema validation in the application layer.
create table if not exists public.vh_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  title text not null default 'Untitled Note' check (char_length(title) between 1 and 240),
  pinned boolean not null default false,
  favorite boolean not null default false,
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  current_revision_id uuid,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create unique index if not exists vh_notes_id_owner_uq on public.vh_notes(id,account_id);
create index if not exists vh_notes_owner_idx on public.vh_notes(account_id,trashed_at,archived_at,pinned desc,updated_at desc,id desc);
alter table public.vh_notes enable row level security;

create table if not exists public.vh_note_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  note_id uuid not null references public.vh_notes(id) on delete cascade,
  revision_no bigint not null check (revision_no > 0),
  parent_revision_id uuid references public.vh_note_versions(id) on delete set null,
  source_kind text not null check (source_kind in ('USER','AI_ACCEPTED','RESTORED','AUTOSAVE')),
  blocks jsonb not null check (jsonb_typeof(blocks)='array'),
  blocks_fingerprint text not null check (blocks_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(note_id,revision_no),
  foreign key(note_id,account_id) references public.vh_notes(id,account_id) on delete cascade
);
create unique index if not exists vh_note_versions_id_owner_uq on public.vh_note_versions(id,account_id);
create index if not exists vh_note_versions_note_idx on public.vh_note_versions(account_id,note_id,revision_no desc);
alter table public.vh_note_versions enable row level security;

alter table public.vh_notes add constraint vh_notes_current_revision_fk
  foreign key(current_revision_id,account_id) references public.vh_note_versions(id,account_id) deferrable initially deferred;

create table if not exists public.vh_ai_change_proposals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  target_kind text not null check (target_kind in ('goal','todo','note')),
  target_id uuid,
  operation text not null check (char_length(operation) between 1 and 80),
  base_revision bigint,
  proposal jsonb not null check (jsonb_typeof(proposal)='object'),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','EXPIRED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists vh_ai_change_proposals_owner_idx on public.vh_ai_change_proposals(account_id,status,created_at desc,id desc);
alter table public.vh_ai_change_proposals enable row level security;

-- Global user Memory only: no isolated project/notebook memory stores.
create table if not exists public.vh_memories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  memory_class text not null check (memory_class in ('explicit','profile','preference','learning','interest','behavior_workflow','project_signal','notebook_signal','conversation_derived','goal_todo_note_signal','recent_context','ai_inference')),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  structured_value jsonb not null default '{}'::jsonb,
  authority text not null check (authority in ('EXPLICIT','INFERRED')),
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  provenance jsonb not null default '{}'::jsonb,
  canonical_key text,
  pinned boolean not null default false,
  important boolean not null default false,
  last_used_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0)
);
create unique index if not exists vh_memories_explicit_key_uq on public.vh_memories(account_id,canonical_key) where canonical_key is not null and authority='EXPLICIT' and deleted_at is null;
create index if not exists vh_memories_retrieval_idx on public.vh_memories(account_id,deleted_at,authority,pinned desc,important desc,last_used_at desc nulls last,updated_at desc,id desc);
alter table public.vh_memories enable row level security;

-- Event-driven notification infrastructure.
create table if not exists public.vh_notification_preferences (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 80),
  inside_enabled boolean not null default true,
  outside_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(account_id,category)
);
alter table public.vh_notification_preferences enable row level security;

create table if not exists public.vh_device_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  provider text not null check (provider in ('FCM','OTHER')),
  token_digest text not null check (char_length(token_digest) between 32 and 256),
  encrypted_token text not null check (char_length(encrypted_token) between 1 and 8192),
  device_label text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id,provider,token_digest)
);
create index if not exists vh_device_tokens_owner_idx on public.vh_device_tokens(account_id,active,last_seen_at desc,id desc);
alter table public.vh_device_tokens enable row level security;

create table if not exists public.vh_notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 120),
  category text not null check (char_length(category) between 1 and 80),
  severity text not null default 'info' check (severity in ('info','success','warning','error','progress','action-needed')),
  title_key text not null check (char_length(title_key) between 1 and 160),
  body_data jsonb not null default '{}'::jsonb,
  target jsonb not null default '{}'::jsonb,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  inside_state text not null default 'PENDING' check (inside_state in ('PENDING','VISIBLE','READ','DISMISSED','SUPPRESSED')),
  outside_state text not null default 'NOT_ELIGIBLE' check (outside_state in ('NOT_ELIGIBLE','QUEUED','SENT','FAILED','SUPPRESSED')),
  outside_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  outside_updated_at timestamptz
);
create index if not exists vh_notifications_owner_idx on public.vh_notifications(account_id,inside_state,created_at desc,id desc);
alter table public.vh_notifications enable row level security;

create table if not exists public.vh_attention_states (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  attention_key text not null check (char_length(attention_key) between 1 and 120),
  active boolean not null default false,
  state jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  cleared_at timestamptz,
  last_notified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(account_id,attention_key)
);
alter table public.vh_attention_states enable row level security;

-- Universal owner-scoped asynchronous search document projection.
create table if not exists public.vh_search_documents (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  entity_type text not null check (entity_type in ('project','notebook','conversation','conversation_message','library_asset','library_content','note','todo','goal','studio_artifact','tag','collection')),
  entity_id uuid not null,
  title text not null default '',
  body text not null default '',
  match_metadata jsonb not null default '{}'::jsonb,
  deep_link jsonb not null default '{}'::jsonb,
  source_revision text,
  deleted boolean not null default false,
  search_vector tsvector generated always as (to_tsvector('simple',coalesce(title,'') || ' ' || coalesce(body,''))) stored,
  updated_at timestamptz not null default now(),
  primary key(account_id,entity_type,entity_id)
);
create index if not exists vh_search_documents_fts_idx on public.vh_search_documents using gin(search_vector);
create index if not exists vh_search_documents_owner_recent_idx on public.vh_search_documents(account_id,deleted,updated_at desc,entity_type,entity_id);
alter table public.vh_search_documents enable row level security;

-- Generic relation metadata for Goal/Todo/Note tags without changing accepted Part 2 tag semantics.
create table if not exists public.vh_part4_tag_links (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  entity_type text not null check (entity_type in ('goal','todo','note')),
  entity_id uuid not null,
  tag_id uuid not null references public.vh_library_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(account_id,entity_type,entity_id,tag_id)
);
create index if not exists vh_part4_tag_links_tag_idx on public.vh_part4_tag_links(account_id,tag_id,entity_type,entity_id);
alter table public.vh_part4_tag_links enable row level security;

-- Registry is server-owned and read-only to application clients; all owner data remains RLS enabled.
-- Stage20+ adds owner-validation RPCs, deterministic progress, binding resolution, search/trash workers and security hardening.
