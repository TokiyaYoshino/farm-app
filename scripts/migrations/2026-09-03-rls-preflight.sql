-- RLS 実ポリシー化の「実行前点検」。**読み取りのみ。データは一切変更しない。**
--
-- 目的: docs/rls-rollout.md の手順1に入る前に、現状を確定させる。
-- 2026-08-23 時点の記録（Auth Hook 未設定・全テーブル allow_all）から
-- 日が経っているため、まずここで実測し直す。
--
-- ⚠️ Supabase SQL Editor は複数文をまとめて流すと結果を表示しない。
--    **1文ずつ選択して実行**し、結果を控えること
--    （docs/handoff-input-redesign.md で実際に踏んだ罠）。

-- ────────────────────────────────────────────────────────────
-- 1) Hook とヘルパー関数の有無
--    期待（未着手なら）: 0 行。2 行あれば手順1・手順3は実施済み。
-- ────────────────────────────────────────────────────────────
select proname, prosecdef from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('custom_access_token_hook', 'jwt_organization_id');

-- ────────────────────────────────────────────────────────────
-- 2) allow_all が残っているテーブル（＝まだ塞がっていないテーブル）
--    期待（未着手なら）: crop_advice_* を含む十数行。
--    適用完了後は 0 行になること。
-- ────────────────────────────────────────────────────────────
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and policyname = 'allow_all'
order by tablename;

-- ────────────────────────────────────────────────────────────
-- 3) 全テーブルの RLS 状態とポリシー数
--    ⚠️ relrowsecurity = true かつ policies = 0 のテーブルは
--       「エラーにならず0件」を返す。行が無いのと区別がつかない（organizations で実際に誤読した）。
-- ────────────────────────────────────────────────────────────
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.policyname) as policies
from pg_class c
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, count(p.policyname), c.relname;

-- ────────────────────────────────────────────────────────────
-- 4) organizations の中身（anon からは読めないのでここでしか確定しない）
--    期待: kishu の1行。asuka は未登録の見込み。
-- ────────────────────────────────────────────────────────────
select id, org_key, name, created_at from organizations order by created_at;

-- ────────────────────────────────────────────────────────────
-- 5) users の organization_id 分布（氏名・login_id は出さない）
--    期待: organization_id が1種類、org 文字列が kishu / asuka の2種類。
--    → この状態で RLS を適用しても kishu と asuka は分離されない（想定どおり）。
-- ────────────────────────────────────────────────────────────
select organization_id, org, count(*) as users from users
group by organization_id, org order by org;

-- ────────────────────────────────────────────────────────────
-- 6) organization_id が NULL の行があるか（**最重要**）
--    RLS 適用後、NULL の行は誰からも見えなくなる。0 でない列が1つでもあれば
--    そのテーブルは適用前にバックフィルが要る。
-- ────────────────────────────────────────────────────────────
select 'crops' as t, count(*) filter (where organization_id is null) as null_org, count(*) as total from crops
union all select 'fields',    count(*) filter (where organization_id is null), count(*) from fields
union all select 'reports',   count(*) filter (where organization_id is null), count(*) from reports
union all select 'schedules', count(*) filter (where organization_id is null), count(*) from schedules
union all select 'pesticides',count(*) filter (where organization_id is null), count(*) from pesticides
union all select 'comments',  count(*) filter (where organization_id is null), count(*) from comments
union all select 'settings',  count(*) filter (where organization_id is null), count(*) from settings
union all select 'projects',  count(*) filter (where organization_id is null), count(*) from projects
union all select 'tickets',   count(*) filter (where organization_id is null), count(*) from tickets
union all select 'ai_outputs',count(*) filter (where organization_id is null), count(*) from ai_outputs
union all select 'daily_weather', count(*) filter (where organization_id is null), count(*) from daily_weather
union all select 'pesticide_registrations', count(*) filter (where organization_id is null), count(*) from pesticide_registrations
order by 1;

-- ────────────────────────────────────────────────────────────
-- 7) 農業エージェント2表の有無と NULL 確認
--    テーブルが無ければ 2026-08-10-crop-advisor.sql が未適用ということ。
-- ────────────────────────────────────────────────────────────
select 'crop_advice_messages' as t, count(*) filter (where organization_id is null) as null_org, count(*) as total from crop_advice_messages
union all select 'crop_advice_actions', count(*) filter (where organization_id is null), count(*) from crop_advice_actions;

-- ────────────────────────────────────────────────────────────
-- 8) device_tokens の有無（無ければ 2026-08-04-device-tokens.sql が未適用）
--    期待: 手順3-4 のタイミングで流す。jwt_organization_id() に依存するため手順1より後。
-- ────────────────────────────────────────────────────────────
select to_regclass('public.device_tokens') as device_tokens_exists;

-- ────────────────────────────────────────────────────────────
-- 9) Storage のポリシー名（**落とし穴**）
--    2026-08-02-rls-policies.sql の 3) は `drop policy if exists "allow all"` を打つが、
--    実際の名前が違えば **黙って何も起きず、緩いポリシーが残る**。
--    ここで実名を確認し、違っていたら SQL 側の名前を直してから流すこと。
-- ────────────────────────────────────────────────────────────
select policyname, cmd, roles from pg_policies
where schemaname = 'storage' and tablename = 'objects';

-- ────────────────────────────────────────────────────────────
-- 10) users の列権限（手順6の前後で比較する）
--     適用後の期待: anon は login_id / email の2列のみ。
-- ────────────────────────────────────────────────────────────
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'users' and grantee in ('anon', 'authenticated')
order by grantee, column_name;
