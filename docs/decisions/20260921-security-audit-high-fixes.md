# セキュリティ監査で見つかったHIGH項目3件を修正

- 日付: 2026-09-21
- 状態: 採用
- 種別: セキュリティ修正
- 関連: `docs/decisions/20260921-security-audit-role-based-rls.md`（CRITICAL/HIGH1件目の修正）

## 課題（Why）

`cloudflare/security-audit-skill`によるセキュリティ監査で確認されたHIGH項目のうち、
アプリケーションコード側で完結する3件を修正した（RLS側の修正は別ログ参照）。

| # | 内容 |
|---|---|
| 1 | `api/notify-line.ts`にレート制限・文字数制限が無く、ログイン済みの誰でも組織のLINEグループへ無制限にスパムを送れた |
| 2 | `src/App.tsx`の`printPesticideReport()`が未エスケープでHTMLを組み立て、同一オリジンiframeへ`doc.write`していた（stored XSS） |
| 3 | `supabase/functions/push-comment/index.ts`が`reports`/`schedules`/送信者名の参照に`organization_id`フィルタを付けておらず、他組織のreport/scheduleを参照してなりすまし通知を送れた（＋Webhook共有シークレット未設定時のfail-open） |

## 決めたこと

1. **notify-line**: 新規テーブル`notification_send_log`（`api_outputs`とは別。AI出力監査ログを
   通知回数のカウントで汚染しないため）を使い、1日30回の上限とメッセージ1000文字の上限を追加。
   `scripts/test-api-auth-boundaries.mjs`に回帰テストを追加
2. **printPesticideReport**: `escapeHtml`関数を追加し、HTML化する全フィールド（日付・圃場・作物・
   農薬名・希釈倍率・使用量・作業者・対象期間）に適用
3. **push-comment**: `reports`/`schedules`/送信者名の参照クエリすべてに`organization_id=eq.${c.organization_id}`
   を追加。あわせてWebhook共有シークレット未設定時を「誰でも呼べる」ではなく500エラーで拒否する
   fail-closed設計に変更

## 影響範囲

- DB: `notification_send_log`テーブルを新規追加（`scripts/migrations/2026-09-21-notification-send-log.sql`、
  要Supabase SQL Editorでの手動適用）。ポリシーを1本も作らず、authenticated/anonからは常に
  アクセス不可（service_roleキーのみが使う）
- 既存機能: 削除なし。1日30回のLINE通知という上限は通常の業務利用（作業報告のたびに通知等）を
  妨げない広さとして設定（`checkDailyLimit`の他機能が50/日である水準を踏襲）
- デプロイ: `api/*.ts`と`src/App.tsx`はgit push でVercelへ自動デプロイされる。
  `supabase/functions/push-comment/index.ts`は**別途 `supabase functions deploy push-comment --no-verify-jwt`
  の実行が必要**（Vercelのデプロイ対象外）

## プレモータム

1. **notification_send_logのマイグレーションを適用し忘れる。** →
   `checkAndRecordNotifyLimit`は表が無い場合`!cRes.ok`でfail-openするため、
   通知機能自体は止まらない（レート制限が効かないだけ）。ただしそれでは今回の
   修正の意味が無いため、マイグレーション適用は必達
2. **push-commentの新しいコードをデプロイし忘れる。** → Vercelのgit push自動デプロイに
   慣れていると見落としやすい。Edge Functionは明示的な`supabase functions deploy`が必要
3. **WEBHOOK_SECRETが本当は未設定で、fail-closedにしたことで通知機能全体が止まる。** →
   これは意図した動作（今まで気づかれずに全世界に開いていた状態より、通知が止まって
   気づける状態の方が安全）。止まった場合はSupabaseダッシュボードでシークレットを設定する

## 過去の判断との関係

- `docs/decisions/20260921-security-audit-role-based-rls.md`と同じ監査結果への対応の続き
