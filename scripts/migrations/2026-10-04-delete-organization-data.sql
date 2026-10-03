-- 農場（organization）のデータを1トランザクションで全部消す関数【本番未適用・オーナー承認が必要】
--
-- 使う所: api/delete-account.ts の scope=farm（アプリ内アカウント削除・Apple ガイドライン 5.1.1(v)）
-- 決定:   docs/decisions/20261003-adr-signup-billing-deletion.md 5節
--
-- なぜ関数か: 消す表が18あり、API から1つずつ消すと途中で失敗したとき「半分だけ消えた農場」が残る。
--   関数にすれば1つのトランザクションで、失敗すれば何も消えない。
-- 誰が呼べるか: service_role だけ（API 経由のみ）。anon / authenticated からは呼べない。
--   呼べると、ログインした誰でも任意の組織IDを渡して他の農場を消せてしまう。
--
-- 写真（Storage）と Auth ユーザーはこの関数では消さない（DB の外にあるため）。API が関数の成功後に消す。
--
-- 新しく organization_id を持つ表を作ったら、ここにも1行足すこと（docs/supabase-ops.md のチェックリスト）。
-- 足し忘れると、その表に行がある農場は外部キーで削除が止まる（＝消し残しではなく失敗として気づける）。

-- ────────────────────────────────────────────────────────────
-- 0) 事前確認（読み取りのみ）: 下の関数が消す表が全部あり、organization_id を持つこと。0 行が正常
-- ────────────────────────────────────────────────────────────
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
-- 1) 関数
-- ────────────────────────────────────────────────────────────
create or replace function public.delete_organization_data(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null or not exists (select 1 from organizations where id = p_org) then
    raise exception 'organization % が見つからない', p_org;
  end if;

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

revoke execute on function public.delete_organization_data(uuid) from public, anon, authenticated;
grant  execute on function public.delete_organization_data(uuid) to service_role;

-- ────────────────────────────────────────────────────────────
-- 2) 確認（読み取りのみ）
-- ────────────────────────────────────────────────────────────
-- 2-1) anon / authenticated に実行権限が無いこと（false, false が正常）
select has_function_privilege('anon', 'public.delete_organization_data(uuid)', 'execute') as anon_can,
       has_function_privilege('authenticated', 'public.delete_organization_data(uuid)', 'execute') as authed_can;
-- 2-2) 外から匿名キーで POST /rest/v1/rpc/delete_organization_data を叩いて 401/403/404 になること
--      （本物の組織IDは使わない。存在しない uuid で叩く）
