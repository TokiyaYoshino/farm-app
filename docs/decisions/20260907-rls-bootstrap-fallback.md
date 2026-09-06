# RLSの組織解決に、JWTクレームが無いときのフォールバックを持たせる

- 日付: 2026-09-07
- 状態: 採用（本番適用済み）
- 種別: 不具合修正・技術判断（RLS / 認証）

## 課題（Why）

相談機能をブラウザで検証しようとして、**本番アプリにログインしても全データが0件に見える**ことが分かった。データは消えておらず、DBには組織1件・作物7件・記録35件がある。

原因は `docs/rls-rollout.md` の手順の適用順序だった。

- 手順3（RLSポリシーの適用・SQL）は**適用済み**。`allow_all` は全テーブルから消え、`<table>_all_own_org`（`organization_id = jwt_organization_id()`）が入っている
- 手順1（Custom Access Token Hook の設定・ダッシュボード操作）は**未了**。ログインし直した直後のJWTにも `organization_id` クレームが無いことを確認した
- `jwt_organization_id()` はクレームだけを見ていたため常に NULL。全テーブルのポリシーが不一致になり、読みも書きも通らない

手順書のチェックボックスは0〜5すべて未チェックで、記録と実態が食い違っていた。SQLはファイルを流せば完結して見える一方、手順1はダッシュボードでの別作業なので、飛ばされやすい構造だった。

### 循環していた

さらに悪いことに、`users` のポリシーは2本ある。

| ポリシー | 条件 | 対象ロール |
|---|---|---|
| `users_select_login_lookup` | `true` | **`{anon}` 限定** |
| `users_select_own_org` | `organization_id = jwt_organization_id()` | `public` |

ログイン画面では anon なので前者が効き、ログインID の逆引きが通る。**ログインした瞬間にロールが `authenticated` に変わり、前者が効かなくなる。** すると自分のユーザー行すら読めず、アプリは組織IDを解決できない。

つまり「組織IDを知るには `users` を読む必要があるが、`users` を読むには組織IDが要る」という循環で、**フックがこの循環を断つ唯一の仕掛け**だった。フックが外れると誰も自分のデータを読めず、アプリ側からは復旧できない。

## 検討した代替案

- **`users_select_login_lookup` の対象ロールを `{anon, authenticated}` に広げる** → **却下**。このポリシーは `qual = true` なので、ログインした利用者が**全組織のユーザー行**（氏名・ログインID・ロール・auth_id）を読めてしまう。RLS導入の目的そのものを壊し、`docs/rls-rollout.md` 手順4の越境アクセステストで落ちるべき変更
- **ダッシュボードでフックを有効化するだけ** → 正しい対処だが、**フックが外れたときに同じ状態に戻る**という脆さが残る。安全弁にはならない
- **現状維持** → 却下。本番が実質使えない

## 決めたこと

`jwt_organization_id()` にフォールバックを持たせる（`scripts/migrations/2026-09-07-jwt-organization-id-fallback.sql`）。

```sql
select coalesce(
  nullif(auth.jwt() ->> 'organization_id', '')::uuid,
  (select u.organization_id from public.users u where u.auth_id = auth.uid() limit 1)
)
```

- **クレームがあればそれを優先する。** フックが本来の経路であることは変えない。有効化しても共存する
- 無いときだけ、認証済みユーザー自身の `users` 行から引く
- **SECURITY DEFINER が必須**。SECURITY INVOKER のままだと `users` のポリシーがこの関数を呼び、この関数が `users` を読むため無限再帰になる
- `search_path` を空にして参照はすべてスキーマ修飾する（DEFINER 関数の乗っ取り対策）

### なぜ分離が壊れないか

返すのは常に「いま認証しているユーザー自身の組織」だけで、他組織は返らない。未ログイン（anon）は `auth.uid()` が NULL なのでフォールバックも NULL になり、手順4の「JWTなしで空が返ること」は引き続き満たす。

適用後に実測して確認した。

| | 結果 |
|---|---|
| ログイン済み | users 5 / 作物 7 / 記録 35 / 相談 2 —— すべて読める |
| 未ログイン（anonキーのみ） | **0件** |

## あわせて見つかった未適用のマイグレーション

`scripts/migrations/2026-08-29-crop-advice-watch-unknowns.sql`（`crop_advice_messages` に `watch_points` / `unknowns` を追加）が**本番に未適用のまま**だった。`docs/decisions/20260829-ai-output-structure.md` にも「未適用」と書かれたまま残っていた。

アプリはこの2列に書き込むため、**2026-08-29以降、相談は一度も保存できていなかった**（回答は表示されるが「保存できませんでした」になる）。今回あわせて適用した。

## 影響範囲

- **DB / 権限**: `jwt_organization_id()` を SECURITY DEFINER 化してフォールバックを追加。ポリシー本体は未変更。`crop_advice_messages` に列2つ追加
- **既存機能**: 全機能が復旧する（変更前は全テーブル0件）
- **ストア審査 / 規制**: なし

## 残っている作業

- **Custom Access Token Hook はまだ無効**。本来の設計に戻すには Supabase ダッシュボード → Authentication → Hooks → Customize Access Token (JWT) Claims に `public.custom_access_token_hook` を指定し、ログインし直す。SQL側（関数・`supabase_auth_admin` への EXECUTE 付与）は完成済み
- `docs/rls-rollout.md` の実施記録の更新（作業中のため本 ADR では触っていない）
