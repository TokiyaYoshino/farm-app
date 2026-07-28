# マルチテナント化 進捗（ブランチ: claude/multitenancy-rls）

最終更新: 2026-07-28

関連: `docs/adr-001-multitenancy-and-ai.md`（設計）, `docs/decision-log.md`（意思決定）, `docs/db-schema.md`（テーブル定義）, `docs/db/`（マイグレーションSQL）

---

## 事前調査で判明したこと（重要）

過去に同じ課題に着手した未マージのリモートブランチが存在した:
`origin/claude/multitenancy-step1`, `step1-done`, `step2`, `step2-done`（すべてmain未マージ、2026-07-22〜25作業）。

- これらは今回と同じ論点（`organizations`テーブル・`login_id`一意化・`organization_id`列追加）を検討済みで、
  `login_id`を全org横断で一意にしログイン画面にorg選択UIを追加しない、という設計判断も既に出ていた。
  **今回はこの判断を踏襲した**（`docs/decision-log.md`参照）
- `step1-done`/`step2-done`ブランチには「本番Supabaseでマイグレーションを実行完了」と記録するコミットがあるが、
  mainには一切反映されておらず、**本番DBの実際の状態（`organizations`テーブルや`organization_id`列が存在するか）は今回のセッションでは未確認**（本番DBへの直接SQL実行はガードレールで禁止されているため）
- 上記の理由により、今回起草したマイグレーションSQLはすべて **冪等**（`IF NOT EXISTS`等）に書いてあり、実行済み・未実行どちらの状態に対しても安全に流せる
- 旧ブランチのApp.tsxコードは「organization_id列が既に存在する」前提でNOT NULL込みの実装だったため、そのまま流用すると
  今回のように本番の実際の状態が不明な状況では危険（列が無ければ即座にクエリがエラーになる）。
  今回は逆に **「列が無くても今まで通り動く／列が追加されたら自動的にそちらを使う」フォールバック方式**で実装した（下記「設計方針」参照）

---

## 完了項目

### 1. organizationsテーブル等のマイグレーションSQL起草（未実行）
- `docs/db/2026-07-28-01-organizations-and-login-id.sql`: `organizations`テーブル作成、既存データ（org="kishu"）を「霧珠ファーム」として登録、`users.login_id`のunique制約
- `docs/db/2026-07-28-02-organization-id-columns.sql`: users/crops/fields/reports/pesticides/settings/projects/tickets/comments/schedulesへの`organization_id`列追加＋バックフィル＋NOT NULL化
- いずれも**未実行**。Supabaseダッシュボードでの適用はユーザーが手動で行う

### 2. login_idの設計判断
- **決定**: `login_id`は全org横断で一意。ログイン画面へのorg選択UI追加はしない
- ADR-001・`docs/decision-log.md`に記録済み

### 3. `src/App.tsx`の組織スコープ対応（約10箇所）
以下の10箇所すべてに対応（フォールバック方式、詳細は下記「設計方針」参照）:
1. 起動時のusers全件取得 → 自分の行をauth_idで先に特定してから組織スコープで取得
2. schedules取得 → organization_id列があれば直接フィルタ、無ければ既存のuser_id経由フィルタ
3. comments取得 → organization_id列があれば直接フィルタ、無ければ既存のreport/schedule突合フィルタ
4. ログイン時のlogin_id検索 → 変更不要と判断（login_idがorg横断一意のため）
5. ユーザー招待後のusers再取得 → 組織スコープで取得
6. ユーザー削除 → `org`（列は既存）で即時スコープ、organization_idがあれば併用
7. schedule追加 → organization_idを条件付きで付与
8. comments取得（loadComments）→ organization_idがあれば併用フィルタ
9. comment追加 → organization_idを条件付きで付与
10. comment編集 → organization_idがあれば併用フィルタ

