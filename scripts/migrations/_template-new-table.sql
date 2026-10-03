-- 新しいテーブルを作るときのひな形（このファイル自体は実行しない。コピーして日付つきの名前にする）
--
-- なぜ必要か: 新設テーブルが RLS 無効・ポリシー無しのまま残る事故が過去に2回あった
--   - work_categories: RLS 自体が無効で、ポリシーが書いてあっても無視され匿名に全行が漏れた
--   - advice_threads : ポリシーが allow_all のまま放置され、匿名に4行漏れた
--   （2026-09-12-rls-anon-leaks.sql で事後対応）。RLS が無効だとポリシーは存在しても効かない。
--   組織が自由に増える前提では、この種の漏れは他組織のデータが見える事故になる。
--
-- ルール:
--   1. 組織のデータを持つ表は organization_id uuid not null references organizations(id) を必ず持つ
--   2. enable row level security を create table と同じファイルで必ず実行する
--   3. ポリシーは下の <表名>_all_own_org の形にする。using (true) や allow_all は使わない
--   4. 流したら末尾の確認クエリを実行し、数字を見てから終わる（「Success」表示だけで終わらせない。
--      「Success でもポリシーが実際には作られていない」事故が users / pesticide_registrations で起きた）
--   5. 組織の列を持たない共有マスタにする場合は、その理由をこのファイルのコメントに書く
--
-- Supabase SQL Editor で、1 文ずつ実行する。

create table if not exists <表名> (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  created_at      timestamptz not null default now()
  -- ここに列を足す
);

create index if not exists <表名>_org_idx on <表名> (organization_id);

alter table <表名> enable row level security;

drop policy if exists <表名>_all_own_org on <表名>;
create policy <表名>_all_own_org on <表名> for all
  using      (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- 確認 1: relrowsecurity が true であること
select relname, relrowsecurity from pg_class where relname = '<表名>';

-- 確認 2: ポリシーが <表名>_all_own_org の1本だけで、qual が organization_id の比較になっていること
--         （qual が true だけのものや、roles に anon が入っているものが無いこと）
select policyname, roles, cmd, qual, with_check from pg_policies
 where schemaname = 'public' and tablename = '<表名>';
