-- =====================================================================
-- VELTRIX HOM — migration 006
-- Account isolation, reliable source reprocessing and Talent system.
-- Additive + idempotent. Run after migration-005.
-- =====================================================================

-- Source processing health: page text remains usable even if embedding quota fails.
alter table sources add column if not exists embedding_ready boolean not null default false;
alter table sources add column if not exists processing_warning text;
alter table sources add column if not exists updated_at timestamptz not null default now();

-- Talent is the product name; the physical table remains `skills` for backward compatibility.
alter table skills add column if not exists subject_slug text;
alter table skills add column if not exists background_color text default '#0A6CFF';
alter table skills add column if not exists icon_url text;
alter table skills add column if not exists refined_at timestamptz;

-- Chats remember all selected sources, not only one legacy locked_source_id.
create table if not exists chat_sources (
  chat_id uuid not null references chats on delete cascade,
  source_id uuid not null references sources on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key(chat_id, source_id)
);
create index if not exists chat_sources_user_idx on chat_sources(user_id, chat_id);
alter table chat_sources enable row level security;
drop policy if exists owner_all on chat_sources;
create policy owner_all on chat_sources for all
  using (
    auth.uid() = user_id
    and exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
    and exists (select 1 from sources s where s.id = source_id and s.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
    and exists (select 1 from sources s where s.id = source_id and s.user_id = auth.uid())
  );

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists sources_touch on sources;
create trigger sources_touch before update on sources
for each row execute function public.touch_updated_at();

-- Default domain-locked Talents for every account.
create or replace function public.seed_veltrix_talents(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into skills(user_id,name,emoji,color,background_color,description,instructions,scope,subject_slug,is_default)
  select p_user_id, x.name, x.emoji, x.color, x.color, x.description, x.instructions, 'global', x.slug, true
  from (values
    ('Hisob-kitobchi','🧮','#0A6CFF','Matematik hisoblarni aniq bajaradi.','Faqat matematik hisob-kitob doirasida ishlang. Ifodani tekshiring, birliklarni saqlang, natijani qayta hisoblab tasdiqlang.','matematika'),
    ('Arifmetik','➗','#1E9BFF','Arifmetika va sonlar mutaxassisi.','Arifmetika, kasr, foiz, nisbat va oddiy amallar doirasida fikrlang. Oraliq hisoblarni tekshiring.','arifmetika'),
    ('Algebra mutaxassisi','𝑥','#2563EB','Tenglama va algebraik ifodalar.','Algebra doirasida ishlang: berilgan, formula, bosqichlar, tekshiruv va yakuniy javob.','algebra'),
    ('Geometr','📐','#7C3AED','Geometriya masalalari.','Geometriya doirasida shakl, berilganlar, teorema, formula va birliklar bilan ishlang. Yetishmayotgan ma’lumotni uydirmang.','geometriya'),
    ('Fizik','⚛️','#6D28D9','Fizika qonunlari va masalalari.','Fizika doirasida SI birliklari, formula, almashtirish va o‘lchov tekshiruvi bilan ishlang.','fizika'),
    ('Kimyogar','🧪','#F97316','Kimyo va reaksiyalar.','Kimyo doirasida formulalar, valentlik, tenglashtirish, modda miqdori va xavfsizlikka e’tibor bering.','kimyo'),
    ('Biolog','🌿','#16A34A','Biologiya mavzulari.','Biologiya doirasida tuzilma, vazifa, jarayon va ilmiy atamalarni aniq bog‘lang.','biologiya'),
    ('Zoolog','🦉','#0F9F76','Hayvonot dunyosi mutaxassisi.','Faqat zoologiya doirasida tasnif, anatomik xususiyat, yashash muhiti va evolyutsion bog‘lanishni tahlil qiling.','zoologiya'),
    ('Anatomist','🫀','#E11D48','Inson anatomiyasi.','Faqat anatomiya doirasida organ, tizim, joylashuv va vazifani ilmiy va yoshga mos tushuntiring.','anatomiya'),
    ('Grammatik','✍️','#8B5CF6','Til qoidalari mutaxassisi.','Grammatika doirasida qoida, to‘g‘ri/noto‘g‘ri taqqoslash va misol bilan ishlang.','grammatika'),
    ('Tarixchi','🏛️','#DC2626','Tarixiy voqealar va sanalar.','Tarix doirasida sana, hodisa, sabab, natija va manba ishonchliligini ajrating.','tarix'),
    ('Geograf','🌍','#EAB308','Geografiya va xaritalar.','Geografiya doirasida hudud, jarayon, ko‘rsatkich va sabab-oqibatni tahlil qiling.','geografiya'),
    ('Dasturchi','💻','#06B6D4','Informatika va kod.','Informatika doirasida algoritm, kod, xatolik va xavfsiz amaliy misollar bilan ishlang.','informatika')
  ) as x(name,emoji,color,description,instructions,slug)
  where not exists (
    select 1 from skills s where s.user_id=p_user_id and lower(s.name)=lower(x.name)
  );
end;
$$;

-- Existing accounts.
do $$ declare r record; begin
  for r in select id from profiles loop perform public.seed_veltrix_talents(r.id); end loop;
end $$;

-- Future accounts.
create or replace function public.seed_veltrix_talents_after_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.seed_veltrix_talents(new.id); return new; end;
$$;
drop trigger if exists profiles_seed_veltrix_talents on profiles;
create trigger profiles_seed_veltrix_talents after insert on profiles
for each row execute function public.seed_veltrix_talents_after_profile();

-- Service role/server executes the seeding helper.
revoke all on function public.seed_veltrix_talents(uuid) from public, anon, authenticated;
grant execute on function public.seed_veltrix_talents(uuid) to service_role;
