-- Veltrix Hom Backend Part 3: Conversation / Fast Ask / ToolRun foundation.
-- Additive only over Manager-accepted Part 2.

create table if not exists public.vh_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  title text not null default 'New Conversation' check (char_length(title) between 1 and 200),
  title_source text not null default 'AUTO' check (title_source in ('AUTO','USER')),
  project_id uuid references public.vh_projects(id) on delete set null,
  permanent_reference_asset_id uuid references public.vh_library_assets(id) on delete set null,
  permanent_reference_set_at timestamptz,
  permanent_reference_tombstone jsonb not null default '{}'::jsonb,
  pinned boolean not null default false,
  pin_order bigint,
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  check (permanent_reference_asset_id is null or permanent_reference_set_at is not null),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create unique index if not exists vh_conversations_id_owner_uq on public.vh_conversations(id, account_id);
create index if not exists vh_conversations_owner_history_idx on public.vh_conversations(account_id, trashed_at, archived_at, pinned desc, pin_order, last_message_at desc nulls last, created_at desc, id desc);
create index if not exists vh_conversations_owner_project_idx on public.vh_conversations(account_id, project_id) where trashed_at is null;

create table if not exists public.vh_conversation_notebooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  conversation_id uuid not null references public.vh_conversations(id) on delete cascade,
  notebook_id uuid not null references public.vh_notebooks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(conversation_id, notebook_id),
  foreign key(conversation_id,account_id) references public.vh_conversations(id,account_id) on delete cascade,
  foreign key(notebook_id,account_id) references public.vh_notebooks(id,account_id) on delete cascade
);
create index if not exists vh_conversation_notebooks_owner_conversation_idx on public.vh_conversation_notebooks(account_id, conversation_id, created_at, id);

create table if not exists public.vh_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  conversation_id uuid not null references public.vh_conversations(id) on delete cascade,
  role text not null check (role in ('USER','ASSISTANT','SYSTEM')),
  status text not null default 'PENDING' check (status in ('PENDING','STREAMING','COMPLETED','FAILED','CANCELLED','INCOMPLETE')),
  request_id uuid,
  idempotency_key text,
  plain_text text not null default '',
  content_blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(content_blocks)='array'),
  model_route jsonb not null default '{}'::jsonb,
  usage_metrics jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key(conversation_id,account_id) references public.vh_conversations(id,account_id) on delete cascade
);
create unique index if not exists vh_conversation_messages_id_owner_uq on public.vh_conversation_messages(id,account_id);
create unique index if not exists vh_conversation_message_idem_uq on public.vh_conversation_messages(account_id,conversation_id,role,idempotency_key) where idempotency_key is not null;
create index if not exists vh_conversation_messages_history_idx on public.vh_conversation_messages(account_id,conversation_id,created_at,id);
alter table public.vh_conversation_messages add column if not exists search_vector tsvector generated always as (to_tsvector('simple',coalesce(plain_text,''))) stored;
create index if not exists vh_conversation_messages_search_idx on public.vh_conversation_messages using gin(search_vector);

create table if not exists public.vh_message_attachments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  message_id uuid not null references public.vh_conversation_messages(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete restrict,
  source_size_bytes bigint not null check (source_size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique(message_id,asset_id),
  foreign key(message_id,account_id) references public.vh_conversation_messages(id,account_id) on delete cascade,
  foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete restrict
);

create table if not exists public.vh_stream_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  message_id uuid not null references public.vh_conversation_messages(id) on delete cascade,
  request_id uuid not null,
  protocol_version integer not null default 1 check (protocol_version=1),
  seq bigint not null check (seq > 0),
  event_type text not null check (event_type in ('message.started','block.started','block.delta','block.completed','tool.started','tool.progress','tool.completed','citation.added','message.completed','message.failed','message.cancelled','heartbeat')),
  block_id text,
  block_type text,
  block_version integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(message_id,seq),
  foreign key(message_id,account_id) references public.vh_conversation_messages(id,account_id) on delete cascade
);
create index if not exists vh_stream_events_resume_idx on public.vh_stream_events(account_id,message_id,seq);

