# RLS実ポリシー化の適用手順（App Store申請前の必須作業）

対象SQL: `scripts/migrations/2026-08-02-rls-policies.sql`
**＋ `scripts/migrations/2026-08-23-rls-crop-advice.sql`（本体に含まれない2表。手順3-5で実行）**
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
   - このタイミングで `scripts/migrations/2026-08-04-device-tokens.sql`（プッシュ通知の
     端末トークン表）も実行してよい。`jwt_organization_id()` に依存するため手順1より後に行う
5. **`scripts/migrations/2026-08-23-rls-crop-advice.sql` を実行する（別ファイル・実行必須）**
   - 農業エージェントの `crop_advice_messages` / `crop_advice_actions` の2表。
     本体（`2026-08-02-rls-policies.sql`）が書かれた時点でこの2表はまだ存在せず
     （作成は 2026-08-10）、**本体を全部流してもこの2表だけ `allow_all` のまま残る**
   - 相談のやりとりが丸ごと入る表で、事業戦略上の差別化の中核（`docs/spec-crop-advice-agent.md`）。
     ここを取りこぼすと「他組織の相談内容が読める」状態が残る
   - スモークテスト: アプリで作物の相談スレッドを開き、過去のやりとりが表示されること
6. **最後に `users`**（ログイン画面の login_id→email 解決が匿名selectに依存するため、
   列制限grantを含むブロックを一気に実行し、直後にログインできることを必ず確認）
7. Storage の 3) ブロック
   - **⚠ このブロックだけでは画像が守れない（2026-09-05 の監査で判明）。**
     `report_images_select_public` は `TO` 句が無いため anon を含む全ロールが対象になり、
     `storage.objects` を匿名で列挙できる。「ランダムパスだから推測困難」という前提は
     一覧が取れる相手には成立せず、**他組織の作業写真を全件ダウンロードできる状態が残る**
   - 対応方針（select を `to authenticated` に変更＋バケットを private 化＋
     `getPublicUrl` → `createSignedUrl` への差し替え。片方だけ入れると既存写真が全滅する）は
     `docs/pre-release-audit.md` の 3 に記載。**RLS 適用と同じ機会にやるのが最も安い**

各ブロック実行後のスモークテスト: Web版をリロードして該当データが表示されること。

### 切り戻しの判断基準（迷わないように先に決めておく）

| 症状 | 原因の見当 | 対処 |
|---|---|---|
| そのテーブルのデータが**全部消えて見える** | JWT に `organization_id` が無い（手順2の未実施・古いセッション） | まずログアウト→ログイン。直らなければ下記の `drop policy` で切り戻す |
| **一部だけ**見えない | その行の `organization_id` が NULL か別組織 | ポリシーは正しい。データ側を SQL で確認する（切り戻さない） |
| ログインできなくなった | `users` のブロック（手順6） | 即座に切り戻す。ログイン不能は全機能停止 |

切り戻しは対象テーブルごとに1文:

```sql
drop policy if exists <新ポリシー名> on <テーブル名>;
create policy allow_all on <テーブル名> for all using (true) with check (true);
```

**1テーブルずつ実行し、そのつど画面を確認すること。** まとめて流すと、どのテーブルで
壊れたのか切り分けられなくなる（Supabase SQL Editor は複数文をまとめると結果を表示しない）。

### 実行前の確認（2026-08-23 時点の実測）

- JWT に `organization_id` クレームは**まだ入っていない**（ブラウザのセッションを実測して確認済み）。
  したがって**手順1（Auth Hook）は未実施**であり、ここから始める必要がある
- `device_tokens` は `2026-08-04-device-tokens.sql` が自前で組織スコープのポリシーを
  持っているため、本体側での追加対応は不要（確認済み）

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
- [ ] 次: App Store申請 → `docs/app-store-submission.md`
      （プッシュ通知・EAS設定・プライバシーポリシーの実装は2026-08-04に完了済み。
      残るのはApple Developer登録以降のユーザー作業）

## 実施記録

（実施後に追記）
