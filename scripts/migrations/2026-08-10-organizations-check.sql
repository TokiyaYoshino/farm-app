-- organizations の実体確認と、欠けていた場合の補填。
-- 2026-08-10-crop-advisor.sql を流す**前**に、これを Supabase SQL Editor で実行する。
--
-- なぜ必要か:
--   crop_advice_messages / crop_advice_actions は
--   `organization_id uuid not null references organizations(id)` を持つ。
--   参照先の行が無ければ、アプリからの insert は必ず FK 違反で落ちる（＝相談が保存されない）。
--
-- なぜ anon key で確認できないか:
--   `2026-07-22-organizations-step1.sql` は organizations に allow_all ポリシーを作っていない
--   （後続の 2026-07-31-ai-outputs.sql 以降は作っている）。RLS が有効でポリシーが無いテーブルは
--   **エラーを返さず0件**になる。そのためクライアントからは「0行」と「見えないだけ」を区別できない。
--   SQL Editor は postgres ロールで RLS を通り抜けるので、ここでしか確定できない。
--
-- 状況の推定（実行前）:
--   ai_outputs に10行あり全行 organization_id = d7093714-418a-4c35-a153-ecf70d626089。
--   ai_outputs → organizations の FK は実在する（PostgREST の埋め込みが解決する）。
--   FK があって親行が無い行は作れないので、**この id の行は既にあるはず**。
--   つまり 2) の insert は 0 行で終わるのが期待値。1行入ったら上の推定が外れていたということ。

-- ────────────────────────────────────────────────────────────
-- 1) 現状を出す（読み取りのみ。ここの結果を見てから 2) 以降へ）
-- ────────────────────────────────────────────────────────────
select 'organizations の中身' as label;
select id, org_key, name, plan, status, created_at from organizations order by created_at;

select 'users が参照している organization_id（氏名は出さない）' as label;
select organization_id, org, count(*) as users
from users group by organization_id, org order by org;

select 'RLS の状態（organizations にポリシーが無ければ 0 行）' as label;
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'organizations';

select 'organizations の RLS 有効/無効' as label;
select relname, relrowsecurity from pg_class where relname = 'organizations';

select '参照はできるのに親行が無い users が居るか（0 行が正常）' as label;
select u.organization_id, count(*) as orphan_users
from users u left join organizations o on o.id = u.organization_id
where o.id is null group by u.organization_id;

-- ────────────────────────────────────────────────────────────
-- 2) 欠けていたときだけ補填する（何度流しても安全）
-- ────────────────────────────────────────────────────────────
-- users.organization_id が指している id で作る。**新しい id を振らない**のが要点。
-- 新規に gen_random_uuid() で作ると、既存データが指している id と一致せず孤児が残る。
--
-- asuka は意図的に入れない。asuka のユーザーも同じ organization_id を持っているため、
-- 行を足すだけでは分離されず、organization_id の振り直しが必要になる（本番データの更新なので
-- 別途承認が必要。手順は docs/handoff-input-redesign.md 2.6章）。
insert into organizations (id, org_key, name)
select u.organization_id, 'kishu', '霧珠ファーム'
from (select distinct organization_id from users where org = 'kishu') u
where not exists (select 1 from organizations o where o.id = u.organization_id)
  and not exists (select 1 from organizations o where o.org_key = 'kishu');

-- ────────────────────────────────────────────────────────────
-- 3) 補填後の確認（1 行以上あり、孤児が 0 行なら次のマイグレーションへ進める）
-- ────────────────────────────────────────────────────────────
select '補填後の organizations' as label;
select id, org_key, name from organizations order by org_key;

select '孤児ユーザー（0 行なら OK）' as label;
select count(*) as orphan_users
from users u left join organizations o on o.id = u.organization_id
where o.id is null;
