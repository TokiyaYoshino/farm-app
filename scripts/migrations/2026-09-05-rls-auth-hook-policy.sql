-- Custom Access Token Hook が users を読めるようにするポリシー
--
-- ── なぜ必要か（本体SQLの欠落）────────────────────────────────
--
-- 本体 scripts/migrations/2026-08-02-rls-policies.sql の 0) は、Hook 関数が
-- users を読めるように **grant だけ** を与えている:
--
--   grant select on table public.users to supabase_auth_admin;
--
-- しかし grant はテーブル権限であって、**RLS を通過させるものではない**。
-- `custom_access_token_hook` は SECURITY DEFINER ではないため呼び出し元の
-- supabase_auth_admin として実行され、users に RLS が有効になった瞬間から
-- ポリシーの評価対象になる。本体が users に作るポリシーは
--
--   users_select_own_org    (organization_id = jwt_organization_id())
--   users_select_login_lookup (to anon)
--
-- のいずれも supabase_auth_admin を対象にしていない。結果、Hook の select は
-- **0件を返し、org_id が null になり、JWT に organization_id クレームが入らなくなる。**
--
-- ── なぜ厄介か（時間差で壊れる）──────────────────────────────
--
-- 手順2（ログインし直してクレームを確認）の時点では users はまだ allow_all なので
-- Hook は正常に動き、クレームは入る。壊れるのは手順6（users のポリシー適用）以降に
-- **発行される**トークンから。Supabase のアクセストークンは1時間ほどで自動更新されるため、
-- 適用直後の画面確認は通り、**1時間後に全ユーザーが全データを見失う**。
--
-- 手順書の切り戻し表にある「そのテーブルのデータが全部消えて見える」が、
-- 手順2をやったのに再発する場合はこれを疑うこと。
--
-- ── 実行タイミング ───────────────────────────────────────────
--
-- **手順6（users のブロック）と同じタイミングで、続けて実行する。**
-- 手順1の直後に実行しても害はない（ポリシーは RLS が有効になるまで効かないだけ）ので、
-- 忘れそうなら先に流しておいてよい。
--
-- Supabase 公式の Custom Access Token Hook のドキュメントも、grant に加えて
-- この select ポリシーを作る手順を載せている。冗長でも害は無く、欠けていると
-- 上記のとおり静かに壊れるため、必ず入れる。
--
-- Supabase SQL Editor で実行する。

-- 念のため grant も再掲（本体を流していれば既に付いている。冪等）
grant usage on schema public to supabase_auth_admin;
grant select on table public.users to supabase_auth_admin;

-- Hook 実行ロールが users を読めるようにする本体
drop policy if exists users_select_auth_admin on public.users;
create policy users_select_auth_admin on public.users
  as permissive for select
  to supabase_auth_admin
  using (true);

-- ── 適用後の確認 ─────────────────────────────────────────────
--
-- 1) ポリシーが入ったこと（1文だけ選択して実行する）
--
--   select policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename = 'users';
--
--   期待: users_select_auth_admin が {supabase_auth_admin} で存在すること
--
-- 2) **クレームが実際に入ること**（これが本番）
--
--   Web版でログアウト → ログインし直し、DevTools > Application > Local Storage の
--   `sb-<project>-auth-token` 内の access_token を https://jwt.io に貼って、
--   ペイロードに "organization_id" があることを確認する。
--
--   users のポリシー適用後に**もう一度**この確認をすること。適用前に確認していても、
--   適用後に発行されるトークンで壊れるのがこの問題の性質。
