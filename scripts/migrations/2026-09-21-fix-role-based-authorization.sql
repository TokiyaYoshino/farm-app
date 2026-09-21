-- セキュリティ監査（cloudflare/security-audit-skill, 2026-09-21実施）で見つかった
-- 「RLSがorganization_idしか見ておらずroleを一切見ていない」という共通の欠陥を塞ぐ。
--
-- ── 何が問題だったか ─────────────────────────────────────────
--
-- 2026-08-02-rls-policies.sql で入れた `<table>_all_own_org` パターンは
-- 「同じ組織かどうか」だけを見ており、「adminかworkerか」を一切見ていなかった。
-- その結果、ログイン済みのworkerロールが devtools から直接 Supabase クライアントを
-- 叩くだけで、次のことができてしまっていた（isAdmin はUIの表示/非表示だけで、
-- DB側の防御ではなかった）：
--
--   1. 【CRITICAL】自分自身の users.role を "admin" に書き換えて完全に昇格する
--      （api/_auth.ts の requireAdmin もこの列を毎回信頼するため、サーバーAPIの
--      認可判定まで突破する）
--   2. 【HIGH】crops / fields / pesticides / settings を削除・改変する
--   3. 【HIGH】他ユーザー（admin含む）のアカウントを削除する
--
-- ── 直し方の方針 ─────────────────────────────────────────────
--
-- 1) role列の変更は「本人の直接UPDATE」では絶対に通らないようにする。
--    RLSのWITH CHECK句だけでは OLD/NEW の比較が信頼できない（同一トランザクション内の
--    サブクエリはタイミング依存になりうる）ため、確実な BEFORE UPDATE トリガーで防ぐ。
--    api/set-user-auth.ts は SUPABASE_SERVICE_ROLE_KEY を使っており、その場合の
--    Postgresロールは 'service_role' になる（auth.role()で判定可能）ため、
--    正規の管理者APIだけは引き続きroleを変更できる。
-- 2) crops / fields / pesticides / settings は、SELECTは従来通り組織内なら誰でも、
--    INSERT/UPDATE/DELETE（＝マスタデータの変更）はadminロールのみに制限する。
-- 3) users の DELETE も同様にadminロールのみに制限する
--    （UPDATEは今回は対象外。自分のプロフィール項目編集を壊さないよう、
--    role保護トリガーだけで塞ぎ、他ユーザーの行への書き込み制限は別途要検討）。
--
-- Supabase SQL Editor で実行する。1文ずつ確認しながら流すこと
-- （2026-09-05/09-12 で「Successと出ても実際は反映されていない」事故が過去にあったため）。

-- ─────────────────────────────────────────────────────────────
-- 1) role列の自己変更を防ぐトリガー
-- ─────────────────────────────────────────────────────────────
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'role列の変更は管理者API（api/set-user-auth.ts）経由でのみ許可されています';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.prevent_role_self_change() is
  'usersテーブルのrole列を、service_roleキー（api/set-user-auth.ts）以外からの変更で拒否する。2026-09-21のセキュリティ監査で見つかった自己昇格（worker→admin）を塞ぐため。';

drop trigger if exists trg_prevent_role_self_change on public.users;
create trigger trg_prevent_role_self_change
before update on public.users
for each row
execute function public.prevent_role_self_change();

-- ─────────────────────────────────────────────────────────────
-- 2) 組織内での役割判定ヘルパー（jwt_organization_id() と同じ設計）
--    SECURITY DEFINER + search_path='' で、呼び出し元のRLSやスキーマ乗っ取りの
--    影響を受けないようにする。
-- ─────────────────────────────────────────────────────────────
create or replace function public.jwt_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.auth_id = auth.uid()
      and u.role = 'admin'
  )
$$;

comment on function public.jwt_is_admin() is
  'RLSポリシー用。呼び出し元ユーザーのusers.roleがadminかどうかを判定する。2026-09-21のセキュリティ監査対応で追加。';

-- ─────────────────────────────────────────────────────────────
-- 3) crops / fields / pesticides / settings: 変更系（insert/update/delete）を
--    adminロールのみに制限する。selectは従来通り組織内なら誰でも可。
--
--    既存の *_all_own_org (for all) を1本ずつ select用とwrite用に分割する。
--    2026-09-12の教訓に従い、対象テーブルの既存ポリシーを名前決め打ちではなく
--    全部列挙してdropしてから作り直す。
-- ─────────────────────────────────────────────────────────────

