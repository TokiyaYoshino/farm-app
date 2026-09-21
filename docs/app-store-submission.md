# App Store 申請手順

対象: `expo-prototype/`（Expo SDK 54 / iOS）。Android（Google Play）は後回し。

**先に実機で動かしたい場合は `docs/testflight-guide.md`**（EAS のセットアップから
TestFlight 配信まで）。本書は公開審査に出すための入力項目をまとめたもので、
手順3〜5は TestFlight ガイドと重複する。

## 前提: 先に終わらせること

1. **RLS の実ポリシー化** — 本体は 2026-09-05 に適用済み（`docs/rls-rollout.md` の実施記録）。
   2026-09-12 に anon キーで実測したところ `reports`/`crops`/`crop_advice_messages` は 0 件、
   `users` は 401 で、**残っていた穴は `advice_threads` の1表だけ**だった。
   `scripts/migrations/2026-09-12-rls-anon-leaks.sql` を SQL Editor で流す。**公開前に必須**
2. **運営者情報（プライバシー＋サポートの2箇所）** — `public/privacy.html` と
   `public/about.html` の TODO コメント箇所に、連絡用メールアドレス（必要なら名義）を記入する。
   **必須なのは URL が機能することと、連絡の取れる手段があること**。氏名の記載自体は
   Apple の条文上の必須ではない（下記「名義の扱い」）
3. **Vercel Production の `OPENAI_API_KEY`** — Development のみ設定されている疑いがある。
   本番のAI機能（アプリは本番APIを叩く）が動かないと審査で機能不全と判断されうる
4. **worker アカウントを1つ配る** — 審査の要件ではないが、**0.1.0 のリリース条件に含めた**。
   worker が0人のままだと、出したあとの判断材料が次も得られない
   （`docs/decisions/20260912-release-line.md`）

**逆に、前提に入れないもの**: 2組織目での越境アクセス実地テストは**他農場へ配る前**の
必須項目であって、審査に出るのは霧珠ファームの1組織なので App Store 公開の前提ではない。

## 0. 名義の扱い（どこに出る名前か）

「名前」を求められる場所は3つあり、**公開されるかどうかが違う**。混同しやすいので先に置く。

| # | どこ | 中身 | 公開 | 必須 |
|---|---|---|---|---|
| 1 | App Store Connect の **App Review Information** | 姓・名・電話・メール | **されない**（Apple が審査中に連絡するためだけ） | 必須 |
| 2 | App Store の **販売者名（デベロッパ名）** | Apple Developer Program の登録名義 | **される** | 登録すれば自動的に出る |
| 3 | プライバシーポリシー / サポートページ | 運営者名・連絡先 | される（自分のサイト） | **URLの実在と連絡手段が必須。氏名の記載自体は条文上の必須ではない** |

### 2 が一番効く: 個人名義で登録すると本名が公開される

Apple Developer Program を **Individual（個人）で登録すると、App Store の販売者名に
登録した本人の氏名がそのまま表示される**。屋号や社名を出すには **Organization アカウント**
（個人事業主でも、開業届と **D-U-N-S 番号**があれば取得できる）が要る。

`docs/decisions/20260912-release-line.md` のプレモータム2は「D-U-N-S 待ちを避けるため
**個人名義で出す**」と決めているが、**その帰結として本名が公開される点は書かれていなかった**。
本名を出したくない場合、**分岐は申請前にある**。

- 後から屋号へ変更した実例は複数あるが、**D-U-N-S 取得とアカウント種別の変更を伴い日数がかかる**
- 「アプリを作った後は変更できない」と書く情報源と「変更した」と書く情報源の両方があり、
  **どちらが現行の運用か確定できていない**。変えるつもりなら**出す前に**動くのが安全側

