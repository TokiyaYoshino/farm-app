-- マルチテナント化 最終ステップ: RLS実ポリシー化（allow_all撤廃）
-- docs/multitenancy-progress.md の残作業。docs/adr-001-multitenancy-and-ai.md 参照。
--
-- 前提（先に完了していること）:
--   1. Custom Access Token Hook の設定（下記 0) の関数作成 + ダッシュボード設定）
--   2. 全ユーザーが一度ログインし直して新しいJWT（organization_id クレーム入り）を持つこと
--
-- 適用は docs/rls-rollout.md の手順に従い、テーブル1つずつ段階的に行うこと。
-- 一括実行すると、Hook設定漏れ・旧JWTのユーザーが全員「データが消えた」状態になる。

-- ─────────────────────────────────────────────────────────────
-- 0) Custom Access Token Hook 用の関数
--    JWTに organization_id クレームを埋め込む。
--    作成後、ダッシュボード > Authentication > Hooks (Customize Access Token) で
--    この関数を選択して有効化する。
-- ─────────────────────────────────────────────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  org_id uuid;
begin
  select organization_id into org_id
  from public.users
  where auth_id = (event->>'user_id')::uuid
  limit 1;

  claims := event->'claims';
  if org_id is not null then
    claims := jsonb_set(claims, '{organization_id}', to_jsonb(org_id::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- supabase_auth_admin がHookを実行できるようにする（Supabase公式ドキュメントの定型）
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on table public.users to supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────
-- 1) JWTから組織IDを取り出すヘルパー
-- ─────────────────────────────────────────────────────────────
create or replace function public.jwt_organization_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'organization_id', '')::uuid
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) 実ポリシー（テーブルごとに1ブロック。1テーブルずつ実行→動作確認）
--    パターン: allow_all を落とし、select/insert/update/delete を
--    organization_id = jwt_organization_id() に制限（認証必須）
-- ─────────────────────────────────────────────────────────────

-- == users ==
-- 注意: custom_access_token_hook が users を参照するため、users のRLSは
-- supabase_auth_admin の select を妨げない形にする（上の grant で担保済み）。
-- また login 画面は「login_id → email 解決」で匿名から users を select する。
-- email と login_id のみ匿名参照を許す専用ポリシーを用意する。
drop policy if exists allow_all on users;
create policy users_select_own_org on users for select
  using (organization_id = public.jwt_organization_id());
create policy users_select_login_lookup on users for select
  to anon
  using (true);  -- 匿名はRESTでは行を読めるが、PostgRESTのcolumn権限で絞る（下記 grant）
create policy users_insert_own_org on users for insert
  with check (organization_id = public.jwt_organization_id());
create policy users_update_own_org on users for update
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());
create policy users_delete_own_org on users for delete
  using (organization_id = public.jwt_organization_id());
-- 匿名が読める列を login_id/email だけに制限（ログイン解決に必要な最小限）
revoke select on users from anon;
grant select (login_id, email) on users to anon;

-- == crops ==
drop policy if exists allow_all on crops;
create policy crops_all_own_org on crops for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == fields ==
drop policy if exists allow_all on fields;
create policy fields_all_own_org on fields for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == reports ==
drop policy if exists allow_all on reports;
create policy reports_all_own_org on reports for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == schedules ==
drop policy if exists allow_all on schedules;
create policy schedules_all_own_org on schedules for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == pesticides ==
drop policy if exists allow_all on pesticides;
create policy pesticides_all_own_org on pesticides for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == comments ==
drop policy if exists allow_all on comments;
create policy comments_all_own_org on comments for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == settings ==
drop policy if exists allow_all on settings;
create policy settings_all_own_org on settings for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == projects ==
drop policy if exists allow_all on projects;
create policy projects_all_own_org on projects for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == tickets ==
drop policy if exists allow_all on tickets;
create policy tickets_all_own_org on tickets for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == ai_outputs ==
drop policy if exists allow_all on ai_outputs;
create policy ai_outputs_all_own_org on ai_outputs for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == daily_weather ==
drop policy if exists allow_all on daily_weather;
create policy daily_weather_all_own_org on daily_weather for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == work_categories ==
-- 組織列が無い共有マスタ。読み取りは認証ユーザー全員、書き込みは不可（管理者がSQLで管理）
drop policy if exists allow_all on work_categories;
create policy work_categories_select_authed on work_categories for select
  to authenticated using (true);

-- == pesticides_master / pesticide_registrations ==
-- 農薬マスタは全組織共有の読み取り専用
drop policy if exists allow_all on pesticides_master;
create policy pesticides_master_select_authed on pesticides_master for select
  to authenticated using (true);

drop policy if exists allow_all on pesticide_registrations;
create policy pesticide_registrations_all_own_org on pesticide_registrations for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == organizations ==
-- 自組織の行のみ読める（LINE設定等が入るため他組織には見せない）
drop policy if exists allow_all on organizations;
create policy organizations_select_own on organizations for select
  using (id = public.jwt_organization_id());

-- ─────────────────────────────────────────────────────────────
-- 3) Storage (report-images バケット)
--    認証ユーザーのみアップロード可・読み取りは公開のまま
--    （画像URLは推測困難なランダムパスで、Web版の公開URL前提を維持）
-- ─────────────────────────────────────────────────────────────
drop policy if exists "allow all" on storage.objects;
create policy report_images_insert_authed on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-images');
create policy report_images_select_public on storage.objects for select
  using (bucket_id = 'report-images');
