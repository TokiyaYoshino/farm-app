-- マルチテナント化 移行ステップ2（docs/adr-001-multitenancy-and-ai.md 移行順序 2.）
-- 各テーブルに organization_id 列を追加し、既存データを霧珠ファーム組織にバックフィルしたうえで NOT NULL 化する。
-- 現状は霧珠ファーム1組織のみのため、バックフィルは一律でよい。
--
-- 実行方法: 2026-07-28-01-organizations-and-login-id.sql を先に実行した後、
--          Supabase ダッシュボード → SQL Editor で実行する（このリポジトリからは実行しない）。
-- 実行後もRLSはallow_allのまま変更しないため、アプリの挙動（RLS起因のもの）は変わらない。
-- クライアント側コード（src/App.tsx）は organization_id 列の有無に関わらず動作するように
-- フォールバック実装済みなので、このSQLの実行前後どちらでもデプロイ可能。
-- 冪等性: add column if not exists / where organization_id is null のみ更新のため再実行安全。

-- 1) 既に org 文字列カラムを持つテーブル
do $$
declare
  kishu_id uuid;
begin
  select id into kishu_id from organizations where org_key = 'kishu';
  if kishu_id is null then
    raise exception 'organizations に org_key=kishu が見つかりません。先に2026-07-28-01を実行してください';
  end if;

  alter table users       add column if not exists organization_id uuid references organizations(id);
  alter table crops       add column if not exists organization_id uuid references organizations(id);
  alter table fields      add column if not exists organization_id uuid references organizations(id);
  alter table reports     add column if not exists organization_id uuid references organizations(id);
  alter table pesticides  add column if not exists organization_id uuid references organizations(id);
  alter table settings    add column if not exists organization_id uuid references organizations(id);
  alter table projects    add column if not exists organization_id uuid references organizations(id);
  alter table tickets     add column if not exists organization_id uuid references organizations(id);

  update users      set organization_id = kishu_id where organization_id is null;
  update crops      set organization_id = kishu_id where organization_id is null;
  update fields     set organization_id = kishu_id where organization_id is null;
  update reports    set organization_id = kishu_id where organization_id is null;
  update pesticides set organization_id = kishu_id where organization_id is null;
  update settings   set organization_id = kishu_id where organization_id is null;
  update projects   set organization_id = kishu_id where organization_id is null;
  update tickets    set organization_id = kishu_id where organization_id is null;

  -- 2) org関連カラムが全くなかったテーブル（ADR「現状の穴」C, D）
  alter table comments  add column if not exists organization_id uuid references organizations(id);
  alter table schedules add column if not exists organization_id uuid references organizations(id);

  update comments  set organization_id = kishu_id where organization_id is null;
  update schedules set organization_id = kishu_id where organization_id is null;
end $$;

-- 3) NOT NULL化（バックフィル完了後に実行する。2組織目を受け入れる直前に流すのでもよい）
alter table users      alter column organization_id set not null;
alter table crops      alter column organization_id set not null;
alter table fields     alter column organization_id set not null;
alter table reports    alter column organization_id set not null;
alter table pesticides alter column organization_id set not null;
alter table settings   alter column organization_id set not null;
alter table projects   alter column organization_id set not null;
alter table tickets    alter column organization_id set not null;
alter table comments   alter column organization_id set not null;
alter table schedules  alter column organization_id set not null;