create table if not exists public.vh_conversation_tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  normalized_name text not null check (char_length(normalized_name) between 1 and 64),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id,normalized_name)
);
create unique index if not exists vh_conversation_tags_id_owner_uq on public.vh_conversation_tags(id,account_id);

create table if not exists public.vh_conversation_tag_links (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  conversation_id uuid not null references public.vh_conversations(id) on delete cascade,
  tag_id uuid not null references public.vh_conversation_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(conversation_id,tag_id),
  foreign key(conversation_id,account_id) references public.vh_conversations(id,account_id) on delete cascade,
  foreign key(tag_id,account_id) references public.vh_conversation_tags(id,account_id) on delete cascade
);

create table if not exists public.vh_interactive_test_answers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  message_id uuid not null references public.vh_conversation_messages(id) on delete cascade,
  block_id text not null,
  question_id text not null,
  selected_option_id text not null,
  correctness boolean not null,
  feedback jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique(message_id,block_id,question_id),
  foreign key(message_id,account_id) references public.vh_conversation_messages(id,account_id) on delete cascade
);

create table if not exists public.vh_fast_ask_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 20000),
  status text not null default 'PENDING' check (status in ('PENDING','STREAMING','COMPLETED','FAILED','CANCELLED','EXPIRED','CONVERTED')),
  response_blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(response_blocks)='array'),
  response_text text not null default '',
  model_route jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  converted_conversation_id uuid references public.vh_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now()+interval '24 hours'),
  updated_at timestamptz not null default now()
);
create unique index if not exists vh_fast_ask_sessions_id_owner_uq on public.vh_fast_ask_sessions(id,account_id);
create index if not exists vh_fast_ask_expiry_idx on public.vh_fast_ask_sessions(status,expires_at);

create table if not exists public.vh_fast_ask_attachments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  fast_ask_id uuid not null references public.vh_fast_ask_sessions(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete restrict,
  source_size_bytes bigint not null check (source_size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique(fast_ask_id,asset_id),
  foreign key(fast_ask_id,account_id) references public.vh_fast_ask_sessions(id,account_id) on delete cascade,
  foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete restrict
);

create table if not exists public.vh_tool_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  tool_type text not null check (tool_type in ('calculator','translate','solve','summarize')),
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  input_payload jsonb not null default '{}'::jsonb,
  input_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(input_refs)='array'),
  output_payload jsonb,
  model_route jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists vh_tool_runs_owner_recent_idx on public.vh_tool_runs(account_id,created_at desc,id desc);

