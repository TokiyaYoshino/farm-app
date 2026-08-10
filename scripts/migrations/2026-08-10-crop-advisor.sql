-- 作物ごとの相談スレッド（農業エージェント）。
--
-- 目的は3つ。既存の AI 機能はどれも「1回叩いて表示して消える」ため、どれも代用できない。
--
--   1. **会話**として続く（「キャベツこれどうしたらいい？」→ 回答 → 追加で聞ける）
--   2. **作物ごとに溜まる**（作付けを開くと、その作物についての相談の履歴が残っている）
--   3. **助言した作業を作業記録と照合できる**（言われたことを実際にやったかが分かる）
--
-- ai_outputs との違い: あちらは AI 出力の監査ログ（kind ごとに1行・会話の連なりを持たない）。
-- スレッドとして読み書きするには、順序・親子・作物への紐付けが要るので別テーブルにする。
-- ai_outputs への記録は従来どおり別途行う（コスト集計がそこに集まっているため）。
--
-- テナント列は organization_id のみを使う。レガシーの org 文字列カラムは新規テーブルには
-- 持ち込まない（2026-07-31-ai-outputs.sql と同じ方針）。
--
-- Supabase SQL Editor で実行する。

-- ────────────────────────────────────────────────────────────
-- 1) crop_advice_messages … 相談の1発言（user / assistant）
-- ────────────────────────────────────────────────────────────
create table if not exists crop_advice_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  crop_id         bigint not null references crops(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- assistant の発言のみ。生成時に参照した材料と、サーバーが固定文言で返した出典・限界。
  -- 後から読み返したときに「何を根拠に言われたか」が分かるように残す
  sources         jsonb,
  limits          jsonb,
  -- 農薬の希釈倍数・使用時期・使用回数（FAMIC 登録適用部の原文）。
  -- LLM に生成させず、この列に原文を保存して画面はこれを表示する
  registration_facts jsonb,
  model           text,
  usage           jsonb,
  cost_usd        numeric(10,6),
  created_by      bigint references users(id),
  created_at      timestamptz not null default now()
);

-- スレッド表示は「作物ごとに古い順」。この並びで引くのが主用途
create index if not exists crop_advice_messages_crop_created_idx
  on crop_advice_messages (organization_id, crop_id, created_at);

alter table crop_advice_messages enable row level security;
-- 既存テーブルと同じ allow_all。実ポリシー化は 2026-08-02-rls-policies.sql で一斉に行う
drop policy if exists allow_all on crop_advice_messages;
create policy allow_all on crop_advice_messages for all using (true) with check (true);

comment on table crop_advice_messages is
  '作物ごとの相談スレッド（農業エージェント）の発言。assistant 行には出典・限界・FAMIC原文を併せて保存する';

-- ────────────────────────────────────────────────────────────
-- 2) crop_advice_actions … 助言のうち「やること」として切り出した1件
-- ────────────────────────────────────────────────────────────
-- 会話文のままだと作業記録と照合できないため、助言から作業を構造化して別行にする。
--
-- **照合結果はこのテーブルに持たない**（実施済みフラグを置かない）。作業記録は後から
-- 追加・修正されるので、保存すると実態とずれる。照合は毎回 lib/adviceMatch.ts で計算する
-- ―― 収穫量の集計を metrics.ts に、農薬の使用回数を pesticideUsage.ts に集約したのと同じ理由。
create table if not exists crop_advice_actions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  crop_id         bigint not null references crops(id) on delete cascade,
  message_id      uuid not null references crop_advice_messages(id) on delete cascade,
  title           text not null,
  -- 作業記録と突き合わせるキー。reports.work_type と同じ語彙（WORK_TEMPLATES）か、
  -- work_categories の名称。**語彙に載せられない作業は null**にする。
  -- null は「照合できない」を意味し、「未実施」とは区別して扱う（lib/adviceMatch.ts）
  work_type       text,
  -- 目安の期間。LLM が出した「今週中」「開花後10日ごろ」を日付に落としたもの。
  -- 落とせなければ null（when_text だけ残す）
  due_from        date,
  due_to          date,
  -- 画面に出す元の言い回し（「今週中」など）。日付に丸めた事実を隠さないため原文も持つ
  when_text       text,
  why             text,
  -- 並び順（LLM が出した優先順）
  sort_order      int not null default 0,
  -- 利用者が「これはやらない」と判断したもの。消さずに残す（判断の履歴になる）
  dismissed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists crop_advice_actions_crop_idx
  on crop_advice_actions (organization_id, crop_id, created_at desc);
create index if not exists crop_advice_actions_message_idx
  on crop_advice_actions (message_id);

alter table crop_advice_actions enable row level security;
drop policy if exists allow_all on crop_advice_actions;
create policy allow_all on crop_advice_actions for all using (true) with check (true);

comment on table crop_advice_actions is
  '助言から切り出した「やること」。作業記録との照合結果は保存せず lib/adviceMatch.ts で毎回計算する';
comment on column crop_advice_actions.work_type is
  '作業記録と突き合わせるキー。reports.work_type と同じ語彙。載せられない作業は null（＝照合不可・未実施ではない）';
