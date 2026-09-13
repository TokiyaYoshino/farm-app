-- テナント分離が実体として成立しているかの確認（読み取りのみ・Supabase SQL Editor）
-- 1文ずつ実行する（複数文をまとめると SQL Editor は結果を表示しない）

-- ① レガシーの org 文字列と organization_id の対応。
--    org が2種類あるのに organization_id が1つなら、RLS では分離されていない
--    （JWT のクレームが全員同じ値になるため）。
select org, organization_id, count(*) as users
  from users group by org, organization_id order by org;

-- ② 同じことをデータ側でも見る
select org, organization_id, count(*) as reports
  from reports group by org, organization_id order by org;

-- ③ organizations の行
select id, org_key, name from organizations order by created_at;
