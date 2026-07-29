# マルチテナント化 進捗（ブランチ: claude/multitenancy-rls）

最終更新: 2026-07-28

関連: `docs/adr-001-multitenancy-and-ai.md`（設計）, `docs/decision-log.md`（意思決定）, `docs/db-schema.md`（テーブル定義）, `scripts/migrations/`（マイグレーションSQL、実行済み）

---

## 重要な発見（作業途中で判明・最優先で読むこと）

このタスクは当初「マルチテナント化に**新規着手**する」前提で開始したが、作業途中で
**ローカルの`main`ブランチが`origin/main`（GitHub上の実際のmain、Vercelがデプロイする対象）から
9コミット遅れて分岐していた**ことが判明した。

- `origin/main`には、`origin/claude/multitenancy-step1`/`step2`系の作業が**実際にPR #1〜#4としてマージ済み**で、
  `organizations`テーブル作成・`users.login_id`のunique制約・全テーブルへの`organization_id`列追加（NOT NULL）・
  クライアントコードの組織スコープ対応・`api/set-user-auth.ts`のorganization_id必須化が**本番Supabaseに適用済み**だった
  （decision-logにも「Supabase側で実行済み」との記録があり、実際にmainへマージされている以上、今回はこれを事実として採用した）
- 一方でローカル`main`には、`origin/main`に無いAI機能7コミット（AI日報自動生成PoC・音声メモのChatGPT自動振り分け・
  記録検索チャット・天気×防除タイミング助言・病害虫画像診断・価格体系ドキュメント・JGAP拡充保留の判断）が
  存在しており、**これらは`origin/main`にpushされていない**
- 本ブランチ（`claude/multitenancy-rls`）は最初にローカルの古い`main`から作成してしまったため、
  `organization_id`列が「まだ存在しない」前提のフォールバック実装を一度やり直す形になった。
  その後`origin/main`を`git merge`で取り込み、**マルチテナント化まわりはorigin/main側の実装（フォールバック無し、
  organization_id前提）を採用**し、ローカルmain側のAI機能7コミットもマージで取り込んだ

### 要ユーザー対応（最優先）
- **ローカル`main`と`origin/main`の分岐を解消すること**。具体的には、ローカル`main`をpull/reset等で
  `origin/main`に追従させ、AI機能7コミット分の内容が失われないようにする（例えば、ローカルmain側で
  `origin/main`をマージしてpushする、または既にこのブランチに取り込まれている内容を確認した上でローカルmainを
  origin/mainに追従させる、など）。**放置するとAI機能（音声メモ・検索チャット・天気助言・画像診断・AI日報）の
  実装がGitHub/本番に一切反映されないままになる**
- 原因（推定）: worktree等を使った並行セッションで、同じ起点から2系統に分かれたまま一方が未pushで残った可能性が高い。今回のセッションでは原因の特定はできていない

---

## 完了項目（このブランチでの新規作業）

`origin/main`に既にマージ済みだったため、ADR-001の「改修箇所の実測」表にある10箇所のクエリスコープ対応・
`organizations`/`organization_id`マイグレーション・`api/set-user-auth.ts`のパラメータ化・login_id設計判断は
**このセッションで新規に行う前に、origin/main側で既に完了していたことが判明した**（詳細はADR-001参照）。
このセッションで実質的に新規追加したのは以下の2点。

### 1. `api/notify-line.ts`のLINE通知先パラメータ化
- `organization_id`が渡された場合、`organizations`テーブルの`line_channel_token`/`line_group_id`を優先して使用
- テーブル未作成・行が無い・取得失敗時は既存の環境変数(`LINE_CHANNEL_ACCESS_TOKEN`/`LINE_GROUP_ID`)にフォールバック（例外を投げない設計）
- `origin/main`側ではここは「未対応（優先度低）」のまま残っていた箇所

### 2. 越境アクセス確認用の手動テストチェックリスト
- 下記「手動テストチェックリスト」参照。`origin/main`側には存在しなかった

### 3. ドキュメント整合性の修正
- ADR-001の「改修箇所の実測」表・移行順序を、実際にorigin/mainで完了している状態に合わせて更新し、
  今回判明したブランチ分岐の経緯を追記
- `docs/decision-log.md`に今回の発見（ローカル/リモートmain分岐）を記録

---

## 残作業（未着手）

- **最優先**: ローカルmainとorigin/mainの分岐解消（前述「要ユーザー対応」参照）
- JWTカスタムクレームへの`organization_id`設定、Supabase Auth Hookの設定
- RLSポリシーの`allow_all`撤廃 → `organization_id = auth.jwt() ->> 'organization_id'`への実ポリシー化（テーブルごとに段階適用）
- 2組織目を受け入れる前の越境アクセス実地検証（下記チェックリスト）
- `tickets`テーブルへのクライアント側insert経路が現状無いため、`organization_id`付与コードは未実装（列自体はマイグレーション対象に含まれ適用済み）
- App.tsx肥大化への対応（ADR-001 4章、本タスクのスコープ外）

## 要ユーザー対応

1. **最優先: ローカルmain/origin/mainの分岐解消**（前述）
2. **SupabaseのJWTカスタムクレーム／Auth Hook設定**: RLS実ポリシー化に必要。Supabaseダッシュボード側の設定作業
3. **Vercel ProductionへのOPENAI_API_KEY登録**: 既知の課題として、現状Development環境にしか登録されていない（AI機能関連、本タスクとは別件だが申し送り事項として記載）
4. **最終レビュー・マージ・デプロイの判断**: このブランチ（`claude/multitenancy-rls`）はpushのみでmainにはマージしていない。
   `git diff origin/main claude/multitenancy-rls`で確認すると、想定より差分が大きい（api/diagnose-image.ts等5ファイルが
   「新規追加」として出る）。これは**マルチテナント化の差分ではなく**、ローカルmain分岐解消のために`origin/main`を
   マージした結果、ローカルmain固有だったAI機能7コミット分（origin未pushだった音声メモ・検索チャット・天気助言・
   画像診断・AI日報等）も一緒にこのブランチに載っているため。**このブランチをmainにマージすると、
   マルチテナント化の残作業だけでなく、これまでorigin/mainに存在しなかったAI機能一式も同時に本番へ出ることになる**。
   意図しない同時デプロイにならないよう、マージ前に必ず内容を確認すること
5. **`~/Projects/kishufarm/strategy/03-agritech.md`の更新**: ADR-001が言及する外部公開方針との整合性確認（本リポジトリ外）

---

## 手動テストチェックリスト（越境アクセス確認用）

自動テストの仕組みがリポジトリに無いため、2組織目を受け入れる前に以下を手動確認する。
`organizations`テーブル・`organization_id`列は既に本番適用済みのため、2組織目のテストデータを用意すればすぐ実施できる。

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

- `npm run build`: 実施予定（マージ後に再実行して確認する。下部「最終確認」参照）
- `npm run lint`: mainブランチの時点で既存のlint負債（`any`型の多用、全角スペースのirregular whitespace等、2026-07-13頃から放置）があることを確認済み。本ブランチの新規追加分（notify-line.ts）はorigin/main側のAPI型定義（`api/types.ts`のApiRequest/ApiResponse）を使う形にしたため新規のany追加はしていない