-- 2026-09-12の教訓（RLSがテーブルレベルで無効だとポリシーごと無視される）に従い、
-- 念のため明示的に有効化しておく（既に有効なはずだが、確認コストがゼロなので実行する）。
alter table public.crops enable row level security;
alter table public.fields enable row level security;
alter table public.pesticides enable row level security;
alter table public.settings enable row level security;
alter table public.users enable row level security;

-- crops
drop policy if exists crops_all_own_org on public.crops;
create policy crops_select_own_org on public.crops for select
  using (organization_id = public.jwt_organization_id());
create policy crops_write_admin_only on public.crops for insert
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy crops_update_admin_only on public.crops for update
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin())
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy crops_delete_admin_only on public.crops for delete
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin());

-- fields
drop policy if exists fields_all_own_org on public.fields;
create policy fields_select_own_org on public.fields for select
  using (organization_id = public.jwt_organization_id());
create policy fields_write_admin_only on public.fields for insert
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy fields_update_admin_only on public.fields for update
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin())
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy fields_delete_admin_only on public.fields for delete
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin());

-- pesticides
drop policy if exists pesticides_all_own_org on public.pesticides;
create policy pesticides_select_own_org on public.pesticides for select
  using (organization_id = public.jwt_organization_id());
create policy pesticides_write_admin_only on public.pesticides for insert
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy pesticides_update_admin_only on public.pesticides for update
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin())
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy pesticides_delete_admin_only on public.pesticides for delete
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin());

-- settings
drop policy if exists settings_all_own_org on public.settings;
create policy settings_select_own_org on public.settings for select
  using (organization_id = public.jwt_organization_id());
create policy settings_write_admin_only on public.settings for insert
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy settings_update_admin_only on public.settings for update
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin())
  with check (organization_id = public.jwt_organization_id() and public.jwt_is_admin());
create policy settings_delete_admin_only on public.settings for delete
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin());

-- ─────────────────────────────────────────────────────────────
-- 4) users: DELETEをadminロールのみに制限する（UPDATE/INSERT/SELECTは変更しない）
-- ─────────────────────────────────────────────────────────────
drop policy if exists users_delete_own_org on public.users;
create policy users_delete_admin_only on public.users for delete
  using (organization_id = public.jwt_organization_id() and public.jwt_is_admin());

-- ── 適用後の確認（1文ずつ実行する）────────────────────────────
--
--   select tablename, policyname, cmd, roles
--     from pg_policies
--    where tablename in ('crops','fields','pesticides','settings','users')
--    order by tablename, cmd;
--
-- 期待: crops/fields/pesticides/settings それぞれに select 1本 + insert/update/delete
--       各1本（計4本）、users は他の既存ポリシーに users_delete_admin_only が
--       追加されている（旧 users_delete_own_org は消えている）。
--
--   select tgname, tgrelid::regclass from pg_trigger
--    where tgname = 'trg_prevent_role_self_change';
--
-- 期待: 1行（public.users に付いている）。
--
-- **ポリシーの確認だけでは足りない。RLSが有効かも見る**（2026-09-12の教訓）:
--
--   select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
--      and relname in ('crops','fields','pesticides','settings','users');
--
-- 期待: 0行。
--
-- ── 適用後のスモークテスト ───────────────────────────────────
-- 1. workerアカウントでログインし、devtoolsコンソールから
--      supabase.from("users").update({role:"admin"}).eq("id", 自分のid)
--    を実行 → エラーになること（"role列の変更は管理者API経由でのみ許可されています"）
-- 2. 同じworkerアカウントで
--      supabase.from("crops").delete().eq("id", 既存のcrop id)
--    を実行 → 0件更新（RLSにより対象行が見えない）になること
-- 3. adminアカウントでは通常通り作物・圃場・農薬の追加/削除・組織設定の変更ができること
-- 4. workerアカウントで通常の作業報告の作成・自分のコメント編集など、
--    今回変更していない機能が引き続き動作すること
--
-- 切り戻し（何か壊れた場合）:
--   drop trigger if exists trg_prevent_role_self_change on public.users;
--   drop policy if exists crops_select_own_org on public.crops;
--   drop policy if exists crops_write_admin_only on public.crops;
--   drop policy if exists crops_update_admin_only on public.crops;
--   drop policy if exists crops_delete_admin_only on public.crops;
--   create policy crops_all_own_org on public.crops for all
--     using (organization_id = public.jwt_organization_id())
--     with check (organization_id = public.jwt_organization_id());
--   -- fields / pesticides / settings も同様のパターンで戻す
--   drop policy if exists users_delete_admin_only on public.users;
--   create policy users_delete_own_org on public.users for delete
--     using (organization_id = public.jwt_organization_id());
