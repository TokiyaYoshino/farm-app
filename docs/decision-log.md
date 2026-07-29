# 意思決定ログ

## 2026-07-28: マルチテナント化RLS対応ブランチでのローカル/リモートmain分岐の発見と対応

- **発見**: `claude/multitenancy-rls`ブランチ着手時、ローカル`main`が`origin/main`から9コミット遅れて分岐していたことが判明。
  ローカル`main`には2026-07-22決定のマルチテナント化ステップ1・2（本ログの下の項目）が反映されておらず、
  代わりに`origin/main`側には無いAI機能7コミット分（AI日報PoC・音声メモ・記録検索チャット・天気防除助言・画像診断・価格体系ドキュメント等）が
  ローカルのみに存在していた（origin未push）
- **原因（推定）**: 別々のworktree/セッションで並行作業した結果、同じ基点から2つの系列に分岐したまま一方がpushされずに残っていたと見られる
- **対応**: `origin/main`を正としてマージ・統合した（`organizations`テーブル・`organization_id`列は既に本番適用済みのため、フォールバック実装は不要と判断しorigin/main側の実装を採用）。ローカルmain固有のAI機能7コミットの扱いは本ログでは決定していない（要ユーザー対応、詳細は`docs/multitenancy-progress.md`参照）
- **今回追加した対応**: `api/notify-line.ts`のorganization_idパラメータ化（origin/mainには無かった）、越境アクセス確認用の手動テストチェックリスト（`docs/multitenancy-progress.md`）

## 2026-07-22: login_idの一意性方式 / マルチテナント化ステップ1着手

- **決定**: `login_id`は全org横断（組織をまたいで）で一意にする。ログイン画面へのorg選択UI／サブドメイン分けは追加しない
- **背景**: `docs/adr-001-multitenancy-and-ai.md`「1. 外部公開の絶対条件」着手にあたり、マルチテナント化のブロッカーだったログイン方式の設計判断が未決だった
- **理由**: 現行ログインフロー（`login_id`だけで検索→emailを引いて認証）を変えずに済み、UI追加コストがかからないため
- **対応**: `scripts/migrations/2026-07-22-login-id-unique.sql`でDB制約化。重複0件を確認の上、Supabase側で実行済み（2026-07-22）
- **あわせて完了**: マルチテナント化 移行順序ステップ1（`organizations`テーブル作成＋既存データ「霧珠ファーム」の登録）。SQLは`scripts/migrations/2026-07-22-organizations-step1.sql`、Supabase側で実行済み（2026-07-22）
- **未対応（要ユーザー対応）**: ADR-001が参照する`~/Projects/kishufarm/strategy/03-agritech.md`（本リポジトリ外）の更新は本ログでは行っていない。外部公開方針の整合性確認のため別途更新が必要
