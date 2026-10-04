-- アカウント削除の控え（30日）と、農場のデータを1トランザクションで消す関数【本番未適用・オーナー承認が必要】
--
-- 使う所: api/delete-account.ts（アプリ内アカウント削除・Apple ガイドライン 5.1.1(v)）
--         api/purge-deleted.ts（30日を過ぎた控えを完全に消す・毎日）
-- 決定:   docs/decisions/20261003-adr-signup-billing-deletion.md 5節
--
-- 控え（2026-10-04 オーナー決定）: 「間違えて消した」と言われたときに戻せるよう、消した内容を
--   deleted_data_archive に30日残す。利用者・アプリからは読めない（RLS 有効・ポリシー無し＝service_role だけ）。
--   30日を過ぎたら api/purge-deleted.ts が写真と一緒に消す。privacy.html に「削除後30日で完全に消去」を書く。
--
-- なぜ関数か: 消す表が18あり、API から1つずつ消すと途中で失敗したとき「半分だけ消えた農場」が残る。
--   関数にすれば控えへの書き込みと削除が1つのトランザクションで、失敗すれば何も変わらない。
-- 誰が呼べるか: service_role だけ（API 経由のみ）。anon / authenticated からは呼べない。
--   呼べると、ログインした誰でも任意の組織IDを渡して他の農場を消せてしまう。
--
-- Auth ユーザー（ログイン）はこの関数では消さない（DB の外）。API が関数の成功後にすぐ消す。
--
-- 新しく organization_id を持つ表を作ったら、ここにも足すこと（docs/supabase-ops.md のチェックリスト）。
-- 足し忘れると、その表に行がある農場は外部キーで削除が止まる（＝消し残しではなく失敗として気づける）。
--
-- 戻すとき（手作業）: deleted_data_archive の payload に表ごとの行が入っている。
--   jsonb_populate_recordset で各表へ戻し（親 → 子の順）、Auth ユーザーを作り直して users.auth_id を付け直す。

-- ────────────────────────────────────────────────────────────
-- 0) 事前確認（読み取りのみ）
-- ────────────────────────────────────────────────────────────
-- 0-1) 下の関数が消す表が全部あり、organization_id を持つこと。0 行が正常
with need(t) as (values
  ('crop_advice_actions'),('crop_advice_messages'),('advice_threads'),('ai_outputs'),('comments'),
  ('schedules'),('tickets'),('projects'),('pesticide_registrations'),('reports'),('pesticides'),
  ('fields'),('crops'),('settings'),('device_tokens'),('daily_weather'),('users'))
select need.t from need
left join information_schema.columns ic
  on ic.table_schema = 'public' and ic.table_name = need.t and ic.column_name = 'organization_id'
where ic.column_name is null;

-- 0-2) organization_id を持つのに、下の関数が知らない表（あれば関数に足す）。0 行が正常
select table_name from information_schema.columns
where table_schema = 'public' and column_name = 'organization_id'
  and table_name not in ('crop_advice_actions','crop_advice_messages','advice_threads','ai_outputs','comments',
    'schedules','tickets','projects','pesticide_registrations','reports','pesticides','fields','crops',
    'settings','device_tokens','daily_weather','users')
order by 1;

-- ────────────────────────────────────────────────────────────
-- 1) 控えの表
-- ────────────────────────────────────────────────────────────
create table if not exists public.deleted_data_archive (
  id            uuid primary key default gen_random_uuid(),
  -- 外部キーにしない（組織の行を消した後も控えは残すため）
  organization_id uuid not null,
  -- 'farm' = 農場ごと / 'self' = 本人だけ
  scope         text not null check (scope in ('farm', 'self')),
  -- farm: { "<表名>": [行, ...], ... } / self: { user_id, name, login_id, email, auth_id }
  payload       jsonb not null,
  -- 30日後に消す写真（report-images のパス）
  storage_paths text[] not null default '{}',
  deleted_at    timestamptz not null default now(),
  purge_after   timestamptz not null default now() + interval '30 days'
);
create index if not exists deleted_data_archive_purge_idx on public.deleted_data_archive (purge_after);

-- RLS 有効・ポリシー無し = anon / authenticated からは0行。service_role だけが読み書きできる
alter table public.deleted_data_archive enable row level security;
revoke all on public.deleted_data_archive from anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2) 農場を控えに移してから消す関数
-- ────────────────────────────────────────────────────────────
drop function if exists public.delete_organization_data(uuid);

create or replace function public.delete_organization_data(p_org uuid, p_storage_paths text[] default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_table   text;
  v_rows    jsonb;
begin
  if p_org is null or not exists (select 1 from organizations where id = p_org) then
    raise exception 'organization % が見つからない', p_org;
  end if;

  -- 控え: 表ごとに行をまとめて1行に入れる
  foreach v_table in array array[
    'organizations','users','crops','fields','pesticides','settings','reports','pesticide_registrations',
    'projects','tickets','schedules','comments','ai_outputs','advice_threads','crop_advice_messages',
    'crop_advice_actions','device_tokens','daily_weather']
  loop
    if v_table = 'organizations' then
      execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from organizations t where t.id = $1'
        into v_rows using p_org;
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t where t.organization_id = $1', v_table)
        into v_rows using p_org;
    end if;
    v_payload := v_payload || jsonb_build_object(v_table, v_rows);
  end loop;

  insert into deleted_data_archive (organization_id, scope, payload, storage_paths)
  values (p_org, 'farm', v_payload, coalesce(p_storage_paths, '{}'));

  -- 子 → 親の順（外部キーで止まらない順）
  delete from crop_advice_actions     where organization_id = p_org;
  delete from crop_advice_messages    where organization_id = p_org;
  delete from advice_threads          where organization_id = p_org;
  delete from ai_outputs              where organization_id = p_org;
  delete from comments                where organization_id = p_org;
  delete from schedules               where organization_id = p_org;
  delete from tickets                 where organization_id = p_org;
  delete from projects                where organization_id = p_org;
  delete from pesticide_registrations where organization_id = p_org;
  delete from reports                 where organization_id = p_org;
  delete from pesticides              where organization_id = p_org;
  delete from fields                  where organization_id = p_org;
  delete from crops                   where organization_id = p_org;
  delete from settings                where organization_id = p_org;
  delete from device_tokens           where organization_id = p_org;
  delete from daily_weather           where organization_id = p_org;
  delete from users                   where organization_id = p_org;
  delete from organizations           where id = p_org;
end;
$$;

revoke execute on function public.delete_organization_data(uuid, text[]) from public, anon, authenticated;
grant  execute on function public.delete_organization_data(uuid, text[]) to service_role;

-- ────────────────────────────────────────────────────────────
-- 3) 確認（読み取りのみ）
-- ────────────────────────────────────────────────────────────
-- 3-1) anon / authenticated に関数の実行権限が無いこと（false, false が正常）
select has_function_privilege('anon', 'public.delete_organization_data(uuid, text[])', 'execute') as anon_can,
       has_function_privilege('authenticated', 'public.delete_organization_data(uuid, text[])', 'execute') as authed_can;
-- 3-2) 控えの表の RLS が有効で、ポリシーが無いこと（rls_on = true, policies = 0）
select c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'deleted_data_archive') as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'deleted_data_archive';
-- 3-3) 外から匿名キーで GET /rest/v1/deleted_data_archive と POST /rest/v1/rpc/delete_organization_data を
--      叩いて、0行／拒否になること（node scripts/check-org-isolation.mjs --anon-only に追加済み）
