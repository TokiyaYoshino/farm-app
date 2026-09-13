-- 作業写真（report-images）を匿名で列挙できる状態を止める
--
-- ── 2026-09-13 の実測 ────────────────────────────────────────
--
-- バンドルに焼き込まれている anon キーだけで、
--   POST /storage/v1/object/list/report-images
-- が 16 件のファイル名を返した。ファイル名が分かれば
--   GET /storage/v1/object/public/report-images/<name>
-- は **鍵を一切付けずに** 200 / image/jpeg を返す（公開バケットのため）。
-- つまり「URLを知っていれば見られる」ではなく「全部まとめて取れる」状態だった。
--
-- EXIF を除去している箇所はコード上に存在しないため、スマホ撮影の写真には
-- 撮影地の GPS 座標・撮影日時・端末情報がそのまま残っている。
--
-- ── 踏んだ罠（今日3回目）───────────────────────────────────
--
-- 最初 `drop policy if exists report_images_select_public` と**名前を決め打ち**して
-- 流したが、実際のポリシー名は別（`Allow read` 系）で、落ちていなかった。
-- 新しい authenticated ポリシーを足しても、PostgreSQL は許可ポリシーを OR で繋ぐので
-- 匿名は読めたまま。**ポリシー名を決め打ちにしない。**
--
-- 同じ日に work_categories では「RLS 自体が無効でポリシーが無視されていた」、
-- 2026-09-05 には「Success 表示なのに作成されていなかった」。
-- **確認は必ず外から匿名で叩く。**

-- 匿名に開いている SELECT ポリシーを、名前に関係なく落とす。
-- 使っているバケットは report-images の1つだけ（コード全体を確認済み）。
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
       and ('public' = any(roles::text[]) or 'anon' = any(roles::text[]))
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy report_images_select_authed on storage.objects for select
  to authenticated using (bucket_id = 'report-images');

-- ── 確認（1文ずつ）──────────────────────────────────────────
--
--   select policyname, cmd, roles from pg_policies
--    where schemaname = 'storage' and tablename = 'objects';
--
-- 期待: 2行（INSERT / SELECT とも authenticated）。public / anon が1つも無いこと。
--
-- 外から:
--   curl -X POST '<URL>/storage/v1/object/list/report-images' \
--     -H 'apikey: <anon>' -H 'Authorization: Bearer <anon>' \
--     -H 'Content-Type: application/json' -d '{"prefix":"","limit":100,"offset":0}'
--   → [] が返ればOK（適用前は 16 件返っていた）
--
-- ── これは緩和であって完治ではない ──────────────────────────
--
-- バケットが `public = true` のままなので、`/object/public/` は RLS を通らない。
--   ✅ 止まる  : 一覧APIでの列挙（全件まとめて取られる経路）
--   ❌ 止まらない: 既にURLを知っている人の直接取得
--   ✅ 壊れない : アプリ・Webの写真表示（同じ /object/public/ を使っている）
--
-- 完治は「バケットを非公開にして署名付きURLへ移行」。Web と Expo の両方を触るので、
-- worker の実地テストのあとに回す。あわせて **アップロード時の EXIF 除去**も要る。