**加えてスコープを広げた対応**: `organization_id`列がNOT NULL化された時にINSERTが失敗しないよう、
crops/fields/reports/pesticides/settings/projects（`GanttChart.tsx`含む）の書き込みにも
`organization_id`を条件付きで付与するようにした（元の「約10箇所」の指示より広いが、
移行順序ステップ2のNOT NULL化を安全に実行できるようにするため必要と判断）。

### 4. `api/set-user-auth.ts`のorganizationパラメータ化
- `org`（未指定時 `"kishu"` にフォールバック）と`organization_id`（任意、値がある時だけDB書き込みに含める）を受け取るように変更
- メール用ドメイン(`kishu-farm.system`)は定数化。`login_id`がorg横断一意のためドメイン自体を組織別に分ける必要はないと判断（理由は`docs/decision-log.md`参照）

### 5. `api/notify-line.ts`のLINE通知先パラメータ化
- `organization_id`が渡された場合、`organizations`テーブルの`line_channel_token`/`line_group_id`を優先して使用
- テーブル未作成・行が無い・取得失敗時は既存の環境変数(`LINE_CHANNEL_ACCESS_TOKEN`/`LINE_GROUP_ID`)にフォールバック（例外を投げない設計）

### 6. 越境アクセス確認用の手動テストチェックリスト
下記「手動テストチェックリスト」参照

---

## 設計方針（重要・レビュー時に必ず読むこと）

このブランチのコードは **「`organization_id`列が存在しない状態でも今まで通り動き、
マイグレーション適用後は自動的に`organization_id`ベースのスコープに切り替わる」** フォールバック方式で実装した。

理由: このコード変更（`claude/multitenancy-rls`）は先にmainへマージ・デプロイされ、
DBマイグレーション（`docs/db/`のSQL）の適用は別途ユーザーが手動で行う想定になる。
その間にタイムラグが生じるため、**マイグレーション未適用の状態で本番アプリが壊れてはいけない**。

実装パターン:
- 読み取り: `organizationId ? .eq("organization_id", organizationId) : （既存のorg文字列 or 既存の間接フィルタ）` の三項分岐
- 書き込み: `...(organizationId ? { organization_id: organizationId } : {})` のスプレッドで、値が無い間はキー自体を送らない
  （PostgRESTは存在しない列をinsertボディに含めるとエラーを返すため、単に`null`を送るのでは不十分）

このため **マイグレーションSQL適用前後どちらのタイミングでこのブランチをマージ・デプロイしても安全**。
ただし、`docs/db/2026-07-28-02-*.sql`のNOT NULL化（末尾）は、このコードがマージ・デプロイされて
`organization_id`列に実際に値が書き込まれるようになった後に実行すること（順序を守らないと新規insertが失敗する）。

---

## 残作業（未着手）

- JWTカスタムクレームへの`organization_id`設定、Supabase Auth Hookの設定
- RLSポリシーの`allow_all`撤廃 → `organization_id = auth.jwt() ->> 'organization_id'`への実ポリシー化（テーブルごとに段階適用）
- 2組織目を受け入れる前の越境アクセス実地検証（下記チェックリスト）
- `tickets`テーブルへのクライアント側insert経路が現状無いため、`organization_id`付与コードは未実装（列自体はマイグレーション対象に含めた）
- App.tsx肥大化への対応（ADR-001 4章、本タスクのスコープ外）

## 要ユーザー対応（このセッションでは実施できない/しない）

1. **本番Supabaseへのマイグレーション適用**: `docs/db/2026-07-28-01-*.sql` → `2026-07-28-02-*.sql`の順でSupabaseダッシュボードのSQL Editorから手動実行。実行前に必ず`organizations`テーブル・各テーブルの`organization_id`列が既に存在しないか確認すること（前述の「事前調査で判明したこと」参照）
2. **SupabaseのJWTカスタムクレーム／Auth Hook設定**: RLS実ポリシー化に必要。Supabaseダッシュボード側の設定作業
3. **Vercel ProductionへのOPENAI_API_KEY登録**: 既知の課題として、現状Development環境にしか登録されていない（AI機能関連、本タスクとは別件だが申し送り事項として記載）
4. **最終レビュー・マージ・デプロイの判断**: このブランチ（`claude/multitenancy-rls`）はpushのみでmainにはマージしていない
5. **本番DBの実際の状態確認**: `origin/claude/multitenancy-step1-done`/`step2-done`ブランチが主張する「マイグレーション実行済み」が事実かどうか、Supabaseダッシュボードで確認すること
6. **`~/Projects/kishufarm/strategy/03-agritech.md`の更新**: ADR-001が言及する外部公開方針との整合性確認（本リポジトリ外）

