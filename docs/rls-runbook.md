# RLS適用 当日手順書（クリックレベル）

**当日はこのファイルだけ見れば進められる**ように書いた作業手順。
なぜそうするのか・壊れたときの判断は `docs/rls-rollout.md`（背景と切り戻し）を見る。

所要 40〜80分。**途中で止めても危険な状態にはならない**（各ステップは独立して切り戻せる）。

---

## 準備するもの

- [ ] Supabase ダッシュボードにログインできること
- [ ] Web版（`kishu-farm.vercel.app`）にログインできること
      - 現在このURLは Vercel Authentication の背後にあるため、**先に Vercel のログイン画面が
        挟まる**（`docs/pre-release-audit.md` の 2）。吉野さんは通れるので作業に支障は無い
- [ ] このリポジトリを手元に開いておく（SQLファイルをコピーするため）
- [ ] ターミナル1つ（最後の検証スクリプト用）

作業中は他の人にアプリを触らせない。吉野さん1人なら気にしなくてよい。

**開いておくファイル（4つ）** — すべて `scripts/migrations/` の中:

| | ファイル | 使う場面 |
|---|---|---|
| A | `2026-08-02-rls-policies.sql` | 本体。手順2〜9で少しずつ使う |
| B | `2026-08-23-rls-crop-advice.sql` | 手順8 |
| C | `2026-09-05-rls-auth-hook-policy.sql` | 手順10（必須） |
| D | `2026-09-05-rls-storage-fix.sql` | 手順11 |

**Aの 3) Storage ブロック（L173以降）は使わない。** Dが差し替え版。

---

## 手順1: バックアップの確認（3分）

1. https://supabase.com/dashboard を開く
2. プロジェクト（farm-app のもの）をクリック
3. 左サイドバーの **Database** をクリック
4. その中の **Backups** をクリック
5. 直近の日付のバックアップが一覧にあることを目視で確認する

無ければ、この後の作業は延期して先にバックアップを取ること。

---

## 手順2: Hook 関数を作る（3分）

1. 左サイドバーの **SQL Editor** をクリック
2. 右上（または左上）の **＋ New query** をクリック
3. 手元の **A `2026-08-02-rls-policies.sql` の L17〜L43** をコピーして貼り付ける
   - `create or replace function public.custom_access_token_hook(event jsonb)` の行から
   - `grant select on table public.users to supabase_auth_admin;` の行まで
4. **Run** をクリック（`Ctrl + Enter` / Mac は `Cmd + Enter` でも同じ）
5. 下に **Success. No rows returned** と出れば成功

エラーが出たら、貼り付け範囲が途中で切れていないか確認する（`$$;` まで入っているか）。

---

## 手順3: Hook をダッシュボードで有効化する（3分）

**ここを飛ばすと以降が全部意味を失う。**

1. 左サイドバーの **Authentication** をクリック
2. その中の **Hooks** をクリック
   - 見つからない場合は Authentication の設定画面内。Supabase のバージョンによって
     「Auth Hooks」と表示されることもある
3. **Customize Access Token (JWT) Claims** の欄を探す
4. その欄の **Enable** のトグルをオンにする
5. Type（種類）で **Postgres Function** を選ぶ
6. Schema は **public**、Function は **custom_access_token_hook** を選ぶ
7. **Save** をクリック

---

## 手順4: ヘルパー関数を作る（2分）

1. **SQL Editor** に戻る（左サイドバー）
2. **＋ New query**
3. **A の L48〜L54** を貼り付ける
   - `create or replace function public.jwt_organization_id()` から `$$;` まで
4. **Run**

---

## 手順5: ログインし直して、JWTにクレームが入ったか確認する（5分）

**この確認が通るまで先に進まない。** 通っていない状態でポリシーを当てると、
全データが見えなくなる。

1. Web版（`kishu-farm.vercel.app`）を開いて **ログアウト**する
2. もう一度 **ログイン**する
3. `F12`（Mac は `Cmd + Option + I`）で開発者ツールを開く
4. **Network** タブをクリック
5. 画面を適当にリロードするか、タブを切り替えて通信を発生させる
6. 一覧から `supabase.co` を含むリクエストを1つクリックする
7. **Headers** の中の **Request Headers** を見る
8. `authorization: Bearer eyJhbGci...` の `eyJ` から始まる長い文字列を**すべてコピー**する
9. https://jwt.io を開き、左の Encoded 欄に貼り付ける
10. 右の Payload（青い部分）に **`"organization_id": "..."`** の行があることを確認する

**あったら次へ。無かったら手順3をやり直す**（Hook が有効化されていない）。

