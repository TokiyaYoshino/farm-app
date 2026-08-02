# RLS実ポリシー化の適用手順（App Store申請前の必須作業）

対象SQL: `scripts/migrations/2026-08-02-rls-policies.sql`
背景: `docs/multitenancy-progress.md` の残作業。現在は全テーブル `allow_all` のため、
anonキーを知っていれば他組織のデータを直接読み書きできる状態。公開前に必ず塞ぐ。

## 全体の流れ（所要 30〜60分）

```
0. 事前準備（バックアップ・メンテ告知）
1. Custom Access Token Hook の設定    ← ダッシュボード操作
2. 全員ログインし直し（新JWT取得）
3. RLSポリシーをテーブル1つずつ適用    ← SQL Editor
4. 越境アクセステスト
5. アプリ/Web両方の動作確認
```

## 0. 事前準備

- [ ] Supabaseダッシュボード > Database > Backups で直近バックアップがあることを確認
- [ ] 作業中はWeb/アプリの利用を避けるよう関係者に伝える（吉野さん1人なら不要）

## 1. Custom Access Token Hook の設定

1. SQL Editor で `2026-08-02-rls-policies.sql` の **0) のブロックだけ**実行
   （`custom_access_token_hook` 関数の作成と grant）
2. ダッシュボード > **Authentication > Hooks** を開く
3. 「Customize Access Token (JWT) Claims hook」で **Postgres Function** を選び、
   `public.custom_access_token_hook` を指定して **Enable**
4. **1) のブロック**（`jwt_organization_id()` ヘルパー）も実行

## 2. 新JWTの取得（重要）

Hookは**新しく発行されるトークンにしか効かない**。既存セッションのJWTには
organization_id が入っていないため、この時点でRLSを適用すると全データが見えなくなる。

- [ ] Web版でログアウト → ログインし直す
- [ ] アプリでログアウト → ログインし直す
- [ ] 確認: SQL Editor で自分のJWTを検査するには、Web版のDevToolsで
      `localStorage` の `sb-*-auth-token` 内 `access_token` を https://jwt.io に貼り、
      ペイロードに `"organization_id": "..."` があること

## 3. RLSポリシーの段階適用

SQL Editor で **2) をテーブル1ブロックずつ**実行する。順番の推奨:

1. `crops`（影響が小さい）→ Web/アプリで作物一覧が見えることを確認
2. `fields` → `pesticides` → `reports` → `schedules` → `comments`
3. `settings` → `projects` → `tickets` → `ai_outputs` → `daily_weather`
4. `work_categories` → `pesticides_master` → `pesticide_registrations` → `organizations`
5. **最後に `users`**（ログイン画面の login_id→email 解決が匿名selectに依存するため、
   列制限grantを含むブロックを一気に実行し、直後にログインできることを必ず確認）
6. Storage の 3) ブロック

各ブロック実行後のスモークテスト: Web版をリロードして該当データが表示されること。
表示されなくなったら、そのテーブルの新ポリシーを `drop policy` して切り戻し、
JWTに organization_id が入っているか（手順2）を再確認する。

## 4. 越境アクセステスト

`docs/multitenancy-progress.md` の「手動テストチェックリスト」を実施。
最低限やるべきもの:

- [ ] テスト用2組織目 + テストユーザーを作成
- [ ] org2ユーザーでログインし、org1（霧珠ファーム）のデータが一切見えないこと
- [ ] curl で anonキー + org2のJWT を使い、org1のレコードIDを直接指定した
      select/update が空振り・失敗すること:
      ```
      curl 'https://<project>.supabase.co/rest/v1/reports?id=eq.<org1のid>' \
        -H "apikey: <anon>" -H "Authorization: Bearer <org2のaccess_token>"
      → [] が返ればOK
      ```
- [ ] **JWTなし（anonのみ）**で reports 等を叩いて空が返ること:
      ```
      curl 'https://<project>.supabase.co/rest/v1/reports' -H "apikey: <anon>"
      → [] が返ればOK（現状はここで全データが返ってしまう）
      ```

## 5. 既知の注意点

- **api/*.ts（Vercel）**: サーバーレス関数がSupabaseを触る箇所（set-user-auth等）は
  service_role キーを使っていればRLSの影響を受けない。anonキーを使っている箇所が
  あれば要修正（現状 set-user-auth は service_role 使用）
- **ユーザー招待**: 新規ユーザー作成は set-user-auth 経由（service_role）のため影響なし
- **アプリ（Expo）**: lib/supabase.ts は anon キー+ユーザーJWT。手順2のログインし直しで対応
- **daily_weather の upsert**: 分析タブのWeb側同期処理が authenticated ユーザーの
  JWT で upsert する。organization_id を必ず付けてinsertしているので実ポリシーで通る

## 完了後

- [ ] `docs/multitenancy-progress.md` の残作業からRLS項目を消し込み、完了日を記録
- [ ] この手順書に実施日と結果を追記
- [ ] 次: App Store申請準備（Apple Developer登録 → EAS Build → プッシュ通知 → TestFlight）

## 実施記録

（実施後に追記）