出典（いずれも個人ブログ・実録記事。Apple 公式の条文ではない）:
[App Storeを個人名→屋号にした話（Zenn）](https://zenn.dev/ashimoto/books/1_appleprogram/viewer/example2) /
[個人開発者が本名を出さずに屋号でアプリを出す方法（Zenn）](https://zenn.dev/tomlife43/articles/eee8f6b90b22a1) /
[App Storeのデベロッパ名を本名から屋号に変えた話（note）](https://note.com/kuro_kuro_kuroi/n/n59cb03fd8159)

---

## 1. Apple Developer Program の登録

- https://developer.apple.com/programs/ から登録（$99/年、個人 or 法人）
- 法人の場合は D-U-N-S 番号が必要で、取得に日数がかかる。個人名義なら即日〜数日
- 登録完了後、App Store Connect（https://appstoreconnect.apple.com）にアクセスできる

## 2. アプリの識別子

`app.json` に設定済み:

| 項目 | 値 |
|---|---|
| Bundle Identifier | `com.kishufarm.farmreport` |
| 表示名 | 農作業レポート |
| バージョン | 0.1.0 |

Bundle ID は**一度登録すると変更できない**。上記で問題ないか確認してから進める。

## 3. EAS のセットアップ

```bash
cd ~/farm-app/expo-prototype
npx eas-cli login          # Expo アカウント（無料）
npx eas-cli init           # app.json に extra.eas.projectId が追記される
```

ビルドプロファイルは `eas.json` に定義済み:

- `development` — 開発ビルド（実機デバッグ用。プッシュ通知の確認に必要）
- `preview` — 内部配布
- `production` — App Store 提出用（`autoIncrement` でビルド番号を自動加算）

## 4. 開発ビルドで実機確認

Expo Go ではプッシュ通知が受信できないため、まず開発ビルドを作る。

```bash
npx eas-cli build --platform ios --profile development
```

- 対話で「Apple アカウントでログインするか」を聞かれる → ログインして
  証明書・プロビジョニングプロファイル・Push Key を EAS に管理させる
- 実機を Apple Developer に登録する必要がある（`eas device:create` の案内が出る）
- 完成した `.ipa` のインストールURLが表示される

確認項目は `docs/push-notifications.md` の「動作確認」＋通常機能の一巡（ログイン・
記録作成・写真添付・GPS・AI 4機能・通知・ガント横画面）。

## 5. 本番ビルドと TestFlight

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

`submit` が App Store Connect にアップロードする。処理完了後、TestFlight で
自分の端末にインストールして最終確認する（本番ビルドは開発ビルドと挙動が異なる場合がある）。

## 6. App Store Connect の入力項目

> **文言の確定版は `docs/app-store-listing.md`。** 名前・サブタイトル・キーワード・
> プロモーションテキスト・説明文・スクリーンショットの構成・審査備考は、すべてそこに
> 文字数の実測つきで置いてある。以下は項目の一覧として残す。

### アプリ情報
- 名前: `農作業レポート - 農家の作業日誌`（17字）
- サブタイトル（30字以内）: `作業・農薬・写真の記録と前年比較`（16字）
- キーワード（100字以内）/ プロモーションテキスト（170字以内）/ 説明文: `app-store-listing.md` 1章
- カテゴリ: ビジネス（第2: 仕事効率化）
- プライバシーポリシーURL: `https://kishu-farm.vercel.app/privacy`
  （独自ドメイン運用中なら `https://kishufarm.com/privacy`）
- **サポートURL（必須）**: `https://kishu-farm.vercel.app/about`
- マーケティングURL（任意）: 同上。紹介とサポートを1枚に統合している
  （`docs/decisions/20260920-public-landing-page.md`）

> **申請前に2箇所セットで埋めること**: `public/privacy.html` と `public/about.html` の
> どちらにも「運営者の正式名称・問い合わせ先メールアドレス」の TODO が入っている。
>
> **正確に言うと**: 必須なのは「サポートURL / プライバシーポリシーURL が実在して機能すること」で、
> **そのページに氏名を書けという条文は無い**。ただし連絡の取れる手段（メールアドレス等）が
> 無いページだと 2.1 の指摘対象になりうる。**氏名より、返信できるメールアドレスの方が本体。**
> （以前ここに「片方だけ埋めると落ちる」と書いていたが、根拠のない強い書き方だったので訂正した）

### スクリーンショット（必須）
6.7インチ（iPhone 15 Pro Max 等）が最低1セット必要。
実機のスクショか、シミュレータで撮影する。推奨する構成:

1. ホーム（今日の天気・予定）
2. 記録の入力フォーム
3. 分析タブ（KPI・グラフ）
4. 計画ガント（横向き）
5. AI機能（画像診断 or 防除助言）

デモデータは **`expo-prototype/` から** `node scripts/seed-demo-reports.mjs <ID> <PW>` で
投入できる（`--delete` で撤収。note に `[demo]` が入る）。
**スクリプトの実体は `expo-prototype/scripts/` にある**（リポジトリ直下の `scripts/` ではない）。

**撮る内容とキャプションは `docs/app-store-listing.md` 3章に確定させた。**

### 審査用情報
- **デモアカウント**: 審査担当がログインできる ID/パスワードを必ず記載する。
  ログイン必須アプリは、これが無いと「Guideline 2.1」でリジェクトされる。
  審査用の組織・ユーザーを作ってデモデータを入れておくのが安全
- 備考欄: 「農場の従業員が使う業務アプリで、アカウントは農場管理者が発行します」等、
  一般ユーザーが自由登録できない理由を説明する

### App のプライバシー（Data Collection の申告）
`public/privacy.html` の内容と一致させる。申告する項目:

| データ種別 | 用途 | トラッキング |
|---|---|---|
| 連絡先情報（氏名・メール） | アプリの機能 | なし |
| 位置情報（正確な位置） | アプリの機能 | なし |
| ユーザーコンテンツ（写真・メモ） | アプリの機能 | なし |
| 識別子（デバイスID＝プッシュトークン） | アプリの機能 | なし |

「トラッキング」は全て「いいえ」。広告用識別子は使っていない。

### 輸出コンプライアンス
`app.json` に `ITSAppUsesNonExemptEncryption: false` を設定済み（HTTPS のみの利用）。
これにより毎回の質問がスキップされる。

## 7. リジェクトされやすい点

| ガイドライン | 内容 | 本アプリの状態 |
|---|---|---|
| 2.1 | デモアカウント未提供 | 手順6で必ず記載する |
| 4.2 | 機能が最小限／WebViewラッパー | ネイティブ実装済み（WebView案は不採用: `docs/decisions/20260801-...`） |
| 5.1.1 | 権限の説明文が不十分 | `app.json` の `infoPlist` に日本語で記載済み |
| 5.1.1(v) | ログイン必須の正当性 | 業務用アプリであることを備考で説明 |
| 1.2 | ユーザー生成コンテンツの通報機能 | コメントは同一組織内のみ。閉じた業務利用として説明する |

## 8. 申請後

- 審査は通常24〜48時間。初回は長めに見る
- リジェクト時は Resolution Center で理由が来る。修正して再提出（ビルド番号が上がる）
- 承認後、リリースは手動公開にしておくと日付を選べる

## 進捗記録

（実施ごとに追記）

- 2026-08-04: 申請準備の実装完了（プッシュ通知・EAS設定・プライバシーポリシー）。
  Apple Developer 未登録のため、ここから先はユーザー作業待ち
