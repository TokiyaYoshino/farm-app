-- AI出力の永続化と外部情報のインプット（第1弾）
-- 1) ai_outputs              … AI機能5本の出力を保存する（従来は useState で使い捨てだった）
-- 2) daily_weather           … Open-Meteo の日次実績を保存し、積算温度(GDD)を持つ
-- 3) pesticide_registrations … FAMIC 農薬登録情報の適用部を、自農場が使う農薬の分だけ保存する
-- 4) pesticides.registration_no … 上記を引くための農薬登録番号
--
-- Supabase SQL Editor で実行する。
-- RLS は既存テーブルと同じ allow_all を置く（RLS実ポリシー化は docs/adr-001-multitenancy-and-ai.md
-- の移行順序3〜5で全テーブル一斉に行うため、ここだけ先行させない）。
--
-- テナント列は organization_id のみを使う。レガシーの org 文字列カラムは新規テーブルには持ち込まない。
-- reports/crops/users の id は integer 系のため、FK 列は bigint で受ける（int8→int4 のFKはPostgreSQLで有効）。
-- ただし pesticides.id のみ uuid（Supabase UI経由で後から作成されたテーブルのため）。FK列もuuidで受ける。

-- ────────────────────────────────────────────────────────────
-- 1) ai_outputs
-- ────────────────────────────────────────────────────────────
create table if not exists ai_outputs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  -- 'diagnosis' | 'pest_advice' | 'daily_report' | 'voice_structure'
  kind            text not null,
  report_id       bigint references reports(id) on delete cascade,  -- 記録に紐づく場合のみ
  target_date     date,          -- 助言・日報の対象日
  field           text,          -- 集計軸。reports.field と同じ文字列を入れる
  crop_id         bigint references crops(id),
  input_summary   text,          -- AIに渡した材料の要約（監査・再現用）
  output_json     jsonb,         -- 構造化出力（diagnosis / voice_structure）
  output_text     text,          -- 自由テキスト出力（pest_advice / daily_report）
  model           text not null,
  usage           jsonb,         -- OpenAI の usage をそのまま
  cost_usd        numeric(10,6),
  created_by      bigint references users(id),
  created_at      timestamptz not null default now()
);

create index if not exists ai_outputs_org_kind_created_idx
  on ai_outputs (organization_id, kind, created_at desc);
create index if not exists ai_outputs_report_idx
  on ai_outputs (report_id);
create index if not exists ai_outputs_org_field_date_idx
  on ai_outputs (organization_id, field, target_date);

alter table ai_outputs enable row level security;
drop policy if exists allow_all on ai_outputs;
create policy allow_all on ai_outputs for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────
-- 2) daily_weather
-- ────────────────────────────────────────────────────────────
-- gdd は日別の有効積算温度 max(0, (temp_max+temp_min)/2 - 基準温度)。
-- 基準温度は暫定で10℃固定（クライアント側の定数）。梅・みかんそれぞれの適正値は
-- 実績が溜まってから見直す前提。期間累計はクエリ側で合計する。
create table if not exists daily_weather (
  organization_id uuid not null references organizations(id),
  date            date not null,
  temp_max        numeric,
  temp_min        numeric,
  rain_sum        numeric,
  wind_max        numeric,
  gdd             numeric,
  fetched_at      timestamptz not null default now(),
  primary key (organization_id, date)
);

alter table daily_weather enable row level security;
drop policy if exists allow_all on daily_weather;
create policy allow_all on daily_weather for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────
-- 3) pesticide_registrations
-- ────────────────────────────────────────────────────────────
-- FAMIC「登録適用部」CSV の該当行をそのまま保持する。
-- 希釈倍数・使用時期・使用回数は CSV 上で範囲や自然文（「1000～1600倍」「収穫前日まで」
-- 「5回以内」）を含むため、数値に正規化せず text で持つ。誤った正規化は使用基準の
-- 誤判定に直結し、農薬取締法上のリスクになる。最終的に正しいのは製品ラベルの表示。
create table if not exists pesticide_registrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pesticide_id    uuid references pesticides(id) on delete cascade,
  registration_no text not null,
  product_name    text,   -- 農薬の名称（CSV の登録上の正式名）
  crop_name       text,   -- 作物名
  pest_name       text,   -- 適用病害虫雑草名
  dilution        text,   -- 希釈倍数使用量
  usage_timing    text,   -- 使用時期
  usage_count     text,   -- 本剤の使用回数
  total_count     text,   -- 有効成分①を含む農薬の総使用回数
  application     text,   -- 使用方法
  raw             jsonb,  -- 元CSV行（ヘッダ名→値）をそのまま
  fetched_at      timestamptz not null default now()
);

create index if not exists pesticide_registrations_org_no_idx
  on pesticide_registrations (organization_id, registration_no);
create index if not exists pesticide_registrations_pesticide_idx
  on pesticide_registrations (pesticide_id);

alter table pesticide_registrations enable row level security;
drop policy if exists allow_all on pesticide_registrations;
create policy allow_all on pesticide_registrations for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────
-- 4) pesticides.registration_no
-- ────────────────────────────────────────────────────────────
alter table pesticides add column if not exists registration_no text;