> このトークンは手順12でも使うので、メモ帳などに貼って残しておくと楽。

---

## 手順6: テーブルを1つずつ適用する（15〜25分）

ここからが本番。**1テーブル流すごとに Web版をリロードして確認**する。
まとめて流すと、どこで壊れたか分からなくなる。

コピーする範囲は、A の中の **`-- == テーブル名 ==` の行から、次の `-- ==` の行の直前まで**。

### 進め方（1テーブルごとに繰り返す）

1. **SQL Editor** → **＋ New query**
2. 対象ブロックを貼り付けて **Run**
3. **Success** を確認
4. **Web版のタブをリロード**して、そのデータが今までどおり表示されるか見る
5. 問題なければ次のテーブルへ

### 順番とチェックリスト

影響の小さいものから並べてある。**この順番どおりにやる。**

- [ ] `crops`（L85〜L88）→ 作物の一覧が出るか
- [ ] `fields`（L91〜L94）→ 圃場の一覧が出るか
- [ ] `pesticides`（L109〜L112）→ 農薬の一覧が出るか
- [ ] `reports`（L97〜L100）→ **記録タブに作業記録が出るか**（一番大事）
- [ ] `schedules`（L103〜L106）→ 予定が出るか
- [ ] `comments`（L115〜L118）→ 記録を開いてコメントが出るか
- [ ] `settings`（L121〜L124）
- [ ] `projects`（L127〜L130）→ 計画ガントが出るか
- [ ] `tickets`（L133〜L136）
- [ ] `ai_outputs`（L139〜L142）→ 分析タブのAI履歴が出るか
- [ ] `daily_weather`（L145〜L148）→ 分析タブの天気が出るか
- [ ] `work_categories`（L152〜L154）→ 記録フォームの作業種別が出るか
- [ ] `pesticides_master` と `pesticide_registrations`（L158〜L165）→ 農薬の適用情報が出るか
- [ ] `organizations`（L169〜L171）

> **`users` はまだやらない。** 一番危ないので手順9・10でまとめてやる。

### 途中で「データが全部消えた」ら

慌てず、**そのテーブルだけ**切り戻す。SQL Editor で以下を実行（`<テーブル名>` を差し替え）:

```sql
drop policy if exists <消えたテーブル>_all_own_org on <消えたテーブル>;
create policy allow_all on <消えたテーブル> for all using (true) with check (true);
```

そのうえで一度ログアウト→ログインし直して直るか見る。直れば手順5の確認漏れ。
判断表は `docs/rls-rollout.md` の「切り戻しの判断基準」にある。

---

## 手順7: device_tokens を適用する（2分）

プッシュ通知の端末トークン表。まだ実行していなければここで流す。

1. **SQL Editor** → **＋ New query**
2. `scripts/migrations/2026-08-04-device-tokens.sql` を**全部**貼り付けて **Run**
3. 既に実行済みなら何も壊れない（`if not exists` / `drop policy if exists` で冪等）

---

## 手順8: 相談スレッド2表を適用する（3分）

**Aには入っていない別ファイル。飛ばすと「他組織の相談内容が読める」状態が残る。**

1. **SQL Editor** → **＋ New query**
2. **B `2026-08-23-rls-crop-advice.sql`** を**全部**貼り付けて **Run**
3. アプリまたは Web版で作物の相談スレッドを開き、過去のやりとりが表示されるか確認

---

## 手順9: users を適用する（5分）

**ここが一番危ない。** 失敗するとログインできなくなる。
ブラウザのタブを1つ、**ログイン済みのまま開いておく**こと（切り戻し操作用ではなく、
壊れたことにすぐ気づくため）。

1. **SQL Editor** → **＋ New query**
2. **A の L67〜L82** を貼り付ける
   - `drop policy if exists allow_all on users;` から
   - `grant select (login_id, email) on users to anon;` まで
   - **途中で区切らず一気に流す**（列制限の grant まで含めて1回で）
3. **Run**
4. **すぐに別のシークレットウィンドウで Web版を開き、ログインできるか試す**

**ログインできなくなったら即座に切り戻す:**

```sql
drop policy if exists users_select_own_org on users;
drop policy if exists users_select_login_lookup on users;
drop policy if exists users_insert_own_org on users;
drop policy if exists users_update_own_org on users;
drop policy if exists users_delete_own_org on users;
grant select on users to anon;
create policy allow_all on users for all using (true) with check (true);
```

---

## 手順10: Auth Hook 用のポリシーを入れる（必須・2分）

