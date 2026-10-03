-- asuka（飛鳥ワイン）を kishu から別の組織に分離する【本番データ更新・オーナー承認が必要】
--
-- 経緯: docs/decisions/20261001-account-model-self-signup.md の B1
--   本番で kishu と asuka が同じ organization_id に同居している。RLS は organization_id で
--   判定するため、どちらの利用者も API を直接叩けば互いのデータが読める。
--   原因は 2026-07-22-organization-id-columns.sql が全行を kishu の id で一律バックフィルしたこと。
--
-- 状態: **未実行**。ローカルに Postgres サーバーが無く試し流しもしていない。
--   本番で流す前に、必ず下の 0) 〜 2) を順に実行して数字を確認すること。
--
-- 実行方法: Supabase SQL Editor。0)・2)・3) は 1 文ずつ、1) の do ブロックは全体を 1 回で実行する。
--   do ブロックは 1 つの文なので全体が 1 トランザクション。途中で例外になれば何も変わらない。
--
-- 手順:
--   A. scripts/backup-db.sh を実行してダンプを取る（ファイル名は pre-rls_… になる。日付で区別する）
--   B. 0) の読み取りクエリを流し、件数を控える → オーナーに見せて承認をもらう
--   C. 1) の do ブロックを実行（不整合があれば exception で止まる）
--   D. 3) の確認クエリを流す
--   E. asuka の利用者に**ログインし直してもらう**（下の「JWT」参照）
--   F. docs/multitenancy-progress.md の「越境テスト」を実施する
--
-- JWT について（重要）:
--   組織IDは JWT のクレーム organization_id に入っていて、custom_access_token_hook が
--   「トークンを発行するとき」に users.organization_id から読む。このSQLを流した後も、
--   asuka の利用者が持っている既存トークン（最長1時間）は古い id（kishu）のまま。
--   その間 asuka の利用者は kishu のデータを読めてしまい、自分のデータは読めない。
--   → 流した直後に asuka の利用者へ「一度ログアウトしてログインし直す」よう伝える。
--
-- デプロイ順序: このSQL → クライアント修正（org 文字列 → organization_id）。逆にしないこと。
--   移行前に新クライアントを出すと、同居中の組織の行が画面にまじって出る。
--   旧クライアントは org 文字列で絞るので、このSQLの後でも問題なく動く。

-- ────────────────────────────────────────────────────────────
-- 0) 事前確認（読み取りのみ。ここで出た数字を控える）
-- ────────────────────────────────────────────────────────────

-- 0-0) 1) が使う列が本番に全部あるか。**0 行が正常**（出た行が「無い列」）
--      2026-10-03 に crop_advice_actions.created_by が無いと判明したため追加（docs/db-schema.md の誤記）
with need(t, c) as (values
  ('users','org'),('users','organization_id'),
  ('crops','org'),('crops','organization_id'),('fields','org'),('fields','organization_id'),
  ('reports','org'),('reports','organization_id'),('reports','user_id'),('reports','crop_id'),('reports','pesticide_id'),
  ('pesticides','org'),('pesticides','organization_id'),('settings','org'),('settings','organization_id'),
  ('projects','org'),('projects','organization_id'),('projects','crop_id'),
  ('tickets','org'),('tickets','organization_id'),('tickets','project_id'),
  ('schedules','organization_id'),('schedules','user_id'),('schedules','assigned_user_id'),
  ('comments','organization_id'),('comments','user_id'),('comments','target_type'),('comments','target_id'),
  ('ai_outputs','organization_id'),('ai_outputs','created_by'),
  ('crop_advice_messages','organization_id'),('crop_advice_messages','created_by'),('crop_advice_messages','crop_id'),
  ('crop_advice_actions','organization_id'),('crop_advice_actions','message_id'),
  ('advice_threads','organization_id'),('advice_threads','created_by'),('advice_threads','crop_id'),
  ('device_tokens','organization_id'),('device_tokens','user_id'),
  ('pesticide_registrations','organization_id'),('pesticide_registrations','pesticide_id'),
  ('daily_weather','organization_id'),
  ('organizations','org_key'),('organizations','name'))
select need.t, need.c from need
left join information_schema.columns ic
  on ic.table_schema = 'public' and ic.table_name = need.t and ic.column_name = need.c
where ic.column_name is null;

-- 0-1) org と organization_id の対応。asuka が1種類の organization_id（kishu と同じ）なら想定どおり
select org, organization_id, count(*) as users
from users group by org, organization_id order by org;

-- 0-2) organizations の行。asuka の行がまだ無いことを確認する
select id, org_key, name, created_at from organizations order by created_at;

