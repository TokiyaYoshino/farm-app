# RLS実ポリシー化の適用手順（App Store申請前の必須作業）

対象SQL: `scripts/migrations/2026-08-02-rls-policies.sql`
**＋ `scripts/migrations/2026-08-23-rls-crop-advice.sql`（本体に含まれない2表。手順3-5で実行）**
背景: `docs/multitenancy-progress.md` の残作業。現在は全テーブル `allow_all` のため、
anonキーを知っていれば他組織のデータを直接読み書きできる状態。公開前に必ず塞ぐ。

**この手順は kishu/asuka の分離までは行わない。** 匿名で素通しになっている穴を先に塞ぐ判断で、
組織の振り分け（`organization_id` の振り直し）は次段の別タスク
（`docs/decisions/20260903-rls-before-org-split.md`）。適用しても**アプリの見え方は変わらない**
（全員の JWT と全行の `organization_id` が同一値のため、判定が全員 true になる）。

## 全体の流れ（所要 30〜60分）

```
0.  事前準備（バックアップ・メンテ告知）
0.5 実行前点検（読み取りのみ）        ← SQL Editor / ローカル
1.  Custom Access Token Hook の設定    ← ダッシュボード操作
2.  全員ログインし直し（新JWT取得）
3.  RLSポリシーをテーブル1つずつ適用    ← SQL Editor
4.  越境アクセステスト
5.  アプリ/Web両方の動作確認
```

## 0. 事前準備

- [ ] Supabaseダッシュボード > Database > Backups で直近バックアップがあることを確認
- [ ] 作業中はWeb/アプリの利用を避けるよう関係者に伝える（吉野さん1人なら不要）

## 0.5 実行前点検（2026-09-03 追加・読み取りのみ）

前回の実測から日が経っているため、**まず現状を確定させる**。どちらもデータを変更しない。

### a) SQL Editor での点検

```
scripts/migrations/2026-09-03-rls-preflight.sql
```

**1文ずつ選択して実行**する（SQL Editor は複数文をまとめると結果を表示しない）。
確認するのは10項目。特に見るべきは次の3つ。

| # | 見るところ | 期待 | 外れていたら |
|---|---|---|---|
| 6 | `organization_id` が NULL の行 | **全テーブル 0** | NULL の行は適用後**誰からも見えなくなる**。先にバックフィルする |
| 9 | `storage.objects` の実際のポリシー名 | `allow all` が実在 | 名前が違えば手順7の `drop policy` は**黙って何もしない**。SQL 側の名前を実名に直してから流す |
| 4 | `organizations` の行 | kishu の1行 | 0行なら `2026-08-10-organizations-check.sql` を先に流す |

### b) 穴の実測（適用前・適用後で同じものを叩く）

```bash
node scripts/rls-verify.mjs          # .env.local の VITE_SUPABASE_* を読む
```

anon キーだけで各テーブルが何件読めるかを出す。**適用前は件数が出るのが正常**（それが今の穴）。
適用後に**全テーブル 0 件**になれば塞がったということ。ログイン中ユーザーの
`access_token` を `ACCESS_TOKEN=` で渡すと、認証後の見え方も同時に確認できる。

### c) コード側の事前監査（2026-09-03 実施・結果は「流して問題なし」）

適用で壊れる箇所がないか、クライアント側を先に洗った。**修正が必要な箇所は見つからなかった。**

| 監査項目 | 結果 |
|---|---|
| ログイン（匿名で `users` を引く経路） | `select("email").eq("login_id", …)`（`src/App.tsx:741`）。手順6の列権限 `grant select (login_id, email)` と**一致**。他の列は引いていない |
| クライアントからの insert 全17箇所 | Web・Expo とも**すべて `organization_id` を明示**（`currentOrganizationId`）。`with check` で弾かれる箇所は無い |
| `work_categories` への書き込み | **無い**（select のみ）。読み取り専用ポリシーで足りる |
| Storage | upload と getPublicUrl のみ。**delete は無い**ので insert/select の2ポリシーで足りる |
| `api/*.ts` | すべて `SUPABASE_SERVICE_ROLE_KEY`。RLS の影響を受けない |
| 対象テーブルの網羅 | 全19表が本体＋`2026-08-23-rls-crop-advice.sql`＋`2026-08-04-device-tokens.sql` で**カバーされている**（取りこぼし無し） |

**残る唯一の全機能停止リスクは手順6（`users`）** — ログインできなくなる箇所はここだけ。
切り戻しの1文を手元に置いてから流すこと。

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

### 実行前の確認（2026-08-23 時点の実測。最新の実測は手順0.5 で取り直すこと）

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
- [ ] `node scripts/rls-verify.mjs` が**全テーブル 0 件**で終わること（手順0.5 b の再実行）
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
