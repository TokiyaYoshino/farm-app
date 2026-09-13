-- 匿名キーで素読みできる2表を塞ぐ（advice_threads / work_categories）
--
-- ── なぜ別ファイルなのか ──────────────────────────────────────
--
-- advice_threads は 2026-09-09 の相談タブ導入（scripts/migrations/2026-09-09-release.sql）
-- で新設された表で、そこでは意図的に allow_all で作られている。
-- docs/decisions/20260909-web-release-and-rollback.md が
-- 「advice_threads のポリシーも忘れずに作ること（新規テーブルなので allow_all で
-- 作られる）」と自分で警告していた箇所にあたる。
--
-- ── 2026-09-12 時点の実測 ────────────────────────────────────
--
-- anon キーだけで本番を叩いたところ、
--   reports / crops / crop_advice_messages → 0 件（実ポリシーが効いている）
--   users                                 → 401（列 grant で login_id/email のみ）
--   advice_threads                        → **4 行そのまま返る**
--   work_categories                       → **6 行そのまま返る**
-- だった。つまり RLS 全体は 2026-09-05 に適用済みで、**残っている穴はこの2表**。
--
-- スレッドの title は利用者が付ける主題（例:「トマトの病害虫」「今年の防除計画」）で、
-- 作物名・圃場名・農場の関心事がそのまま出る。crop_advice_messages 側（会話本文）は
-- 既に塞がっているのに、その目次が公開されている状態。
--
-- work_categories は 2026-09-05 の実施記録では「`to authenticated` 限定に確認済み」と
-- 書かれているが、2026-09-12 に匿名で実際に叩くと 6 行返る。記録と実態が食い違っている
-- ので、ポリシー名を決め打ちにせず「このテーブルの既存ポリシーを全部落としてから作る」
-- 形にしてある（2026-09-05 に「Success 表示だけでは作成されていなかった」事故があり、
-- 古い許可ポリシーが1つでも残ると OR 結合で新ポリシーが無効化されるため）。
--
-- ── 実行順序 ─────────────────────────────────────────────────
--
-- 2026-08-02-rls-policies.sql の 0) 1)（custom_access_token_hook / jwt_organization_id）
-- は 2026-09-05 に適用済みで、Auth Hook も有効。よってこのファイルは単独で流せる。
-- 手順の全体は docs/rls-rollout.md。
--
-- Supabase SQL Editor で実行する。

-- == advice_threads ==
drop policy if exists allow_all on advice_threads;
create policy advice_threads_all_own_org on advice_threads for all
  using (organization_id = public.jwt_organization_id())
  with check (organization_id = public.jwt_organization_id());

-- == work_categories ==
-- 作業区分マスタ。ログイン前には要らない表なので anon から外す。
-- **これは越境の解決ではない。** この表には organization_id 列が無く、
-- 全テナントで 6 件を共有している（docs/handoff-input-redesign.md 2.6 の越境②）。
-- 他農場を受け入れる前に、列の追加・バックフィル・クライアントの絞り込みが要る。
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'work_categories'
  loop
    execute format('drop policy %I on work_categories', p.policyname);
  end loop;
end $$;

create policy work_categories_select_authed on work_categories for select
  to authenticated using (true);

-- ── 適用後の確認（1文ずつ実行する）────────────────────────────
-- Supabase SQL Editor は複数文をまとめて流すと結果を表示しない。確認は下を
-- 1文だけ選択して実行する（docs/handoff-input-redesign.md で実際に踏んだ罠）。
--
--   select tablename, policyname, cmd, roles, qual
--     from pg_policies
--    where tablename in ('advice_threads','work_categories');
--
-- 期待:
--   advice_threads  … advice_threads_all_own_org のみ（allow_all が消えている）
--   work_categories … work_categories_select_authed のみ（roles が {authenticated}）
--
-- **「Success」表示だけでは足りない。** 2026-09-05 の適用時、users と
-- pesticide_registrations で「成功したのに作成されていない」が実際に起きており、
-- 旧 allow_all のおかげでその場のテストが偶然通っていた
-- （docs/multitenancy-progress.md「RLS実ポリシー化 実施記録」）。必ず上の select で確かめる。
--
-- ── 適用後のスモークテスト ───────────────────────────────────
-- 1. Web版をリロードし、相談タブにスレッド一覧が出ること（消えたら JWT に
--    organization_id が入っていない＝ログアウト→ログインし直す）
-- 2. anon キーで外から叩いて空が返ること:
--      curl '<SUPABASE_URL>/rest/v1/advice_threads?select=id&limit=3'  -H 'apikey: <anon>'
--      curl '<SUPABASE_URL>/rest/v1/work_categories?select=id&limit=3' -H 'apikey: <anon>'
--    → どちらも [] が返ればOK（適用前は 4 行 / 6 行返っていた）
-- 3. ログイン後に作業記録の「作業の種類」がマスタ名で出ること
--    （work_categories が読めなくなると、ここが WORK_TEMPLATES の既定値に落ちる）
--
-- 切り戻し（ログイン中の全員からスレッドが見えなくなった場合のみ）:
--   drop policy if exists advice_threads_all_own_org on advice_threads;
--   create policy allow_all on advice_threads for all using (true) with check (true);
