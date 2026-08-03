# プッシュ通知の構成と設定手順

コメント・メンションが付いたときに、対象ユーザーの端末へプッシュ通知を送る。

```
comments に INSERT
  → Supabase Database Webhook
    → Edge Function: supabase/functions/push-comment
      → 宛先判定（メンション / 自分の記録 / 自分担当の予定）
        → device_tokens からトークン取得
          → Expo Push API → 端末
```

タップすると該当の作業記録・予定の詳細シートが直接開く（`App.tsx` の `pendingPush`）。

## 構成ファイル

| ファイル | 役割 |
|---|---|
| `expo-prototype/lib/push.ts` | 権限要求・トークン登録/削除・リスナー |
| `expo-prototype/lib/store.tsx` | ログイン後に `registerPushToken`、ログアウト時に削除 |
| `expo-prototype/App.tsx` | 受信で `refresh()`、タップで対象シートを開く |
| `supabase/functions/push-comment/index.ts` | 送信側（Deno / service_role） |
| `scripts/migrations/2026-08-04-device-tokens.sql` | `device_tokens` テーブル + RLS |

宛先の判定基準は `lib/store.tsx` の `myNotifs` と同一にしてある。片方を変えたら
もう片方も合わせること（アプリ内の通知ベルと届くプッシュがずれる）。

## 重要な制約

**Expo Go ではリモートプッシュを受信できない**（SDK 53 以降で非対応）。
確認には開発ビルドまたは TestFlight が必要。`lib/push.ts` はトークン取得の失敗を
握りつぶすため、Expo Go でも通知以外の機能は通常どおり動作する。

## 設定手順

### 1. DB（Supabase ダッシュボード > SQL Editor）

`scripts/migrations/2026-08-04-device-tokens.sql` を実行する。
`jwt_organization_id()` に依存するため、**先に `2026-08-02-rls-policies.sql` の 0)〜1)**
を適用しておくこと（`docs/rls-rollout.md`）。

### 2. Edge Function のデプロイ

Supabase CLI が必要（`brew install supabase/tap/supabase`）。

```bash
cd ~/farm-app
supabase login
supabase link --project-ref <プロジェクトref>

# Webhook用の共有シークレット（任意の長い文字列）を登録
supabase secrets set PUSH_WEBHOOK_SECRET=<ランダムな文字列>

# JWT検証は無効化する（WebhookはユーザーのJWTを持たない。代わりに上記シークレットで守る）
supabase functions deploy push-comment --no-verify-jwt
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Edge Function の実行環境に
自動で入るため、設定は不要。

### 3. Database Webhook の登録

ダッシュボード > Database > **Webhooks** > Create a new hook

- Table: `comments`
- Events: **Insert** のみ
- Type: HTTP Request
- Method: `POST`
- URL: `https://<プロジェクトref>.supabase.co/functions/v1/push-comment`
- HTTP Headers:
  - `Content-Type: application/json`
  - `x-webhook-secret: <手順2で設定した文字列>`

### 4. EAS プロジェクトIDの設定

実機ビルドの手順全体は `docs/testflight-guide.md` にまとめてある。

`getExpoPushTokenAsync` は `extra.eas.projectId` を要求する。
`eas build` を初回実行すると `app.json` に自動で追記される（手動なら `eas init`）。

```bash
cd ~/farm-app/expo-prototype
npx eas-cli login
npx eas-cli init          # app.json に extra.eas.projectId が入る
```

### 5. iOS のプッシュ証明書

Apple Developer Program の登録後、EAS が Push Key（APNs）を自動生成・管理する。

```bash
npx eas-cli build --platform ios --profile development
```

対話プロンプトで「Push Notifications」の設定を求められたら、EAS に管理させる
（`Let EAS handle it`）のが最も手間が少ない。

## 動作確認

1. 開発ビルドを実機にインストールしてログイン → 通知許可のダイアログで「許可」
2. `device_tokens` に行が入ることを SQL Editor で確認
3. 別ユーザー（Web版）から、その人の作業記録にコメント or `@名前` でメンション
4. 端末に通知が届き、タップで該当の記録が開くこと
5. Edge Function のログ（ダッシュボード > Edge Functions > push-comment > Logs）に
   `{ sent: n }` が出ていること

うまく届かない場合の切り分け:

- ログに `no recipients` → 宛先判定に引っかかっていない（自分自身へのコメントは通知しない仕様）
- ログに `no tokens` → 手順1〜4のどこかでトークン登録に失敗している
- ログが出ない → Webhook が発火していない（Events が Insert になっているか、シークレットが一致しているか）
- `DeviceNotRegistered` → 失効トークン。Edge Function が自動削除するので再ログインで再登録される

## 未対応（フェーズ2）

- 予定の当日リマインド・未報告アラート（`schedules` を対象にした定期送信。pg_cron + Edge Function）
- 週次AIサマリーの通知（`docs/roadmap.md`）
- バッジ数の同期（現在 `shouldSetBadge: false`。アプリ内の未読数とOSバッジは連動しない）
