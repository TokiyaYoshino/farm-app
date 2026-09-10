-- ════════════════════════════════════════════════════════════
-- 2026-09-09 リリース：これ1本を Supabase SQL Editor に貼って Run する
--
-- 中身は既存の2本を、実行しなければならない順に連結しただけのもの。
--   1) 2026-09-09-advice-threads.sql        （相談スレッド）
--   2) 2026-09-09-ai-outputs-entry-point.sql（導線の記録）
-- 個別に流したい場合は上の2ファイルをそのまま使ってよい。
--
-- **何度流しても壊れない。** create table if not exists /
-- add column if not exists / create index if not exists で書いてあり、
-- 3) のデータ移行も「まだ thread_id が入っていない行」だけを対象にしている。
--
-- 流すまでの状態（アプリは先にデプロイ済み）:
--   - 相談タブが出ない（テーブルが無いことを起動時に検知して隠している）
--   - **AIの利用ログが1件も保存されていない**（ai_outputs.entry_point が無く insert が失敗する）
--
-- 手順: Supabase ダッシュボード → SQL Editor → New query → 全文を貼る → Run
--       最後に出る確認クエリの結果を見る（orphan_messages = 0 / entry_point_col = 1）
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- 1) 相談スレッド（主題ごとの箱）
--
-- 経緯: docs/decisions/20260909-single-ai-entry-threads.md
--   AI機能が6つに分かれ、うち5つは「1回叩いて消える」（ai_outputs は監査ログで
--   画面から読み返せない、記録に聞くに至っては保存実装が無い）。使う側から見ると
--   行き先が6つバラバラで5つが行き止まりになっていた。
--   入口を「相談」1つに寄せ、主題ごとのスレッドにやりとりを溜める形に変える。
--
-- 既存の crop_advice_messages / crop_advice_actions（2026-08-10-crop-advisor.sql）を
-- 作付け固定からスレッド所属に一般化する。既存データは作付けごとのスレッドへ移す。
-- ────────────────────────────────────────────────────────────

-- 1-1) スレッド本体
create table if not exists advice_threads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  -- 主題。利用者が自由に付ける（例:「トマトの病害虫」「今年の防除計画」）
  title           text not null,
  -- 任意の紐付け。作付けが入っていれば、その作付けの記録と農薬登録情報を材料に使う
  crop_id         bigint references crops(id) on delete set null,
  field           text,
  created_by      bigint references users(id),
  created_at      timestamptz not null default now(),
  -- 一覧は「最近動いたもの順」で出す。発言のたびに更新する
  updated_at      timestamptz not null default now(),
  -- アプリが用途を決めて使うスレッド。'daily_report' は日報だけが溜まる1本。
  -- 日報は日付単位、ふつうのスレッドは主題単位で粒度が違うので混ぜない
  system_key      text
);

-- 用途つきスレッドは組織にひとつだけ（日報スレッドが増殖しないように）
create unique index if not exists advice_threads_org_system_key_idx
  on advice_threads (organization_id, system_key) where system_key is not null;

create index if not exists advice_threads_org_updated_idx
  on advice_threads (organization_id, updated_at desc);

alter table advice_threads enable row level security;
drop policy if exists allow_all on advice_threads;
create policy allow_all on advice_threads for all using (true) with check (true);

comment on table advice_threads is
  '相談スレッド。主題ごとにやりとりを溜める箱。crop_id は任意（自由な主題も立てられる）';
comment on column advice_threads.system_key is
  'アプリが用途を決めるスレッド。daily_report=日報だけが溜まる1本。null は利用者が立てた主題';

-- 1-2) 既存メッセージをスレッドに所属させる
alter table crop_advice_messages
  add column if not exists thread_id uuid references advice_threads(id) on delete cascade;

-- 日報・診断・散布時期の結果もスレッドに残せるようにする。
-- null は従来どおりの相談の発言（作物エージェントの応答）
alter table crop_advice_messages
  add column if not exists kind text;

