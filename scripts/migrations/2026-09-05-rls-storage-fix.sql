-- Storage (report-images) の RLS 修正
--
-- ── なぜ別ファイルなのか ──────────────────────────────────────
--
-- 本体 scripts/migrations/2026-08-02-rls-policies.sql の 3) ブロックは、読み取りを
-- こう定義している:
--
--   create policy report_images_select_public on storage.objects for select
--     using (bucket_id = 'report-images');
--
-- Postgres のポリシーは TO 句を省略すると PUBLIC（= anon を含む全ロール）が対象に
-- なる。つまり anon キーだけで storage.objects を SELECT でき、
-- **バケット内の全ファイル名を列挙できる**。
--
-- 本体のコメントは「画像URLは推測困難なランダムパス」を根拠にしているが、
-- パスは `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg` で、
-- しかも全ファイルがバケット直下（組織ごとのプレフィックスなし）。
-- 一覧が取れる相手にランダム性は意味がない。
--
-- 結果、本体を流しきっても「他組織の作業写真・病害虫写真を列挙して全部
-- ダウンロードできる」状態が残る。記録テキストは守られるのに写真だけ素通り。
-- 経緯: docs/pre-release-audit.md の 3
--
-- ── なぜ select ポリシーを作らないのか ────────────────────────
--
-- アプリは Storage API のうち upload() と getPublicUrl() しか使っていない
-- （src/App.tsx / expo-prototype/lib/store.tsx / expo-prototype/screens/AiSheets.tsx。
--  list() / remove() / download() の呼び出しは全リポジトリでゼロ）。
--
-- getPublicUrl() はURL文字列を組み立てるだけのクライアント処理で通信しない。
-- 画像の実際の配信は public バケットの /storage/v1/object/public/... で行われ、
-- ここは RLS を通らない。**つまり select ポリシーはアプリの動作に一切使われていない。**
--
-- 使われていないものを残す理由はないので落とす。これで anon も、他組織の
-- 認証ユーザーも、storage.objects を列挙できなくなる。画像の表示は変わらない。
--
-- ── 残る制約（承知のうえで launch する）──────────────────────
--
-- public バケットのままなので、**URLを知っている人はログインなしで画像を読める**。
-- URLは reports.image_url に入っており、その表は本体のRLSで組織スコープになるため
-- 通常は他組織に渡らない。ただし公開URLは期限が無く、一度漏れると失効させられない。
--
-- 完全に塞ぐには private バケット + 署名URL + 組織プレフィックスのパスへの移行が要る。
-- 既存ファイルの移行とクライアント3箇所の改修を伴うので今回は分ける。
-- **2組織目を迎える前に実施すること**（現状は実質1組織なので緊急度は低い）。
--
-- ── 実行タイミング ───────────────────────────────────────────
--
-- 本体の 3) ブロックの代わりにこれを実行する（本体の 3) は実行しない）。
-- 既に本体の 3) を流してしまった場合も、これを流せば上書きされる。
-- 手順の全体は docs/rls-rollout.md。
--
-- Supabase SQL Editor で実行する。

-- 旧ポリシーを落とす。"allow all" は本体でも落としている同じもの
drop policy if exists "allow all" on storage.objects;
drop policy if exists report_images_select_public on storage.objects;
drop policy if exists report_images_select_authed on storage.objects;

-- アップロードは認証ユーザーのみ（本体と同じ。冪等にするため再作成する）
drop policy if exists report_images_insert_authed on storage.objects;
create policy report_images_insert_authed on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-images');

-- select ポリシーは意図的に作らない（上の理由）。
--
-- 万一これで画像のアップロードが失敗するようなら（クライアントが内部で
-- objects を参照している場合。現時点の supabase-js では確認されていない）、
-- 下を実行して「自分がアップロードした行だけ見える」状態にする。
-- 列挙は自分のファイルに限られるので、他組織への漏れは起きない。
--
--   create policy report_images_select_own_upload on storage.objects for select
--     to authenticated
--     using (bucket_id = 'report-images' and owner = auth.uid());

-- ── 適用後の確認（1文ずつ実行する）────────────────────────────
-- Supabase SQL Editor は複数文をまとめて流すと結果を表示しない。
--
--   select policyname, cmd, roles
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects';
--
-- 期待: report_images_insert_authed（insert / {authenticated}）だけが残り、
--       select のポリシーが1つも無いこと。
--
-- そのうえで scripts/verify-rls.sh を実行し、STORAGE の項目が PASS することと、
-- Web版・アプリで作業記録の写真が今までどおり表示されることを確認する。
