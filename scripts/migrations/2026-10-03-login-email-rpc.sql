-- ログイン前の login_id → email 解決を、users の素読みから RPC に置き換える（第1段）
--
-- ── なぜ ─────────────────────────────────────────────────────
--
-- 2026-10-03 に匿名キーで本番を叩いたところ、
--   GET /rest/v1/users?select=login_id,email  → 全組織の利用者 5 件（content-range 0-0/5）
-- が返った。2026-08-02-rls-policies.sql が、ログイン画面の
--   .from("users").select("email").eq("login_id", …)
-- を未ログインで通すために
--   policy users_select_login_lookup … to anon using (true)
--   grant select (login_id, email) on users to anon
-- を入れたため。eq で絞るのはクライアントの都合で、DB 側は「全行読んでよい」になっていた。
-- email は今は <login_id>@kishu-farm.system の仮メールだが、0.1.0 の自己登録で本物のメールになる。
--
-- ── 何をするか ───────────────────────────────────────────────
--
-- login_id を受けて、その1件の email だけを返す関数を作る。一覧はできず、IDを知っている人にだけ返る。
-- security definer なので RLS を通らずに users を読むが、返すのは email 1つだけ。
--
-- ── 実行順序（逆にすると本番のログインが止まる） ─────────────────
--
--   1. このファイル（RPC を足すだけ。既存のログインはそのまま動く）
--   2. Web・Expo のログインを supabase.rpc("login_email_for", …) に切り替えてデプロイ
--   3. 2026-10-03-login-lookup-revoke-anon.sql（anon の列権限とポリシーを外す）
--   4. node scripts/check-org-isolation.mjs --anon-only が全件 ✓
--
-- Supabase SQL Editor で、1 文ずつ実行する。何度流しても壊れない。

create or replace function public.login_email_for(p_login_id text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email from users where login_id = p_login_id limit 1
$$;

-- 関数は既定で PUBLIC に execute が付く。誰に開けているかを明示する
revoke execute on function public.login_email_for(text) from public;
grant execute on function public.login_email_for(text) to anon, authenticated;

-- 確認 1: prosecdef が true、proconfig に search_path=public があること
select proname, prosecdef, proconfig, pg_get_function_result(oid) as returns
  from pg_proc where proname = 'login_email_for';

-- 確認 2: execute を持つのが anon / authenticated（と所有者・service_role）だけで、PUBLIC が無いこと
select grantee, privilege_type from information_schema.routine_privileges
 where routine_schema = 'public' and routine_name = 'login_email_for';

-- 確認 3: 存在しない ID で null が返ること（一覧が返らないこと）
select public.login_email_for('__no_such_login_id__') as should_be_null;