**ここを飛ばすと、1時間後に全員が全データを見失う。**
手順9で `users` に RLS が効いた結果、JWT を発行する Hook 自身が `users` を
読めなくなるため。理由の詳細は `docs/pre-release-audit.md` の 15。

1. **SQL Editor** → **＋ New query**
2. **C `2026-09-05-rls-auth-hook-policy.sql`** を**全部**貼り付けて **Run**
3. Web版で **ログアウト → ログイン**し直す
4. **手順5をもう一度やる**（Network タブ → トークンをコピー → jwt.io →
   `organization_id` があるか）

**ここでクレームが消えていたら、手順10が効いていない。** Cを流し直す。

---

## 手順11: Storage を適用する（3分）

**Aの 3) ブロックは使わない。Dを使う。**

1. **SQL Editor** → **＋ New query**
2. **D `2026-09-05-rls-storage-fix.sql`** を**全部**貼り付けて **Run**
3. Web版で作業記録を開き、**添付写真が今までどおり表示されるか**確認
4. 記録を1件作って**写真をアップロードできるか**も確認する

写真のアップロードが失敗する場合は、D のファイル末尾のコメントにある
`report_images_select_own_upload` のポリシーを追加する（1文だけ書いてある）。

---

## 手順12: 検証スクリプトを流す（5分）

ターミナルで、このリポジトリのルートに移動して実行する。

**必要な値の場所**（Supabase ダッシュボード → 左サイドバー **Settings** → **API**）:
- Project URL → `SUPABASE_URL`
- Project API keys の **anon public** → `SUPABASE_ANON_KEY`

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJ..."
bash scripts/verify-rls.sh
```

**PASS だけになれば成功。** 読み取りしかしないのでデータは変わらない。

2組織目のテストユーザーがある場合は、そのユーザーでログインして手順5の方法で
トークンを取り、越境テストまで実行する:

```bash
export JWT_ORG2="eyJ..."
export ORG1_REPORT_ID="123"   # 既存の記録のID（任意）
bash scripts/verify-rls.sh
```

2組織目がまだ無ければ越境の項目は SKIP になる。それでも
「anonキーだけで全データが読める」という一番大きな穴が塞がったことは確認できる。

**FAIL が1つでもある間は公開しない。**

---

## 手順13: アプリ側の確認（5分）

1. iPhone のアプリでいったん**ログアウト → ログイン**する
   （古いJWTには `organization_id` が入っていないため必須）
2. ホーム・記録・分析・管理の4タブを開いて、データが出るか確認
3. 記録を1件作って保存できるか確認
4. 作物の相談スレッドを開いて過去のやりとりが出るか確認

> アプリのAI機能は現時点で本番では動かない（`docs/pre-release-audit.md` の 14）。
> ここでは AI 以外が動けばよい。

---

## 手順14: 1時間後にもう一度確認する（3分）

**これが最後の関門。** アクセストークンは1時間ほどで自動更新されるので、
更新後のトークンにもクレームが入っているかを見る。

1. 1時間以上経ってから Web版を開く（ログアウトはしない）
2. 手順5と同じ方法で、Network タブから今のトークンを取る
3. jwt.io で `organization_id` があることを確認
4. データが今までどおり見えていることを確認

**ここまで通れば RLS 完了。**

---

## 完了後にやること

- [ ] `docs/rls-rollout.md` の「実施記録」に日付と結果を追記
- [ ] `docs/multitenancy-progress.md` の残作業からRLS項目を消す
- [ ] `docs/pre-release-audit.md` の 1 を対応済みにする
- [ ] **次のステップに進める**: 2 + 14（kishufarm.com の接続と `EXPO_PUBLIC_API_BASE`）が
      RLS 完了待ちだったので、ここで解除される。
      手順は `docs/decisions/20260905-privacy-policy-url-domain.md`

---

## 困ったときの早見表

| 症状 | 原因 | 対処 |
|---|---|---|
| そのテーブルのデータが全部消えた | JWT に `organization_id` が無い | ログアウト→ログイン。直らなければそのテーブルだけ切り戻す（手順6） |
| 一部の行だけ見えない | その行の `organization_id` が NULL か別組織 | ポリシーは正しい。データ側の問題なので切り戻さない |
| ログインできなくなった | 手順9 | 即切り戻す（手順9のSQL） |
| 適用直後は平気だったのに1時間後に全部消えた | 手順10の未実施 | Cを流してログインし直す |
| 写真が表示されない | 手順11 | Dを流し直す。それでも駄目ならバケットが private になっていないか確認 |
| 写真をアップロードできない | 手順11 | Dの末尾コメントの `report_images_select_own_upload` を追加 |