-- 0-3) 移す行数の見込み（テーブルごと）。ここの数字が 1) 実行後の 3-2) と一致するはず
with a as (select id from users where org = 'asuka')
select 'users' as t, count(*) as n from users where org = 'asuka'
union all select 'crops',      count(*) from crops      where org = 'asuka'
union all select 'fields',     count(*) from fields     where org = 'asuka'
union all select 'reports',    count(*) from reports    where org = 'asuka'
union all select 'pesticides', count(*) from pesticides where org = 'asuka'
union all select 'settings',   count(*) from settings   where org = 'asuka'
union all select 'projects',   count(*) from projects   where org = 'asuka'
union all select 'tickets',    count(*) from tickets    where org = 'asuka'
union all select 'schedules (user_id が asuka)', count(*) from schedules where user_id in (select id from a)
union all select 'comments (user_id が asuka)',  count(*) from comments  where user_id in (select id from a)
union all select 'ai_outputs (created_by が asuka)',            count(*) from ai_outputs            where created_by in (select id from a)
union all select 'crop_advice_messages (created_by が asuka)',  count(*) from crop_advice_messages  where created_by in (select id from a)
-- crop_advice_actions には created_by が無い（2026-10-03 に本番で判明）。元の発言（message_id）の持ち主で決める
union all select 'crop_advice_actions (元の発言が asuka)',      count(*) from crop_advice_actions
  where message_id in (select id from crop_advice_messages where created_by in (select id from a))
union all select 'advice_threads (created_by が asuka)',        count(*) from advice_threads        where created_by in (select id from a)
union all select 'device_tokens (user_id が asuka)',            count(*) from device_tokens         where user_id in (select id from a)
union all select 'pesticide_registrations (asuka の農薬)',      count(*) from pesticide_registrations
  where pesticide_id in (select id from pesticides where org = 'asuka');

-- 0-4) 持ち主を特定できず kishu に残る行（created_by が null）。0 でなくても止まらないが、控える
select 'ai_outputs' as t, count(*) as created_by_null from ai_outputs where created_by is null
union all select 'crop_advice_messages', count(*) from crop_advice_messages where created_by is null
union all select 'advice_threads',       count(*) from advice_threads       where created_by is null;

-- 0-5) daily_weather は持ち主を特定する列が無く kishu に残す（天気は組織の座標から再取得される）。件数だけ控える
select count(*) as daily_weather_rows from daily_weather;

-- ────────────────────────────────────────────────────────────
-- 1) 本体（do ブロック全体を1回で実行。途中で例外になれば何も変わらない）
-- ────────────────────────────────────────────────────────────
do $$
declare
  v_old_id   uuid;
  v_new_id   uuid;
  v_asuka    bigint[];
  v_pest     uuid[];    -- pesticides.id は uuid（2026-10-03 に本番で確認。bigint[] で一度失敗した）
  v_bad      bigint;
