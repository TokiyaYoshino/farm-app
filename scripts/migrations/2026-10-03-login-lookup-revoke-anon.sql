-- anon から users の素読みを外す（第2段。**クライアントのデプロイ後に**流す）
--
-- 前提: 2026-10-03-login-email-rpc.sql を流し、Web・Expo のログインが
--   supabase.rpc("login_email_for", …) に切り替わった版が本番に出ていること。
--   旧クライアント（.from("users").select("email") で引く版）が残っている間にこれを流すと、
--   その版では「ユーザーIDが見つかりません」になってログインできなくなる。
--   Expo のネイティブアプリはストア未公開なので、旧版を気にするのは Web だけ。
--
-- 経緯は 2026-10-03-login-email-rpc.sql の先頭。
--
-- Supabase SQL Editor で、1 文ずつ実行する。何度流しても壊れない。

-- 0) 事前確認: RPC が動くこと（ここで null 以外のエラーが出たら止める）
select public.login_email_for('__no_such_login_id__') as should_be_null;

-- 0) 事前確認: いま anon が持っている users の列権限（login_id・email の2行が出るはず）
select column_name, privilege_type from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'users' and grantee = 'anon';

-- 1) users の列権限とポリシーを外す
revoke select (login_id, email) on public.users from anon;
drop policy if exists users_select_login_lookup on public.users;

-- 2) 確認: 下の2つがどちらも 0 行
select column_name, privilege_type from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'users' and grantee = 'anon';
select policyname, roles, cmd, qual from pg_policies
 where schemaname = 'public' and tablename = 'users' and 'anon' = any(roles);

-- 3) 見直し: anon に残っている public スキーマのテーブル権限を洗い出す
--    Supabase は既定で anon に全テーブルの ALL を付ける。行は RLS が止めているが、
--    RLS 無効の表が1つ作られるだけで素通りになる（2026-09-12 に2表で実際に起きた）。
--    ログイン後はすべて authenticated で動き、api/*.ts は service_role なので、anon が使う表は無い。
select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon'
 group by table_name order by table_name;

-- 3) 見直し: anon が execute できる public の関数（login_email_for 以外が要るかを見る）
select routine_name from information_schema.routine_privileges
 where routine_schema = 'public' and grantee = 'anon' order by routine_name;

-- 4) 【オーナー判断】上の 3) を見て、anon のテーブル権限を全部外す。
--    今後作る表にも anon の権限が付かないよう、既定権限も外す。
--    外した後は匿名で読めるのは login_email_for だけになる。
--    戻すときは grant all on all tables in schema public to anon; と
--    alter default privileges in schema public grant all on tables to anon;
-- revoke all on all tables in schema public from anon;
-- alter default privileges in schema public revoke all on tables from anon;

-- 5) 最後に外から確かめる（ローカルで）:
--    node scripts/check-org-isolation.mjs --anon-only   → 全件 ✓