-- Permanent Conversation Reference: single-set invariant survives Library asset purge.
create or replace function public.vh_set_conversation_reference(p_account_id uuid,p_conversation_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_size bigint; v_existing uuid; v_set_at timestamptz;
begin
  select permanent_reference_asset_id,permanent_reference_set_at into v_existing,v_set_at
  from public.vh_conversations where id=p_conversation_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  if v_set_at is not null then
    if v_existing=p_asset_id then return p_asset_id; end if;
    raise exception 'conversation_reference_immutable' using errcode='P0001';
  end if;
  select original_size_bytes into v_size from public.vh_library_assets
  where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status not in ('FAILED','UNSUPPORTED');
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  if v_size > 20*1024*1024 then raise exception 'conversation_reference_bytes_exceeded' using errcode='P0001'; end if;
  update public.vh_conversations set permanent_reference_asset_id=p_asset_id,permanent_reference_set_at=now(),updated_at=now(),revision=revision+1 where id=p_conversation_id;
  return p_asset_id;
end $$;

create or replace function public.vh_attach_conversation_notebook(p_account_id uuid,p_conversation_id uuid,p_notebook_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  perform 1 from public.vh_conversations where id=p_conversation_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  perform 1 from public.vh_notebooks where id=p_notebook_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'notebook_not_found' using errcode='P0002'; end if;
  select id into v_id from public.vh_conversation_notebooks where conversation_id=p_conversation_id and notebook_id=p_notebook_id;
  if found then return v_id; end if;
  insert into public.vh_conversation_notebooks(account_id,conversation_id,notebook_id) values(p_account_id,p_conversation_id,p_notebook_id) returning id into v_id;
  return v_id;
end $$;

create or replace function public.vh_add_message_attachment(p_account_id uuid,p_message_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_size bigint; v_count integer; v_bytes bigint;
begin
  perform 1 from public.vh_conversation_messages where id=p_message_id and account_id=p_account_id for update;
  if not found then raise exception 'message_not_found' using errcode='P0002'; end if;
  select id into v_id from public.vh_message_attachments where message_id=p_message_id and asset_id=p_asset_id;
  if found then return v_id; end if;
  select original_size_bytes into v_size from public.vh_library_assets where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status not in ('FAILED','UNSUPPORTED');
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  select count(*)::int,coalesce(sum(source_size_bytes),0)::bigint into v_count,v_bytes from public.vh_message_attachments where message_id=p_message_id;
  if v_count>=5 then raise exception 'message_attachment_count_exceeded' using errcode='P0001'; end if;
  if v_bytes+v_size>10*1024*1024 then raise exception 'message_attachment_bytes_exceeded' using errcode='P0001'; end if;
  insert into public.vh_message_attachments(account_id,message_id,asset_id,source_size_bytes) values(p_account_id,p_message_id,p_asset_id,v_size) returning id into v_id;
  return v_id;
end $$;

create or replace function public.vh_add_fast_ask_attachment(p_account_id uuid,p_fast_ask_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_size bigint; v_count integer; v_bytes bigint;
begin
  perform 1 from public.vh_fast_ask_sessions where id=p_fast_ask_id and account_id=p_account_id and status not in ('EXPIRED','CONVERTED') for update;
  if not found then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
  select id into v_id from public.vh_fast_ask_attachments where fast_ask_id=p_fast_ask_id and asset_id=p_asset_id;
  if found then return v_id; end if;
  select original_size_bytes into v_size from public.vh_library_assets where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status not in ('FAILED','UNSUPPORTED');
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  select count(*)::int,coalesce(sum(source_size_bytes),0)::bigint into v_count,v_bytes from public.vh_fast_ask_attachments where fast_ask_id=p_fast_ask_id;
  if v_count>=5 then raise exception 'fast_ask_attachment_count_exceeded' using errcode='P0001'; end if;
  if v_bytes+v_size>10*1024*1024 then raise exception 'fast_ask_attachment_bytes_exceeded' using errcode='P0001'; end if;
  insert into public.vh_fast_ask_attachments(account_id,fast_ask_id,asset_id,source_size_bytes) values(p_account_id,p_fast_ask_id,p_asset_id,v_size) returning id into v_id;
  return v_id;
end $$;

-- Direct canonical table access remains service-role only.
do $$ declare t text; begin
  foreach t in array array[
    'vh_conversations','vh_conversation_notebooks','vh_conversation_messages','vh_message_attachments','vh_stream_events',
    'vh_conversation_tags','vh_conversation_tag_links','vh_interactive_test_answers','vh_fast_ask_sessions','vh_fast_ask_attachments','vh_tool_runs'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
  end loop;
end $$;

revoke all on function public.vh_set_conversation_reference(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_set_conversation_reference(uuid,uuid,uuid) to service_role;
revoke all on function public.vh_attach_conversation_notebook(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_attach_conversation_notebook(uuid,uuid,uuid) to service_role;
revoke all on function public.vh_add_message_attachment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_add_message_attachment(uuid,uuid,uuid) to service_role;
revoke all on function public.vh_add_fast_ask_attachment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_add_fast_ask_attachment(uuid,uuid,uuid) to service_role;
