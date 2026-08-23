-- 農業エージェント（作物ごとの相談スレッド）2表の RLS 実ポリシー化
--
-- ── なぜ別ファイルなのか ──────────────────────────────────────
--
-- 本体は scripts/migrations/2026-08-02-rls-policies.sql だが、それが書かれた
-- 2026-08-02 の時点では crop_advice_messages / crop_advice_actions がまだ存在
-- しなかった（2026-08-10 の 2026-08-10-crop-advisor.sql で作成）。
-- そのため本体を流しても**この2表だけ allow_all のまま残る**。
--
-- この2表には相談のやりとりが丸ごと入る。事業戦略上これは差別化の中核
-- （docs/spec-crop-advice-agent.md）であり、他組織から読めてはならない。
--
-- なお device_tokens は 2026-08-04-device-tokens.sql が自前で組織スコープの
-- ポリシーを持っているため、ここでの対応は不要（確認済み）。
--
-- ── 実行順序 ─────────────────────────────────────────────────
--
-- 2026-08-02-rls-policies.sql の 0) と 1)（custom_access_token_hook と
-- jwt_organization_id）を先に流し、Auth Hook を有効化し、全員がログインし直して
-- JWT に organization_id が入った状態にしてから流すこと。
-- 順序を誤ると、この2表のデータが誰からも見えなくなる。
-- 手順の全体は docs/rls-rollout.md。
--
-- Supabase SQL Editor で実行する。

-- == crop_advice_messages ==
drop policy if exists allow_all on crop_advice_messages;
create policy crop_advice_messages_all_own_org on crop_advice_messages for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == crop_advice_actions ==
drop policy if exists allow_all on crop_advice_actions;
create policy crop_advice_actions_all_own_org on crop_advice_actions for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- ── 適用後の確認（1文ずつ実行する）────────────────────────────
-- Supabase SQL Editor は複数文をまとめて流すと結果を表示しないため、
-- 確認したいときは下を1文だけ選択して実行する
-- （docs/handoff-input-redesign.md で実際に踏んだ罠）。
--
--   select tablename, policyname, cmd
--     from pg_policies
--    where tablename in ('crop_advice_messages','crop_advice_actions');
--
-- 期待: allow_all が消え、*_all_own_org だけが残っていること。
