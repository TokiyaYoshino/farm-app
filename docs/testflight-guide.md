# TestFlight 配信フロー（実機に配るまで）

審査に出す前に、自分と関係者の実機で動かすための手順。
所要時間の目安は **Apple Developer の登録待ちを除いて 2〜4時間**（ビルド待ちが大半）。

TestFlight は「App Store Connect にビルドをアップロードし、テスターに配る」仕組み。
アプリ審査（公開審査）とは別で、内部テスターへの配信は審査なしで即日使える。

---

## 全体像

```
0. 前提を埋める（環境変数の登録・Apple Developer 登録）
1. EAS にログイン → プロジェクト作成（projectId 発行）
2. App Store Connect にアプリ枠を作る
3. production ビルド（クラウドで20〜40分）
4. アップロード（eas submit）
5. TestFlight でテスターに配る → 実機で確認
```

Mac に Xcode は不要（EAS のクラウドでビルドする）。現状この Mac には
Command Line Tools のみ入っており、それで問題ない。

---

## 0. 前提（ここを飛ばすと動かないアプリができる）

### 0-a. EAS に環境変数を登録する ★必須

`expo-prototype/.env` は git 管理外で、**EAS Build はクラウド上で動くため .env を
アップロードしない**。登録せずにビルドすると、Supabase に接続できず
ログイン画面から先に進めないアプリが出来上がる（TestFlight で初めて気づくと痛い）。

`.env` の実際の値を使って、手順1のログイン後に実行する:

```bash
cd ~/farm-app/expo-prototype

# .env の中身を確認（値をコピーする）
cat .env

npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_URL --value "<URLの値>" \
  --visibility plaintext \
  --environment development --environment preview --environment production

npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon keyの値>" \
  --visibility sensitive \
  --environment development --environment preview --environment production

# 登録できたか確認
npx eas-cli env:list
```

`--visibility` の使い分け: URL は `plaintext`、anon key は `sensitive`
（ダッシュボード上でマスクされる）。anon key は元々クライアントに埋まる公開前提の
キーなので `secret` にする必要はない（`secret` はビルドログからも読めなくなる代わりに
後から値を確認できない）。

`eas.json` の各プロファイルに `"environment"` を指定済みなので、
production ビルドは production の変数を読む。

### 0-b. Apple Developer Program に登録 ★必須

- https://developer.apple.com/programs/ から登録（**年 $99**）
- **個人名義**なら支払い後すぐ〜数日で有効化
- **法人名義**は D-U-N-S 番号が必要で、取得に1〜2週間かかることがある
- 有効化されると https://appstoreconnect.apple.com にアクセスできる

登録が要るのは TestFlight も含めて実機配信全般。無料アカウントでは配れない。

### 0-c. Expo アカウント

https://expo.dev で無料登録（EAS Build の無料枠あり。待ち時間は長め）。

### 0-d. できれば先に済ませたいもの

| 項目 | 理由 |
|---|---|
| RLS の適用（`docs/rls-rollout.md`） | TestFlight は関係者に配るので、他組織データが見える状態のまま配りたくない |
| `public/privacy.html` の運営者名・連絡先 | TestFlight 段階では未記入でも配信できる。公開審査までに必須 |
| Vercel Production の `OPENAI_API_KEY` | 未設定だと実機でAI4機能が失敗する |

RLS 適用時は **Auth Hook 設定 → 全員再ログイン** の順を守ること。逆にすると
全データが見えなくなる。

---

## 1. EAS のセットアップ

```bash
cd ~/farm-app/expo-prototype

npx eas-cli login          # Expo アカウント
npx eas-cli init           # app.json に extra.eas.projectId が追記される
```

`eas init` は必須。**`extra.eas.projectId` が無いとプッシュ通知のトークンが取得できない**
（`lib/push.ts` がこの値を使う）。

> **注意**: この Mac は `~/.npm` のキャッシュ権限が壊れており、素の `npx` が
> `EACCES` で失敗する。頭に `npm_config_cache=/tmp/npm-cache-farmapp` を付けるか、
> 根治するなら一度だけ `sudo chown -R $(whoami) ~/.npm` を実行する。
> 以降のコマンド例では省略しているので、失敗したら付けて再実行すること。

`eas init` 後、`app.json` の差分（projectId）はコミットしておく。

---

## 2. App Store Connect にアプリ枠を作る

https://appstoreconnect.apple.com > マイApp > **＋** > 新規App

| 項目 | 値 |
|---|---|
| プラットフォーム | iOS |
| 名前 | 農作業レポート |
| プライマリ言語 | 日本語 |
| バンドルID | `com.kishufarm.farmreport` |
| SKU | 任意（例 `farmreport-001`）。外部に出ない管理用ID |

バンドルIDの選択肢に出てこない場合は、先に
https://developer.apple.com/account/resources/identifiers で
`com.kishufarm.farmreport` を Identifier として登録する
（`eas build` が自動で作ることもあるので、手順3の後に見ると出ていることが多い）。

**バンドルIDは後から変更できない**。`com.kishufarm.farmreport` で確定して良いか、
ここで決めること。

---

## 3. ビルド

TestFlight に出すのは `production` プロファイル。

