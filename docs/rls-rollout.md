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
   （users の後に auth-hook ポリシー、最後に Storage の差し替え版）
4. 越境アクセステスト                  ← scripts/verify-rls.sh
5. アプリ/Web両方の動作確認
6. 1時間後にもう一度ログインし、JWTに organization_id が残っていることを確認
```

**2026-09-05 に本体SQLの欠落と Storage ポリシーの穴を見つけて手当てしている。**
実行するファイルは4つ:

| 順 | ファイル | 備考 |
|---|---|---|
| 1 | `2026-08-02-rls-policies.sql` | 本体。ただし **3) の Storage ブロックは実行しない** |
| 2 | `2026-08-23-rls-crop-advice.sql` | 相談スレッド2表（本体に無い） |
| 3 | `2026-09-05-rls-auth-hook-policy.sql` | **必須**。users の後に実行 |
| 4 | `2026-09-05-rls-storage-fix.sql` | 本体の 3) の差し替え |

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
   - **⚠ 続けて `scripts/migrations/2026-09-05-rls-auth-hook-policy.sql` を実行する（必須）。**
     本体の 0) は Hook 関数に `grant select` しか与えていないが、grant は RLS を
     通過させない。`custom_access_token_hook` は SECURITY DEFINER ではないため
     `supabase_auth_admin` として実行され、users に RLS が効いた瞬間から
     ポリシーの評価対象になる。本体が users に作るポリシーはどれも
     `supabase_auth_admin` を対象にしていないので、**Hook の select が0件になり、
     以後発行されるJWTから organization_id クレームが消える**
   - **時間差で壊れるのが厄介**: 適用直後は既存トークンが生きているので画面は正常に見える。
     アクセストークンが自動更新される1時間ほど後に、全ユーザーが全データを見失う。
     手順2をやったのに「データが全部消えて見える」が再発したらこれを疑う
   - 適用後に**もう一度**ログインし直して、JWT に `organization_id` が入っているか
     確認すること（適用前の確認では検出できない）
7. Storage — **本体の 3) ブロックは実行せず、
   `scripts/migrations/2026-09-05-rls-storage-fix.sql` を実行する**
   - 本体の `report_images_select_public` は `TO` 句が無いため anon を含む全ロールが
     対象になり、`storage.objects` を匿名で列挙できる。「ランダムパスだから推測困難」
     という前提は一覧が取れる相手には成立せず、本体を流しきっても
     **他組織の作業写真を全件ダウンロードできる状態が残る**（2026-09-05 の監査で判明）
   - 差し替え版は select ポリシーを作らない。アプリは Storage の `upload()` と
     `getPublicUrl()` しか使っておらず（`list()`/`remove()`/`download()` の呼び出しは
     リポジトリ全体でゼロ）、画像配信は public バケットの
     `/storage/v1/object/public/...` で RLS を通らずに行われるため、
     **select ポリシーはアプリの動作に一切使われていない**。落としても表示は変わらず、
     anon も他組織の認証ユーザーも列挙できなくなる
   - 残る制約: public バケットのままなので **URLを知っていればログインなしで読める**。
     URLは `reports.image_url` にあり、その表は組織スコープになるので通常は漏れないが、
     公開URLは期限が無く失効させられない。private バケット＋署名URL＋組織プレフィックスへの
     移行は**2組織目を迎える前に**別途実施する（`docs/pre-release-audit.md` の 3）

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

### 実行前の確認（2026-09-05 時点）

- **RLS は未着手のまま**（2026-09-05 に確認）。下の 2026-08-23 の記述は現在も有効
- 手順6に **`scripts/migrations/2026-09-05-rls-auth-hook-policy.sql` の実行が追加**（必須）。
  本体SQLの欠落を埋めるもので、無いと1時間後に全員がデータを見失う
- 手順7の Storage は差し替え版
  （`scripts/migrations/2026-09-05-rls-storage-fix.sql`）を使うこと
- 手順4は `scripts/verify-rls.sh` で実行する

### 実行前の確認（2026-08-23 時点の実測）

- JWT に `organization_id` クレームは**まだ入っていない**（ブラウザのセッションを実測して確認済み）。
  したがって**手順1（Auth Hook）は未実施**であり、ここから始める必要がある
- `device_tokens` は `2026-08-04-device-tokens.sql` が自前で組織スコープのポリシーを
  持っているため、本体側での追加対応は不要（確認済み）

## 4. 越境アクセステスト

**`scripts/verify-rls.sh` を実行する。** 手作業の curl を自動化したもので、
匿名アクセス14表・users の列制限・Storage の列挙・越境アクセスを一度に検証する。

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anonキー>"
bash scripts/verify-rls.sh
```

読み取りしか行わないのでデータは変わらない。**FAIL が1つでもある間は公開しないこと。**

2組織目を作ってあるなら、越境テストまで実行できる:

```bash
export JWT_ORG2="<org2ユーザーの access_token>"
export ORG1_REPORT_ID="<org1に実在する reports.id>"
bash scripts/verify-rls.sh
```

access_token は Web版にログインして DevTools > Application > Local Storage の
`sb-<project>-auth-token` 内の `access_token` をコピーする。
JWT に `organization_id` クレームが入っているかもここで自動チェックされる
（手順1・2の実施漏れの検出）。

2組織目がまだ無い場合、越境の項目は SKIP になる。匿名アクセスの項目だけでも
「anonキーを知っていれば全データが読める」という一番大きな穴は塞げたことを確認できるので、
**まず SKIP ありで通し、2組織目を作った時点で再実行する**のが現実的。

### 補足: users のユーザー列挙について

ログイン画面が login_id → email を匿名で解決する設計のため、本体SQLは
`users` の `login_id` / `email` 列だけ匿名参照を許している（手順6）。
このため **全組織のログインIDとメールアドレスは匿名で列挙できる**状態が残る。
業務アプリなので優先度は低いが、消したい場合の方針は
`docs/pre-release-audit.md` の 10 を参照（email が login_id から決定的に
生成されているので、クライアント側で組み立てれば匿名参照ごと不要にできる）。
先に下のクエリで例外が無いことを確認すること:

```sql
select login_id, email from users where email not like '%@kishu-farm.system';
-- 0件なら、匿名参照を廃止できる
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
