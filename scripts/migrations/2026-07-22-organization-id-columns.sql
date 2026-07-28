-- マルチテナント化 ステップ2-1（docs/adr-001-multitenancy-and-ai.md 移行順序 2.）
-- 各テーブルに organization_id 列を追加し、既存データを霧珠ファーム組織にバックフィルする
-- 現状は霧珠ファーム1組織のみのため、バックフィルは一律でよい
-- Supabase SQL Editor で実行する（allow_allポリシーのままなのでアプリの挙動は変わらない）

-- 1) 既に org 文字列カラムを持つテーブル
do $$
declare
  kishu_id uuid;
begin
  select id into kishu_id from organizations where org_key = 'kishu';

  alter table users       add column if not exists organization_id uuid references organizations(id);
  alter table crops       add column if not exists organization_id uuid references organizations(id);
  alter table fields      add column if not exists organization_id uuid references organizations(id);
  alter table reports     add column if not exists organization_id uuid references organizations(id);
  alter table pesticides  add column if not exists organization_id uuid references organizations(id);
  alter table settings    add column if not exists organization_id uuid references organizations(id);
  alter table projects    add column if not exists organization_id uuid references organizations(id);
  alter table tickets     add column if not exists organization_id uuid references organizations(id);

  update users      set organization_id = kishu_id where organization_id is null;
  update crops       set organization_id = kishu_id where organization_id is null;
  update fields      set organization_id = kishu_id where organization_id is null;
  update reports     set organization_id = kishu_id where organization_id is null;
  update pesticides  set organization_id = kishu_id where organization_id is null;
  update settings    set organization_id = kishu_id where organization_id is null;
  update projects    set organization_id = kishu_id where organization_id is null;
  update tickets     set organization_id = kishu_id where organization_id is null;
end $$;

alter table users      alter column organization_id set not null;
alter table crops      alter column organization_id set not null;
alter table fields     alter column organization_id set not null;
alter table reports    alter column organization_id set not null;
alter table pesticides alter column organization_id set not null;
alter table settings   alter column organization_id set not null;
alter table projects   alter column organization_id set not null;
alter table tickets    alter column organization_id set not null;

-- 2) org関連カラムが全くなかったテーブル（ADR「現状の穴」C, D）
alter table comments  add column if not exists organization_id uuid references organizations(id);
alter table schedules add column if not exists organization_id uuid references organizations(id);

update comments  set organization_id = (select id from organizations where org_key = 'kishu') where organization_id is null;
update schedules set organization_id = (select id from organizations where org_key = 'kishu') where organization_id is null;

alter table comments  alter column organization_id set not null;
alter table schedules alter column organization_id set not null;
