#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}" "${PGPORT:?PGPORT is required}" "${PGUSER:?PGUSER is required}" "${PGPASSWORD:?PGPASSWORD is required}" "${PGDATABASE:?PGDATABASE is required}"
PSQL=(psql -X -qAt -v ON_ERROR_STOP=1)
START=$SECONDS
A=90000000-0000-4000-8000-000000000001; B=90000000-0000-4000-8000-000000000002

"${PSQL[@]}" -v a="$A" -v b="$B" <<'SQL'
delete from public.vh_accounts where id in (:'a'::uuid,:'b'::uuid);
insert into public.vh_accounts(id,email) values(:'a','stage90-perf-a@example.invalid'),(:'b','stage90-perf-b@example.invalid');
insert into public.vh_conversations(account_id,title,last_message_at)
 select :'a','needle performance conversation '||g,now()-g*interval '1 second' from generate_series(1,500) g
 union all select :'b','owner b conversation '||g,now()-g*interval '1 second' from generate_series(1,100) g;
insert into public.vh_conversation_messages(account_id,conversation_id,role,status,plain_text,content_blocks,completed_at)
 select c.account_id,c.id,case when g%2=0 then 'USER' else 'ASSISTANT' end,'COMPLETED',
   'needle deterministic message '||g,jsonb_build_array(jsonb_build_object('id','answer-1','type','answer','version',1,'text','needle deterministic block '||g)),now()
 from public.vh_conversations c cross join lateral generate_series(1,case when c.account_id=:'a' then 40 else 20 end) g
 where c.account_id in (:'a'::uuid,:'b'::uuid);
with s as (select public.vh_begin_fast_ask(:'a','perf-fast','performance prompt','{}') j),
 ids as (select (j->>'fastAskId')::uuid id,(j->>'requestId')::uuid request from s)
select public.vh_complete_fast_ask(:'a',id,request,'done',jsonb_build_array(jsonb_build_object('id','answer-1','type','answer','version',1,'text','done')),'{}','{}') from ids;
insert into public.vh_fast_ask_stream_events(account_id,fast_ask_id,request_id,seq,event_type,payload)
 select :'a',s.id,s.request_id,g+1,'block.delta',jsonb_build_object('delta','x')
 from public.vh_fast_ask_sessions s cross join generate_series(1,2000) g where s.account_id=:'a' and s.idempotency_key='perf-fast';
with r as (select public.vh_begin_tool_run(:'a','calculator','perf-tool',jsonb_build_object('expression','2+2'),'{}',120) j)
select public.vh_complete_tool_run(:'a',(j->>'toolRunId')::uuid,(j->>'claimToken')::uuid,jsonb_build_object('kind','calculator','result',4),'{}','{}') from r;
insert into public.vh_tool_runs(account_id,tool_type,status,input_payload,output_payload,completed_at)
 select :'a','calculator','COMPLETED',jsonb_build_object('expression',g||'+1'),jsonb_build_object('result',g+1),now() from generate_series(1,999) g;
analyze public.vh_conversations; analyze public.vh_conversation_messages; analyze public.vh_fast_ask_stream_events; analyze public.vh_tool_runs;
SQL

run_sql() { "${PSQL[@]}" -c "$1" >/dev/null; }
measure() { local sql=$1 out=$2 start end; start=$(date +%s%N); run_sql "$sql"; end=$(date +%s%N); awk -v n="$((end-start))" 'BEGIN{printf "%.3f\n",n/1000000}' >>"$out"; }
p95() { sort -n "$1" | awk '{a[NR]=$1} END{i=int((NR*95+99)/100); print a[i]}' ; }
latency_gate() { local name=$1 ceiling=$2 sql=$3 file=/tmp/"$name".samples; : >"$file"; measure "$sql" /dev/null; measure "$sql" /dev/null; for _ in {1..10}; do measure "$sql" "$file"; done; local value; value=$(p95 "$file"); echo "PERF_SAMPLES op=$name values=$(paste -sd, "$file") p95_ms=$value ceiling_ms=$ceiling"; awk -v v="$value" -v c="$ceiling" 'BEGIN{exit !(v<=c)}'; }

