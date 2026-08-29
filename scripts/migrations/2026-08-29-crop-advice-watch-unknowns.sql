-- 相談の「見ておくこと」「判断できないこと」を保存する列を足す。
--
-- api/advise.ts は watch_points（今の時期に見ておくべき点）と
-- unknowns（渡された情報では判断できないこと）を生成していたが、保存先が無く
-- **画面に一度も出ていなかった**。生成コストだけ払って捨てていた状態。
--
-- sources / limits と同じ jsonb 列にする。文字列の配列で、生成時のものをそのまま残す
-- （あとで文言を変えても過去の発言は当時のまま、という既存の方針に揃える）。
--
-- 既存行は null になる。画面側は null 安全に描くこと（過去のスレッドを開いても崩れない）。
--
-- RLS: crop_advice_messages のポリシー（2026-08-23-rls-crop-advice.sql の
-- crop_advice_messages_all_own_org）は organization_id しか見ておらず、列を指定していない。
-- したがって列の追加でポリシーの変更は不要。
--
-- Supabase SQL Editor で実行する（手順は docs/supabase-ops.md）。

alter table crop_advice_messages
  add column if not exists watch_points jsonb,
  add column if not exists unknowns     jsonb;

comment on column crop_advice_messages.watch_points is
  '相談の回答のうち「今の時期に見ておくべき点」。文字列の配列。api/advise.ts が生成したものをそのまま保存する';
comment on column crop_advice_messages.unknowns is
  '相談の回答のうち「渡された情報では判断できないこと」。文字列の配列。sources / limits と同じく前提として折りたたんで表示する';

-- ── 適用後の確認（1文だけ選択して実行する）────────────────────────
-- select column_name, data_type from information_schema.columns
--   where table_name = 'crop_advice_messages' and column_name in ('watch_points','unknowns');