---

## 手動テストチェックリスト（越境アクセス確認用）

自動テストの仕組みがリポジトリに無いため、2組織目を受け入れる前に以下を手動確認する。
（`docs/db/`のマイグレーション適用後、かつ2組織目のテストデータを用意した上で実施）

### 準備
- [ ] `organizations`テーブルにテスト用の2組織目（例: `org_key='test2'`）を作成
- [ ] 各テーブル（users/crops/fields/reports/schedules/pesticides/comments/settings/projects/tickets）にorg1・org2それぞれのテストデータを用意
- [ ] org1・org2それぞれにテストユーザー（ログイン可能な状態）を用意

### 読み取りの越境確認（org1ユーザーでログインして確認）
- [ ] ユーザー管理画面に org2 のユーザーが表示されないこと
- [ ] 作物・圃場・農薬の一覧に org2 のデータが表示されないこと
- [ ] 作業報告一覧・カレンダーに org2 のデータが表示されないこと
- [ ] 予定（schedules）一覧に org2 のデータが表示されないこと
- [ ] コメント・通知ベルに org2 のコメント/メンションが表示されないこと
- [ ] 分析タブ（レポート・ガントチャート）に org2 のデータが表示されないこと
- [ ] 設定（農場の場所）が org2 のものと混ざらないこと

### 書き込みの越境確認
- [ ] org1ユーザーがブラウザの開発者ツール等でorg2のレコードID（例: 他組織のuser id, comment id）を直接指定して更新・削除を試みても失敗すること（RLS実ポリシー化前は**クライアントの`.eq()`条件のみに依存するため、ここは現状防げない可能性が高い**。RLS適用後に必ず再確認）
- [ ] org1管理者がユーザー招待をした際、新規ユーザーが org1 に所属すること（org2にならない）
- [ ] LINE通知が org1 設定のチャネル/グループにのみ届くこと（org2の通知が混ざらないこと）

### ログインの確認
- [ ] org1のlogin_idでorg2にログインできないこと（login_idがorg横断一意なので、そもそも所属組織が一意に決まることを確認）
- [ ] 同じlogin_idを2組織で重複登録しようとするとDB制約でエラーになること（`users_login_id_unique`）

### RLS実ポリシー化後（別セッションで実施）に追加で確認
- [ ] `allow_all`ポリシー撤廃後、anonキー＋別組織のJWTで直接Supabase REST APIを叩いても他組織データが取得できないこと
- [ ] 各テーブルのRLSポリシーが`organization_id = auth.jwt() ->> 'organization_id'`になっていること

---

## 品質ゲート実行結果

- `npm run build`: ✅ 成功（`tsc -b && vite build`、エラーなし）
- `npm run lint`: ⚠️ **mainブランチの時点で既に65件前後のlintエラーが存在する既存の負債**（`any`型の多用、全角スペースのirregular whitespace、三項演算子の副作用式など。2026-07-13頃から放置されている旨が過去の別ブランチのコミットメッセージにも記録されている）。今回のブランチでの変更によって**新規のlintエラーは追加していない**ことを確認済み（`git stash`でmain相当の状態に戻してlint実行し、件数を比較: main相当66件 → 本ブランチ65件。むしろ1件改善——起動時schedulesフェッチの`as any`キャストを`Schedule[] | null`の具体型に置き換えたため）。lintを完全にパスさせるには本タスクと無関係な既存コード全体の型修正が必要になるため、今回はスコープ外として対応せず、この事実を明記するに留めた
