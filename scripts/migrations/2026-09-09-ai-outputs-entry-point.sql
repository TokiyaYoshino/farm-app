-- ────────────────────────────────────────────────────────────
-- ai_outputs に「どの導線から呼ばれたか」を残す
--
-- 経緯: docs/decisions/20260909-advice-tab-keep-with-exit-criteria.md
--   情報設計の変更を3回続けているが、3回とも「効果は未検証」で終わっている。
--   母数の少なさだけでなく、そもそも**どの入口から使われたかを記録していない**のが原因。
--   kind では代用できない。例えば kind='diagnosis' は
--   （記録一覧の写真直下／記録詳細／＋記録の3択／相談タブの道具）の4か所から出る。
--
-- Supabase SQL Editor で実行する。**アプリのデプロイより先に流すこと**
-- （新コードは entry_point を書くため、列が無いと insert が失敗する）。
-- ────────────────────────────────────────────────────────────

alter table ai_outputs add column if not exists entry_point text;

comment on column ai_outputs.entry_point is
  'どの導線から呼ばれたか。相談タブの撤退判断に使う。'
  'thread_tool=相談スレッド内の道具 / quick_picker=＋記録の3択 / note_field=記録フォームのメモ欄 / '
  'home=ホームのカード / record_list=記録一覧 / calendar=カレンダーの日付 / report_photo=記録一覧の写真直下 / '
  'report_detail=記録詳細シート / thread=相談スレッド本体の発言';

create index if not exists ai_outputs_org_entry_created_idx
  on ai_outputs (organization_id, entry_point, created_at desc);

-- 集計例（相談タブがどれだけ使われているか）
--   select entry_point, kind, count(*)
--   from ai_outputs
--   where created_at > now() - interval '30 days'
--   group by 1, 2 order by 3 desc;
