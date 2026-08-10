-- organizations の状態確認（1文だけ・読み取り専用）。
--
-- なぜ別ファイルにしたか:
--   Supabase SQL Editor は**複数文をまとめて流すと結果を表示せず**
--   「Success. No rows returned」しか出さない。そのため
--   2026-08-10-organizations-check.sql の確認結果が読めない。
--   確認を1文の select にまとめれば必ず表示される。
--
-- 期待値: kishu_rows >= 1 かつ orphan_users = 0 なら
--         2026-08-10-crop-advisor.sql に進んでよい。
--
-- orphan_users = organization_id が入っているのに、その行が organizations に無いユーザー数。
--   crop_advice_messages は organization_id が organizations(id) を参照するので、
--   ここが 0 でないと相談の保存が FK 違反で必ず落ちる。
--
-- 氏名・login_id は取得しない（件数のみ）。

select
  (select count(*) from organizations)                        as orgs_total,
  (select count(*) from organizations where org_key = 'kishu') as kishu_rows,
  (select count(*) from organizations where org_key = 'asuka') as asuka_rows,
  (select count(*)
     from users u
     left join organizations o on o.id = u.organization_id
    where o.id is null)                                       as orphan_users;
