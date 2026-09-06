-- jwt_organization_id() に「JWTにクレームが無いとき」のフォールバックを足す。
--
-- なぜ要るか（2026-09-07 に本番で起きていた事象）:
--   RLSの実ポリシー（手順3）が先に適用され、Custom Access Token Hook の設定（手順1）が
--   未了だった。ポリシーはすべて `organization_id = jwt_organization_id()` で、この関数は
--   JWTの organization_id クレームだけを見ていたため、クレームが無い＝常に NULL となり、
--   **ログイン後に全テーブルが0件**になっていた（docs/rls-rollout.md 参照）。
--
--   しかも users のポリシーは
--     users_select_login_lookup … qual=true だが **対象ロールが {anon} 限定**
--     users_select_own_org      … organization_id = jwt_organization_id()
--   の2本で、ログインしてロールが authenticated になった瞬間に前者が効かなくなる。
--   結果「組織IDを知るには users を読む／users を読むには組織IDが要る」という循環になり、
--   アプリ側からは復旧できない状態だった。フックがこの循環を断つ唯一の仕掛けなので、
--   フックが外れると誰も自分のデータを読めなくなる。
--
-- 何をするか:
--   クレームがあればそれを使う（従来どおり・フックが本来の経路）。無いときだけ、
--   認証済みユーザー自身の users 行から organization_id を引く。
--
-- 安全性:
--   - 返すのは常に「いま認証しているユーザー自身の組織」だけ。他組織は見えないので
--     テナント分離は変わらない
--   - 未ログイン（anon）は auth.uid() が NULL → フォールバックも NULL → 0件のまま。
--     docs/rls-rollout.md 手順4の「JWTなしで空が返ること」は引き続き満たす
--   - **SECURITY DEFINER が必須**。SECURITY INVOKER のままだと、users のポリシーが
--     この関数を呼び、この関数が users を読むため無限再帰になる
--   - search_path を空にして、参照はすべてスキーマ修飾する（DEFINER 関数の乗っ取り対策）
--
-- フックを有効化したら:
--   クレームが優先されるので、この関数はそのままでよい。フォールバックは
--   「フックが外れたときに詰まないための安全弁」として残す。
--
-- Supabase SQL Editor で実行する。

create or replace function public.jwt_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'organization_id', '')::uuid,
    (select u.organization_id from public.users u where u.auth_id = auth.uid() limit 1)
  )
$$;

comment on function public.jwt_organization_id() is
  'RLSポリシー用。JWTのorganization_idクレームを優先し、無ければ認証済みユーザー自身のusers行から引く（2026-09-07にフォールバックを追加）。SECURITY DEFINER なのはusersのポリシーとの無限再帰を避けるため';