latency_gate history 250 "select * from public.vh_list_conversation_history('$A','active','{}',100)"
latency_gate lexical_search 1500 "select * from public.vh_search_conversations('$A','needle',false,20)"
FAST_ID=$("${PSQL[@]}" -c "select id from public.vh_fast_ask_sessions where account_id='$A' and idempotency_key='perf-fast'")
FAST_REQ=$("${PSQL[@]}" -c "select request_id from public.vh_fast_ask_sessions where id='$FAST_ID'")
latency_gate fast_ask_resume 250 "select * from public.vh_fast_ask_stream_events where account_id='$A' and fast_ask_id='$FAST_ID' and seq>1750 order by seq limit 250"

concurrency_gate() { local name=$1 sql=$2 file=/tmp/"$name".samples rates=/tmp/"$name".rates; : >"$file"; : >"$rates"; for warm in 1 2; do run_sql "$sql"; done; for batch in {1..5}; do local bs be rate; bs=$(date +%s%N); for i in {1..16}; do measure "$sql" "$file" & done; wait; be=$(date +%s%N); rate=$(awk -v n="$((be-bs))" 'BEGIN{printf "%.3f",16/(n/1e9)}'); echo "$rate" >>"$rates"; awk -v n="$((be-bs))" -v b="$batch" -v r="$rate" 'BEGIN{printf "PERF_BATCH batch=%d size=16 elapsed_ms=%.3f throughput=%.3f\n",b,n/1e6,r}'; done; local value min_tput; value=$(p95 "$file"); min_tput=$(sort -n "$rates" | head -1); echo "PERF_SAMPLES op=$name count=$(wc -l <"$file") p95_ms=$value ceiling_ms=500 min_throughput=$min_tput floor=25"; awk -v v="$value" -v t="$min_tput" 'BEGIN{exit !(v<=500 && t>=25)}'; }
concurrency_gate fast_ask_replay "select public.vh_complete_fast_ask('$A','$FAST_ID','$FAST_REQ','done',jsonb_build_array(jsonb_build_object('id','answer-1','type','answer','version',1,'text','done')),'{}','{}')"
concurrency_gate tool_run_replay "select public.vh_begin_tool_run('$A','calculator','perf-tool',jsonb_build_object('expression','2+2'),'{}',120)"
[[ $("${PSQL[@]}" -c "select count(*) from public.vh_fast_ask_stream_events where fast_ask_id='$FAST_ID' and event_type='message.completed'") -eq 1 ]] || { echo 'PART3_STAGE90_PERFORMANCE=FAIL fast_ask_duplicate_side_effect'; exit 1; }
[[ $("${PSQL[@]}" -c "select count(*) from public.vh_tool_runs where account_id='$A' and idempotency_key='perf-tool'") -eq 1 ]] || { echo 'PART3_STAGE90_PERFORMANCE=FAIL tool_run_duplicate_side_effect'; exit 1; }
echo 'PERF_REPLAY_AUTHORITY fast_ask_logical_results=1 fast_ask_duplicate_side_effect=0 tool_run_authoritative_results=1 tool_run_duplicate_side_effect=0'

"${PSQL[@]}" -c "select 'PERF_CARDINALITIES accounts='||count(distinct account_id)||' conversations='||(select count(*) from public.vh_conversations where account_id in ('$A','$B'))||' messages_a='||(select count(*) from public.vh_conversation_messages where account_id='$A')||' messages_b='||(select count(*) from public.vh_conversation_messages where account_id='$B')||' fast_events='||(select count(*) from public.vh_fast_ask_stream_events where account_id='$A')||' tool_runs='||(select count(*) from public.vh_tool_runs where account_id='$A') from public.vh_conversations where account_id in ('$A','$B')"
(( SECONDS-START <= 90 )) || { echo "PART3_STAGE90_PERFORMANCE=FAIL runtime_seconds=$((SECONDS-START)) ceiling=90"; exit 1; }
echo "PART3_STAGE90_PERFORMANCE=PASS runtime_seconds=$((SECONDS-START)) warmups=2 repetitions=10 batches=5 batch_size=16"
