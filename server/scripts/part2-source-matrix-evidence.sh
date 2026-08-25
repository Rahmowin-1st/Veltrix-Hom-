#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}" "${PGPORT:=5432}" "${PGUSER:=postgres}" "${PGPASSWORD:=postgres}" "${PGDATABASE:=veltrix_ci}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

A="91111111-1111-4111-8111-111111111111"
B="92222222-2222-4222-8222-222222222222"
N="93333333-3333-4333-8333-333333333333"
NF="94444444-4444-4444-8444-444444444444"

echo "PART2_SOURCE_MATRIX_BEGIN"

"${PSQL[@]}" <<SQL
insert into public.vh_accounts(id,email) values
  ('$A','source-matrix-a@example.invalid'),
  ('$B','source-matrix-b@example.invalid')
on conflict (id) do nothing;
insert into public.vh_notebooks(id,account_id,name) values
  ('$N','$A','Canonical Source Matrix'),
  ('$NF','$B','Foreign Matrix')
on conflict (id) do nothing;
SQL

# source-kind|mime|token|locator|extraction-version
ROWS=(
  "pdf|application/pdf|matrix_pdf_token|{\"page\":3}|part2-extract-v1"
  "document|application/vnd.openxmlformats-officedocument.wordprocessingml.document|matrix_docx_token|{\"paragraph\":7}|part2-document-v1"
  "pptx|application/vnd.openxmlformats-officedocument.presentationml.presentation|matrix_pptx_token|{\"slide\":4}|part2-pptx-v1"
  "text|text/markdown|matrix_markdown_token|{\"section\":\"document\"}|part2-extract-v1"
  "spreadsheet|text/csv|matrix_csv_token|{\"section\":\"document\"}|part2-extract-v1"
  "epub|application/epub+zip|matrix_epub_token|{\"chapter\":2,\"path\":\"OEBPS/chapter2.xhtml\",\"spineId\":\"c2\"}|part2-epub-v1"
  "image|image/png|matrix_image_token|{\"image\":1,\"modality\":\"vision\"}|part2-image-v1"
  "audio|audio/mpeg|matrix_audio_token|{\"modality\":\"transcript\",\"startSeconds\":12.5,\"endSeconds\":18.0}|part2-audio-v1"
  "video|video/mp4|matrix_video_token|{\"modality\":\"transcript\",\"startSeconds\":20.0,\"endSeconds\":25.5}|part2-video-v1"
  "web|text/html|matrix_web_token|{\"url\":\"https://example.com/lesson\",\"section\":\"page\"}|part2-web-v1"
  "pasted|text/plain|matrix_pasted_token|{\"section\":\"pasted-text\"}|part2-pasted-v1"
)

idx=0
for row in "${ROWS[@]}"; do
  IFS='|' read -r kind mime token locator extraction <<<"$row"
  idx=$((idx+1))
  asset=$(printf '95555555-5555-4555-8555-%012d' "$idx")
  hash=$(printf '%064d' "$idx")
  "${PSQL[@]}" -v aid="$asset" -v kind="$kind" -v mime="$mime" -v token="$token" -v locator="$locator" -v extraction="$extraction" -v hash="$hash" <<'SQL'
insert into public.vh_library_assets(
  id,account_id,original_filename,display_title,declared_mime,detected_mime,source_kind,asset_class,
  original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,source_revision
) values (
  :'aid','91111111-1111-4111-8111-111111111111',:'kind'||'.bin',upper(:'kind')||' source',:'mime',:'mime',:'kind',
  case when :'kind'='image' then 'image' when :'kind'='web' then 'web' when :'kind'='pasted' then 'text' else 'file' end,
  128,'source-matrix',:'hash','READY','READY',1
) on conflict (id) do nothing;
select public.vh_add_notebook_source(
  '91111111-1111-4111-8111-111111111111',
  '93333333-3333-4333-8333-333333333333',
  :'aid',100,100000000,'upload',jsonb_build_object('matrixKind',:'kind')
);
insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
values(
  '91111111-1111-4111-8111-111111111111',:'aid',1,0,
  'Canonical grounded knowledge '||:'token',:'locator'::jsonb,'{"start":0,"end":64}'::jsonb,
  encode(digest(:'token','sha256'),'hex'),:'extraction'
) on conflict do nothing;
SQL
done

