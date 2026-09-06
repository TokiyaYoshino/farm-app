-- 相談スレッドに「作物を指定しない畑全体の相談」を追加する。
--
-- 2026-08-10-crop-advisor.sql は crop_id を not null にしていたため、作物を1件も
-- 登録していない利用者と、複数の作物にまたがる相談（「今の時期に畑全体で気をつける
-- ことは？」）を拾えなかった。ホームの相談導線を1つに統合するにあたり、作物が無い
-- 状態でも入口が成立する必要がある（docs/decisions/20260906-general-advice-entry.md）。
--
-- crop_id が null の行 = 作物を指定しない畑全体の相談、という意味にする。
-- on delete cascade は参照先が無い（null）ときは発火しないため、既存の crop_id 指定行の
-- 挙動（作物を消すと相談も消える）は変わらない。
--
-- 既存の複合インデックス (organization_id, crop_id, created_at) は btree なので
-- 「crop_id is null」でもそのまま使える。インデックスの追加は不要。
--
-- 元テーブル定義: scripts/migrations/2026-08-10-crop-advisor.sql
-- Supabase SQL Editor で実行する。

alter table crop_advice_messages alter column crop_id drop not null;
alter table crop_advice_actions  alter column crop_id drop not null;

comment on column crop_advice_messages.crop_id is
  '相談対象の作物。null は「作物を指定しない畑全体の相談」（2026-09-06 に nullable 化）';
comment on column crop_advice_actions.crop_id is
  '助言対象の作物。null は畑全体の相談から出た「やること」で、作業記録との照合は作物を絞らずに行う（src/lib/adviceMatch.ts）';
