-- 作物と FAMIC 登録適用部の作物名を手動で紐付ける列を追加する。
--
-- 農薬の総使用回数（農薬取締法の使用基準）を自農場の使用実績と突き合わせるには、
-- crops.name（農家が付けた名前・例「南高梅」）と pesticide_registrations.crop_name
-- （FAMIC の登録上の作物名・例「うめ」）を対応させる必要がある。
-- 文字列の自動マッチングは「南高梅」≠「うめ」のように失敗し、誤判定は使用者を
-- 法令違反に導くため、対応は手動入力のみとする（docs/decisions/20260805-pesticide-precheck.md）。
--
-- nullable のまま運用する。未設定は「判定不可」として扱い、画面では判定を出さずに
-- 紐付けを促す。NOT NULL 化して既定値を入れると、誤った紐付けで判定が走ってしまう。
--
-- RLS は既存テーブルと同じ allow_all のままなので新規ポリシーは不要
-- （実ポリシー化は scripts/migrations/2026-08-02-rls-policies.sql で全テーブル一斉に行う）。
--
-- Supabase SQL Editor で実行する。

alter table crops add column if not exists famic_crop_name text;

comment on column crops.famic_crop_name is
  'FAMIC 登録適用部の作物名（例: 南高梅 → うめ）。使用回数の突き合わせに使う手動紐付け。未設定は判定不可として扱う';