"${PSQL[@]}" <<'SQL'
insert into public.vh_library_assets(
  id,account_id,original_filename,display_title,declared_mime,detected_mime,source_kind,asset_class,
  original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,source_revision
) values (
  '96666666-6666-4666-8666-666666666666','92222222-2222-4222-8222-222222222222','foreign.docx','Foreign DOCX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'document','file',128,'source-matrix',repeat('f',64),'READY','READY',1
) on conflict (id) do nothing;
select public.vh_add_notebook_source('92222222-2222-4222-8222-222222222222','94444444-4444-4444-8444-444444444444','96666666-6666-4666-8666-666666666666',100,100000000,'upload','{}');
insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
values('92222222-2222-4222-8222-222222222222','96666666-6666-4666-8666-666666666666',1,0,'foreign matrix_docx_token must not leak','{"paragraph":99}','{"start":0,"end":40}',encode(digest('foreign-docx','sha256'),'hex'),'part2-document-v1')
on conflict do nothing;
SQL

idx=0
for row in "${ROWS[@]}"; do
  IFS='|' read -r kind mime token locator extraction <<<"$row"
  idx=$((idx+1))
  asset=$(printf '95555555-5555-4555-8555-%012d' "$idx")
  result=$("${PSQL[@]}" -At -F '|' -v token="$token" -v expected_asset="$asset" <<'SQL'
select asset_id::text, locator::text, source_revision::text, chunk_index::text, content_hash, extraction_version
from public.vh_search_notebook_chunks(
  '91111111-1111-4111-8111-111111111111',
  '93333333-3333-4333-8333-333333333333',
  :'token',12
)
where asset_id=:'expected_asset'::uuid
limit 1;
SQL
)
  if [[ -z "$result" ]]; then echo "SOURCE_MATRIX_FAIL kind=$kind reason=not_retrieved"; exit 1; fi
  IFS='|' read -r got_asset got_locator got_revision got_index got_hash got_extraction <<<"$result"
  [[ "$got_asset" == "$asset" ]] || { echo "SOURCE_MATRIX_FAIL kind=$kind reason=asset"; exit 1; }
  [[ "$got_revision" == "1" && "$got_index" == "0" ]] || { echo "SOURCE_MATRIX_FAIL kind=$kind reason=revision_index"; exit 1; }
  [[ ${#got_hash} -eq 64 ]] || { echo "SOURCE_MATRIX_FAIL kind=$kind reason=hash"; exit 1; }
  [[ "$got_extraction" == "$extraction" ]] || { echo "SOURCE_MATRIX_FAIL kind=$kind reason=extraction_version"; exit 1; }
  echo "SOURCE_MATRIX_KIND=PASS kind=$kind asset=$got_asset locator=$got_locator extraction=$got_extraction"
done

DOCX_ASSET='95555555-5555-4555-8555-000000000002'
"${PSQL[@]}" -v aid="$DOCX_ASSET" <<'SQL'
update public.vh_notebook_sources set enabled=false
where account_id='91111111-1111-4111-8111-111111111111'
  and notebook_id='93333333-3333-4333-8333-333333333333'
  and asset_id=:'aid'::uuid;
SQL
if [[ "$("${PSQL[@]}" -At <<'SQL'
select count(*) from public.vh_search_notebook_chunks('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','matrix_docx_token',12)
where asset_id='95555555-5555-4555-8555-000000000002';
SQL
)" != "0" ]]; then echo 'SOURCE_MATRIX_FAIL disabled_source_leaked'; exit 1; fi
echo 'SOURCE_MATRIX_SELECTION=PASS disabled_excluded=1'

if [[ "$("${PSQL[@]}" -At <<'SQL'
select count(*) from public.vh_search_notebook_chunks('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','matrix_docx_token',12)
where asset_id='96666666-6666-4666-8666-666666666666';
SQL
)" != "0" ]]; then echo 'SOURCE_MATRIX_FAIL cross_owner_leak'; exit 1; fi
echo 'SOURCE_MATRIX_ISOLATION=PASS cross_owner_excluded=1'

"${PSQL[@]}" <<SQL
select public.vh_delete_account_data('$A');
select public.vh_delete_account_data('$B');
SQL

echo 'PART2_SOURCE_MATRIX=PASS kinds=11 persistence=postgres16 grounded_retrieval=pass provenance=pass selection=pass isolation=pass'
