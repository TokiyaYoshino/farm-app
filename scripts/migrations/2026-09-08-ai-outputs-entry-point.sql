-- ai_outputs に「どの導線から呼ばれたか」を残す1列を足す
--
-- ── なぜ必要か ───────────────────────────────────────────────
--
-- 2026-08-23 の情報設計（docs/decisions/20260823-ai-information-architecture.md）は
-- 機能の中身ではなく**置き場所**を変える判断だった。ところが効果を測る手段が無く、
-- 「未検証」のまま終わっている。情報設計の変更は今回で3回目だが、3回とも同じ。
--
-- kind では代用できない。Web版の AI 起点は9つあり、そのうち3つが同じ
-- kind='diagnosis' を吐くため（記録一覧の写真直下 / 記録詳細シート内 / ホームの単体診断）、
-- kind だけでは「どの置き場所が効いたか」が原理的に分離できない。
--
-- ── 値の決め方 ───────────────────────────────────────────────
--
-- 「画面_機能」で固定する。導線を動かしたときは**新しい値を足す**こと。
-- 既存の値の意味を変えると、変更前後の比較というこの列の唯一の用途が壊れる。
--
-- 既存行（開発時の動作確認ぶんのみ）は null のまま残す。埋めない
-- ―― どの導線から呼ばれたか分からないものを推測で埋めると、以後の集計が汚れる。
--
-- ── 権限 ─────────────────────────────────────────────────────
--
-- ai_outputs の RLS ポリシーは 2026-08-02-rls-policies.sql が organization_id 基準で
-- 張っている。列の追加はポリシーに影響しないため、ここでの対応は不要。
--
-- Supabase SQL Editor で実行する。

alter table ai_outputs add column if not exists entry_point text;

comment on column ai_outputs.entry_point is
  'AI機能を呼び出した導線の識別子（画面_機能）。kind とは別軸で、同じ kind でも置き場所が複数あるため置き場所の効果測定にはこちらを使う。値は src/App.tsx の AiEntryPoint 型が正。';

-- 「導線ごとに、いつ、何回呼ばれたか」を引くための索引
create index if not exists ai_outputs_org_entry_created_idx
  on ai_outputs (organization_id, entry_point, created_at desc);

-- ── 適用後の確認（1文ずつ実行する）────────────────────────────
-- Supabase SQL Editor は複数文をまとめて流すと結果を表示しないため、
-- 確認したいときは下を1文だけ選択して実行する

-- 列が入ったか
-- select column_name, data_type from information_schema.columns
--   where table_name = 'ai_outputs' and column_name = 'entry_point';

-- 導線ごとの呼び出し回数（これが本来やりたかった集計）
-- select entry_point, kind, count(*), max(created_at)
--   from ai_outputs group by entry_point, kind order by count(*) desc;