begin
  -- asuka の利用者
  select array_agg(id) into v_asuka from users where org = 'asuka';
  if v_asuka is null then
    raise exception 'org = asuka の利用者が居ない。想定と違うので中止';
  end if;

  -- 現在の organization_id は1種類だけのはず
  if (select count(distinct organization_id) from users where org = 'asuka') <> 1 then
    raise exception 'asuka の利用者の organization_id が1種類ではない。想定と違うので中止';
  end if;
  select distinct organization_id into v_old_id from users where org = 'asuka';

  -- 新しい組織。既にあれば再利用する（再実行しても壊れない）。id はここで新規に振る
  select id into v_new_id from organizations where org_key = 'asuka';
  if v_new_id is null then
    insert into organizations (org_key, name) values ('asuka', '飛鳥ワイン')  -- 表示名は後から変えてよい
    returning id into v_new_id;
  end if;

  if v_new_id = v_old_id then
    -- 既に分離済み。何もしない（2回目以降）
    return;
  end if;

  -- 移す前の安全確認: asuka の行が kishu の行を参照していないか（参照していたら付け替えで壊れる）
  select count(*) into v_bad from reports r join users u on u.id = r.user_id
   where r.org = 'asuka' and u.org <> 'asuka';
  if v_bad > 0 then raise exception 'asuka の reports が他組織の users を参照している (% 件)', v_bad; end if;

  select count(*) into v_bad from reports r join crops c on c.id = r.crop_id
   where r.org = 'asuka' and c.org <> 'asuka';
  if v_bad > 0 then raise exception 'asuka の reports が他組織の crops を参照している (% 件)', v_bad; end if;

  select count(*) into v_bad from reports r join pesticides p on p.id = r.pesticide_id
   where r.org = 'asuka' and p.org <> 'asuka';
  if v_bad > 0 then raise exception 'asuka の reports が他組織の pesticides を参照している (% 件)', v_bad; end if;

  select count(*) into v_bad from projects pr join crops c on c.id = pr.crop_id
   where pr.org = 'asuka' and c.org <> 'asuka';
  if v_bad > 0 then raise exception 'asuka の projects が他組織の crops を参照している (% 件)', v_bad; end if;

  select count(*) into v_bad from tickets t join projects pr on pr.id = t.project_id
   where t.org = 'asuka' and pr.org <> 'asuka';
  if v_bad > 0 then raise exception 'asuka の tickets が他組織の projects を参照している (% 件)', v_bad; end if;

  -- schedules: user_id と assigned_user_id が別組織にまたがる行があると持ち主を決められない
  select count(*) into v_bad from schedules s
   where s.assigned_user_id is not null
     and (s.user_id = any(v_asuka)) <> (s.assigned_user_id = any(v_asuka));
  if v_bad > 0 then raise exception 'schedules に組織をまたぐ割り当てがある (% 件)。手で判断が必要', v_bad; end if;

  -- 付け替え（org 列を持つ8テーブル）
  update users      set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update crops      set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update fields     set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update reports    set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update pesticides set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update settings   set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update projects   set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;
  update tickets    set organization_id = v_new_id where org = 'asuka' and organization_id = v_old_id;

  select array_agg(id) into v_pest from pesticides where org = 'asuka';

  -- 付け替え（org 列を持たないテーブル。利用者・農薬を手がかりに特定する）
  update schedules               set organization_id = v_new_id where organization_id = v_old_id and user_id    = any(v_asuka);
  update comments                set organization_id = v_new_id where organization_id = v_old_id and user_id    = any(v_asuka);
  update ai_outputs              set organization_id = v_new_id where organization_id = v_old_id and created_by = any(v_asuka);
  update crop_advice_messages    set organization_id = v_new_id where organization_id = v_old_id and created_by = any(v_asuka);
  -- created_by 列が無いので、直前で移した元の発言（message_id）に合わせる
  update crop_advice_actions     set organization_id = v_new_id where organization_id = v_old_id
    and message_id in (select id from crop_advice_messages where organization_id = v_new_id);
  update advice_threads          set organization_id = v_new_id where organization_id = v_old_id and created_by = any(v_asuka);
  update device_tokens           set organization_id = v_new_id where organization_id = v_old_id and user_id    = any(v_asuka);
  if v_pest is not null then
    update pesticide_registrations set organization_id = v_new_id where organization_id = v_old_id and pesticide_id = any(v_pest);
  end if;

  -- 付け替え後の安全確認: 組織をまたぐ参照が残っていないか（残っていれば全体を巻き戻す）
  select count(*) into v_bad from comments c join reports r on c.target_type = 'report' and c.target_id::text = r.id::text
   where c.organization_id <> r.organization_id;
  if v_bad > 0 then raise exception 'comments が別組織の reports を指している (% 件)。巻き戻す', v_bad; end if;

  select count(*) into v_bad from comments c join schedules s on c.target_type = 'schedule' and c.target_id::text = s.id::text
   where c.organization_id <> s.organization_id;
  if v_bad > 0 then raise exception 'comments が別組織の schedules を指している (% 件)。巻き戻す', v_bad; end if;

  select count(*) into v_bad from crop_advice_messages m join crops c on c.id = m.crop_id
   where m.organization_id <> c.organization_id;
  if v_bad > 0 then raise exception 'crop_advice_messages が別組織の crops を指している (% 件)。巻き戻す', v_bad; end if;

  select count(*) into v_bad from advice_threads t join crops c on c.id = t.crop_id
   where t.organization_id <> c.organization_id;
  if v_bad > 0 then raise exception 'advice_threads が別組織の crops を指している (% 件)。巻き戻す', v_bad; end if;

  select count(*) into v_bad from crop_advice_actions a join crop_advice_messages m on m.id = a.message_id
   where a.organization_id <> m.organization_id;
  if v_bad > 0 then raise exception 'crop_advice_actions が別組織の発言を指している (% 件)。巻き戻す', v_bad; end if;

  select count(*) into v_bad from reports r join users u on u.id = r.user_id
   where r.organization_id <> u.organization_id;
  if v_bad > 0 then raise exception 'reports が別組織の users を指している (% 件)。巻き戻す', v_bad; end if;

  -- 最後に: asuka の利用者が新しい組織だけに居ること
  if exists (select 1 from users where org = 'asuka' and organization_id <> v_new_id) then
    raise exception 'asuka の利用者の付け替えが完了していない。巻き戻す';
  end if;
  if exists (select 1 from users where org <> 'asuka' and organization_id = v_new_id) then
    raise exception '新しい組織に asuka 以外の利用者が居る。巻き戻す';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 2) （実行後すぐ）organizations の確認
