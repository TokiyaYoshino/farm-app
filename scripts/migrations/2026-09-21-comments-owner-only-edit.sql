-- コメントの編集・削除を投稿者本人のみに制限する（セキュリティ監査対応）。
--
-- ── 何が問題だったか ─────────────────────────────────────────
--
-- comments_all_own_org は organization_id しか見ておらず、user_id（投稿者）を
-- 一切見ていなかった。CLAUDE.mdの規約「コメントは自分のみ編集可」はUI側
-- （src/ui/CommentThread.tsx）でのみ守られており、DB側では同一組織の
-- 誰でも他人のコメントを書き換え・削除できる状態だった。
--
-- ── 直し方 ───────────────────────────────────────────────────
--
-- select/insert は従来通り組織内なら誰でも可能なまま維持する（コメント閲覧・投稿は
-- 通常業務フロー）。update/delete のみ「投稿者本人（かつ同じ組織）」に制限する。
--
-- 「本人」の判定は jwt_organization_id() と同じ設計（SECURITY DEFINER）の
-- 新しいヘルパー jwt_user_id() を作って使う。今後、他のテーブルで同種の
-- 「本人のみ」制限が要るときにも再利用できる。
--
-- Supabase SQL Editor で実行する。

create or replace function public.jwt_user_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.users u where u.auth_id = auth.uid()
$$;

comment on function public.jwt_user_id() is
  'RLSポリシー用。呼び出し元ユーザー自身のusers.idを返す。「本人のみ」制限に使う。2026-09-21のセキュリティ監査対応で追加。';

-- 2026-09-12の教訓に従い、既存ポリシーを名前決め打ちではなく明示的にdropしてから作り直す。
drop policy if exists comments_all_own_org on public.comments;

create policy comments_select_own_org on public.comments for select
  using (organization_id = public.jwt_organization_id());

create policy comments_insert_own_org on public.comments for insert
  with check (organization_id = public.jwt_organization_id());

create policy comments_update_own_comment on public.comments for update
  using (organization_id = public.jwt_organization_id() and user_id = public.jwt_user_id())
  with check (organization_id = public.jwt_organization_id() and user_id = public.jwt_user_id());

create policy comments_delete_own_comment on public.comments for delete
  using (organization_id = public.jwt_organization_id() and user_id = public.jwt_user_id());

-- ── 適用後の確認 ─────────────────────────────────────────────
--
--   select tablename, policyname, cmd from pg_policies
--    where tablename = 'comments' order by cmd;
--   -- 期待: select/insert/update/delete が1本ずつ（計4本）、comments_all_own_org は消えている
--
-- ── 適用後のスモークテスト ───────────────────────────────────
-- 1. 自分のコメントを編集できること（従来通り）
-- 2. 他人のコメントIDを指定して直接APIで更新を試みる → 0件更新（拒否）になること
-- 3. コメントの閲覧・新規投稿は従来通り誰でもできること
--
-- 切り戻し:
--   drop policy if exists comments_select_own_org on public.comments;
--   drop policy if exists comments_insert_own_org on public.comments;
--   drop policy if exists comments_update_own_comment on public.comments;
--   drop policy if exists comments_delete_own_comment on public.comments;
--   create policy comments_all_own_org on public.comments for all
--     using (organization_id = public.jwt_organization_id())
--     with check (organization_id = public.jwt_organization_id());