```bash
npx eas-cli build --platform ios --profile production
```

初回は対話で以下を聞かれる:

1. **Apple アカウントでログインするか** → Yes。Apple ID とパスワード、2要素認証コードを入力
2. **証明書 / プロビジョニングプロファイル** → EAS に生成・管理させる（推奨）
3. **Push Notifications のキー** → EAS に生成させる（プッシュ通知に必要）

その後クラウドでビルドが走る。**無料枠だとキュー待ち込みで20〜60分**。
ログURLが表示されるので進捗はブラウザで見られる。端末側で待つ必要はない。

### プッシュ通知を先に検証したい場合

`production` ビルドは TestFlight 経由でしか入れられない。すぐ実機で試したいなら
`development` プロファイルの方が速く回せる:

```bash
npx eas-cli device:create      # 実機のUDIDを登録（QRを読んでプロファイルを入れる）
npx eas-cli build --platform ios --profile development
```

こちらはビルド完了後に表示されるURLから直接インストールできる。
（Expo Go ではプッシュ通知が受信できないため、通知の確認にはどちらかのビルドが必要）

---

## 4. アップロード

```bash
npx eas-cli submit --platform ios --latest
```

`--latest` は直近のビルドを対象にする。App Store Connect の API キーか
Apple ID でのログインを聞かれる。

アップロード後、App Store Connect 側で **10〜30分「処理中」** になる。
処理が終わるとメールが来て、TestFlight タブにビルドが現れる。

---

## 5. TestFlight で配る

App Store Connect > 対象アプリ > **TestFlight** タブ

### 輸出コンプライアンス

`app.json` に `ITSAppUsesNonExemptEncryption: false` を設定済みなので、
通常は質問なしで通る。聞かれたら「暗号化を使用していない（HTTPSのみ）」を選ぶ。

### 内部テスト（自分＋社内。審査なし・即日）

1. 「内部テスターグループ」を作成
2. App Store Connect のユーザーとして追加した人だけが対象（最大100人）
3. ビルドをグループに割り当てる → テスターに招待メールが届く

**内部テストは Apple の審査を通らないので、割り当てた直後に配信される。**
まずはこれで自分の実機に入れるのが最短。

### 外部テスト（社外の人に配る場合。要審査）

- 最大10,000人、メールアドレスまたは公開リンクで招待
- **初回のビルドは Apple の「Beta App Review」を通る**（通常1〜2日）
- 「テスト情報」に何をテストしてほしいか、連絡先、デモアカウントの記載が必要

農場の従業員に配るだけなら、その人たちを App Store Connect のユーザーに
追加して内部テストにするのが早い。

### テスター側の操作

1. 招待メールのリンクを開く
2. App Store から **TestFlight アプリ**をインストール
3. TestFlight 内から「農作業レポート」をインストール

ビルドの有効期限は **90日**。切れたら新しいビルドを配る。

---

## 6. 実機での確認項目

```
□ ログイン（login_id → パスワード）
□ 作業記録の作成（写真添付・GPSで圃場位置設定）
□ 天気の自動取得
□ カレンダー / 記録一覧 / 分析（グラフ表示）
□ 計画ガント（横向きに回してラベル列・今日ラインが出るか）
□ AI 4機能（日報生成・検索チャット・画像診断・防除助言）
  → 失敗するなら Vercel Production の OPENAI_API_KEY 未設定を疑う
□ プッシュ通知
  → 通知許可ダイアログで「許可」
  → SQL Editor で device_tokens に行が入ったか確認
  → 別ユーザー（Web版）から自分の記録にコメント or @自分名
  → 通知が届き、タップで該当の記録が開くか
□ ログアウト → device_tokens の行が消えるか
□ 機内モードで起動 → エラー画面と「再試行」が出るか
```

プッシュ通知が届かない場合の切り分けは `docs/push-notifications.md` を参照。
Edge Function のデプロイと Webhook 登録が済んでいないと当然届かない。

---

## 7. 2回目以降

コードを直したら:

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

`eas.json` の production は `autoIncrement: true` なので、ビルド番号は自動で上がる。
`app.json` の `version`（0.1.0）は自分で上げる。同じバージョン+同じビルド番号は
アップロードできない。

---

## つまずきやすい点

| 症状 | 原因 |
|---|---|
| ログインできない・データが空 | **手順0-a の環境変数を EAS に登録していない**（最頻） |
| プッシュ通知が来ない | `eas init` 未実施で `projectId` が無い / Edge Function 未デプロイ / Webhook 未登録 |
| `npx` が EACCES で落ちる | `~/.npm` の権限。`npm_config_cache=/tmp/npm-cache-farmapp` を付ける |
| バンドルIDが選べない | Apple Developer 側で Identifier 未登録。手順2の注記を参照 |
| アップロードが弾かれる | バージョン+ビルド番号の重複。`version` を上げる |
| 全データが見えなくなった | RLS 適用後に再ログインしていない（`docs/rls-rollout.md` 手順2） |

---

## 進捗記録

（実施ごとに追記）

- 2026-08-04: 本手順書を作成。EAS 未ログイン・Apple Developer 未登録のため
  手順0以降は未着手。`eas.json` に `environment` 紐付けを追加済み
