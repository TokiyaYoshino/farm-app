-- マルチテナント化 ステップ1（docs/adr-001-multitenancy-and-ai.md 移行順序 1.）
-- organizations テーブル作成 + 既存データ(org="kishu")の組織登録
-- Supabase SQL Editor で実行する

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  org_key text unique not null,        -- 既存テーブルの `org` 文字列カラムと対応させるキー（例: 'kishu'）
  name text not null,
  plan text not null default 'free',
  status text not null default 'active',
  line_channel_token text,
  line_group_id text,
  created_at timestamptz not null default now()
);

insert into organizations (org_key, name)
values ('kishu', '霧珠ファーム')
on conflict (org_key) do nothing;
