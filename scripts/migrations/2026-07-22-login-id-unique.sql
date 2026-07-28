-- マルチテナント化 前提決定: login_id は org横断で一意（ログイン画面にorg選択UIは追加しない）
-- docs/adr-001-multitenancy-and-ai.md の「新たに見つかった論点」を解消するための制約追加

-- 1. 先にこのSELECTを実行し、重複がないことを確認する（0件であること）
select login_id, count(*)
from users
group by login_id
having count(*) > 1;

-- 2. 上記が0件の場合のみ実行する
alter table users
  add constraint users_login_id_unique unique (login_id);