alter table crop_advice_actions
  add column if not exists thread_id uuid references advice_threads(id) on delete cascade;

-- 1-3) 既存データの移行：作付けごとに1本スレッドを作り、そこへ寄せる
insert into advice_threads (organization_id, title, crop_id, created_by, created_at, updated_at)
select
  m.organization_id,
  coalesce(c.name, '作付け') || 'の相談',
  m.crop_id,
  min(m.created_by),
  min(m.created_at),
  max(m.created_at)
from crop_advice_messages m
left join crops c on c.id = m.crop_id
where m.thread_id is null and m.crop_id is not null
group by m.organization_id, m.crop_id, c.name;

update crop_advice_messages m
set thread_id = t.id
from advice_threads t
where m.thread_id is null
  and m.crop_id is not null
  and t.organization_id = m.organization_id
  and t.crop_id = m.crop_id;

update crop_advice_actions a
set thread_id = t.id
from advice_threads t
where a.thread_id is null
  and a.crop_id is not null
  and t.organization_id = a.organization_id
  and t.crop_id = a.crop_id;

-- 1-4) 作付けに紐づかないスレッドを許すため crop_id の not null を外す
--      （既存行は上の移行で thread_id が入っているので、値はそのまま残る）
alter table crop_advice_messages alter column crop_id drop not null;
alter table crop_advice_actions  alter column crop_id drop not null;

create index if not exists crop_advice_messages_thread_created_idx
  on crop_advice_messages (thread_id, created_at);
create index if not exists crop_advice_actions_thread_created_idx
  on crop_advice_actions (thread_id, created_at);

comment on column crop_advice_messages.thread_id is
  '所属スレッド。作付け固定をやめてスレッド所属にした（2026-09-09）';
comment on column crop_advice_messages.kind is
  'null=相談の発言。daily_report/diagnosis/pest_advice/record_search はその機能の結果をスレッドに残したもの';


-- ────────────────────────────────────────────────────────────
-- 2) ai_outputs に「どの導線から呼ばれたか」を残す
--
-- 経緯: docs/decisions/20260909-advice-tab-keep-with-exit-criteria.md
--   情報設計の変更を3回続けているが、3回とも「効果は未検証」で終わっている。
--   母数の少なさだけでなく、そもそも**どの入口から使われたかを記録していない**のが原因。
--   kind では代用できない。例えば kind='diagnosis' は
--   （記録一覧の写真直下／記録詳細／＋記録の3択／相談タブの道具）の4か所から出る。
-- ────────────────────────────────────────────────────────────

alter table ai_outputs add column if not exists entry_point text;

comment on column ai_outputs.entry_point is
  'どの導線から呼ばれたか。相談タブの撤退判断に使う。'
  'thread_tool=相談スレッド内の道具 / quick_picker=＋記録の3択 / note_field=記録フォームのメモ欄 / '
  'home=ホームのカード / record_list=記録一覧 / calendar=カレンダーの日付 / report_photo=記録一覧の写真直下 / '
  'report_detail=記録詳細シート / thread=相談スレッド本体の発言';

create index if not exists ai_outputs_org_entry_created_idx
  on ai_outputs (organization_id, entry_point, created_at desc);


-- ────────────────────────────────────────────────────────────
-- 3) 確認（この結果を見てから画面をリロードする）
--    orphan_messages = 0 / entry_point_col = 1 なら成功
-- ────────────────────────────────────────────────────────────
select
  (select count(*) from advice_threads)                                as threads,
  (select count(*) from crop_advice_messages where thread_id is null)  as orphan_messages,
  (select count(*) from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'ai_outputs'
       and column_name  = 'entry_point')                               as entry_point_col;

-- 導線ごとの利用状況を見たくなったら（しばらく使ってから）
--   select entry_point, kind, count(*)
--   from ai_outputs
--   where created_at > now() - interval '30 days'
--   group by 1, 2 order by 3 desc;
