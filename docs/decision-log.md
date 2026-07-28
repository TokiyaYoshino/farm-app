# 意思決定ログ

## 2026-07-28: login_idの一意性方式 / マルチテナント化RLS対応ステップ1〜3着手

- **決定**: `login_id`は全org横断（組織をまたいで）で一意にする。ログイン画面へのorg選択UI／サブドメイン分けは追加しない
- **背景**: `docs/adr-001-multitenancy-and-ai.md`「1. 外部公開の絶対条件」着手にあたり、マルチテナント化のブロッカーだったログイン方式の設計判断が未決だった
- **理由**:
  1. 現行ログインフロー（`login_id`だけで`email`を検索→認証）を変えずに済み、UI追加コストがかからない
  2. 過去に同じ論点を検討した形跡（`origin/claude/multitenancy-step1`ブランチ、2026-07-22、main未マージ）があり、同じ結論（org横断一意・org選択UIなし）に達していた。今回はその判断を踏襲する
  3. 現状1組織のみで、複数組織を跨いで同じ`login_id`を使いたいという要求も無い
- **対応**: `docs/db/2026-07-28-01-organizations-and-login-id.sql`でDB制約化（重複有無の確認クエリ付き、未実行・レビュー用）
- **あわせて着手**: マルチテナント化 移行順序ステップ1〜2（`organizations`テーブル作成、既存データ「霧珠ファーム」の登録、各テーブルへの`organization_id`列追加）のマイグレーションSQL起草と、`src/App.tsx`・`api/set-user-auth.ts`・`api/notify-line.ts`のフォールバック付き組織スコープ対応
- **設計方針（重要）**: 過去の`claude/multitenancy-step2`ブランチの実装は「organization_id列が既に存在する」前提でNOT NULL制約込みのコードを書いていたが、mainに未マージのため本番DBの実際の状態が不明。今回は逆に「**organization_id列がまだ無くても既存の挙動を一切変えず、マイグレーション適用後は自動的にorganization_idベースのスコープに切り替わる**」フォールバック実装にした。理由は、コードを先にmainへマージ・デプロイしてもDBマイグレーション未適用の間は本番アプリを壊さないため（`docs/multitenancy-progress.md`の「設計方針」節に詳細）
- **未対応（要ユーザー対応）**: ADR-001が参照する`~/Projects/kishufarm/strategy/03-agritech.md`（本リポジトリ外）の更新は本ログでは行っていない。外部公開方針の整合性確認のため別途更新が必要
- **要確認（要ユーザー対応）**: `origin/claude/multitenancy-step1-done` / `step2-done`ブランチに「本番Supabaseでの上記マイグレーションSQL実行完了」と記録するコミットがあるが、mainには未マージで、実際に本番DBに反映されているか今回のセッションでは確認していない（本番DBへの直接SQL実行は本タスクの禁止事項のため）。Supabaseダッシュボードで`organizations`テーブル・各テーブルの`organization_id`列の有無を確認すること
