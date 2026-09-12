-- ────────────────────────────────────────────────────────────
-- 相談スレッド（主題ごとの箱）
--
-- 経緯: docs/decisions/20260909-single-ai-entry-threads.md
--   AI機能が6つに分かれ、うち5つは「1回叩いて消える」（ai_outputs は監査ログで
--   画面から読み返せない、記録に聞くに至っては保存実装が無い）。使う側から見ると
--   行き先が6つバラバラで5つが行き止まりになっていた。
--   入口を「相談」1つに寄せ、主題ごとのスレッドにやりとりを溜める形に変える。
--
-- 既存の crop_advice_messages / crop_advice_actions（2026-08-10-crop-advisor.sql）を
-- 作付け固定からスレッド所属に一般化する。既存データは作付けごとのスレッドへ移す。
--
-- Supabase SQL Editor で実行する。**アプリのデプロイより先に流すこと**
-- （新コードは thread_id を書くため、列が無いと insert が失敗する）。
-- ────────────────────────────────────────────────────────────

-- 1) スレッド本体
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

-- 2) 既存メッセージをスレッドに所属させる
alter table crop_advice_messages
  add column if not exists thread_id uuid references advice_threads(id) on delete cascade;

-- 日報・診断・散布時期の結果もスレッドに残せるようにする。
-- null は従来どおりの相談の発言（作物エージェントの応答）
alter table crop_advice_messages
  add column if not exists kind text;

alter table crop_advice_actions
  add column if not exists thread_id uuid references advice_threads(id) on delete cascade;

-- 3) 既存データの移行：作付けごとに1本スレッドを作り、そこへ寄せる
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

-- 作付けに紐づかない相談（crop_id is null）は上の移行から漏れる。元スキーマは
-- crop_id not null だったが、実テーブルは制約が付く前に作られており、作付けを
-- 指定しない相談が残っていた（2026-09-10 実測）。組織ごとに受け皿を1本作って寄せる
with newthread as (
  insert into advice_threads (organization_id, title, crop_id, created_by, created_at, updated_at)
  select m.organization_id, '畑全体の相談', null,
         min(m.created_by), min(m.created_at), max(m.created_at)
  from crop_advice_messages m
  where m.thread_id is null and m.crop_id is null
  group by m.organization_id
  returning id, organization_id
)
update crop_advice_messages m
set thread_id = n.id
from newthread n
where m.thread_id is null
  and m.crop_id is null
  and m.organization_id = n.organization_id;

-- やることは crop_id ではなく親の発言（message_id）を辿る。crop_id 経由だと同じ取りこぼしが起きる
update crop_advice_actions a
set thread_id = m.thread_id
from crop_advice_messages m
where a.thread_id is null
  and a.message_id = m.id
  and m.thread_id is not null;

-- 4) 作付けに紐づかないスレッドを許すため crop_id の not null を外す
--    （既存行は上の移行で thread_id が入っているので、値はそのまま残る）
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

-- 5) 確認
--   select count(*) from advice_threads;
--   select count(*) from crop_advice_messages where thread_id is null;  -- 0 になること
--   select count(*) from crop_advice_actions  where thread_id is null;  -- 0 になること