-- ────────────────────────────────────────────────────────────
select id, org_key, name, created_at from organizations order by created_at;

-- ────────────────────────────────────────────────────────────
-- 3) 実行後の確認（読み取りのみ）
-- ────────────────────────────────────────────────────────────

-- 3-1) org ごとに organization_id が別々になっていること（2行・別々の id）
select org, organization_id, count(*) as users
from users group by org, organization_id order by org;

-- 3-2) 0-3) の数字と一致すること。ここでは「新しい組織に移った行数」を出す
select 'users' as t, count(*) as n from users where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'crops',      count(*) from crops      where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'fields',     count(*) from fields     where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'reports',    count(*) from reports    where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'pesticides', count(*) from pesticides where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'settings',   count(*) from settings   where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'projects',   count(*) from projects   where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'tickets',    count(*) from tickets    where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'schedules',  count(*) from schedules  where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'comments',   count(*) from comments   where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'ai_outputs', count(*) from ai_outputs where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'crop_advice_messages', count(*) from crop_advice_messages where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'crop_advice_actions',  count(*) from crop_advice_actions  where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'advice_threads',       count(*) from advice_threads       where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'device_tokens',        count(*) from device_tokens        where organization_id = (select id from organizations where org_key = 'asuka')
union all select 'pesticide_registrations', count(*) from pesticide_registrations where organization_id = (select id from organizations where org_key = 'asuka');

-- 3-3) org 列を持つテーブルで、org と organization_id の食い違いが無いこと（全部 0 行が正常）
select 'users' as t, org, count(*) from users where (org = 'asuka') <> (organization_id = (select id from organizations where org_key = 'asuka')) group by org
union all select 'crops',   org, count(*) from crops   where (org = 'asuka') <> (organization_id = (select id from organizations where org_key = 'asuka')) group by org
union all select 'fields',  org, count(*) from fields  where (org = 'asuka') <> (organization_id = (select id from organizations where org_key = 'asuka')) group by org
union all select 'reports', org, count(*) from reports where (org = 'asuka') <> (organization_id = (select id from organizations where org_key = 'asuka')) group by org;

-- ────────────────────────────────────────────────────────────
-- 4) 戻す版（commit 後に問題が見つかったときだけ。普段は実行しない）
--    asuka の行を元の kishu の organization_id に戻す。asuka の organizations 行は残す
--    （消すのは、戻したあとで参照が0件であることを確認してから別途）。
--    戻した場合も JWT は発行し直しが必要（asuka の利用者に再ログインを依頼）。
-- ────────────────────────────────────────────────────────────
-- do $$
-- declare
--   v_kishu uuid := (select id from organizations where org_key = 'kishu');
--   v_new   uuid := (select id from organizations where org_key = 'asuka');
-- begin
--   if v_kishu is null or v_new is null then raise exception 'organizations の行が見つからない'; end if;
--   update users      set organization_id = v_kishu where org = 'asuka';
--   update crops      set organization_id = v_kishu where org = 'asuka';
--   update fields     set organization_id = v_kishu where org = 'asuka';
--   update reports    set organization_id = v_kishu where org = 'asuka';
--   update pesticides set organization_id = v_kishu where org = 'asuka';
--   update settings   set organization_id = v_kishu where org = 'asuka';
--   update projects   set organization_id = v_kishu where org = 'asuka';
--   update tickets    set organization_id = v_kishu where org = 'asuka';
--   update schedules               set organization_id = v_kishu where organization_id = v_new;
--   update comments                set organization_id = v_kishu where organization_id = v_new;
--   update ai_outputs              set organization_id = v_kishu where organization_id = v_new;
--   update crop_advice_messages    set organization_id = v_kishu where organization_id = v_new;
--   update crop_advice_actions     set organization_id = v_kishu where organization_id = v_new;
--   update advice_threads          set organization_id = v_kishu where organization_id = v_new;
--   update device_tokens           set organization_id = v_kishu where organization_id = v_new;
--   update pesticide_registrations set organization_id = v_kishu where organization_id = v_new;
-- end $$;
