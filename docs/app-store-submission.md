# App Store 申請手順

対象: `expo-prototype/`（Expo SDK 54 / iOS）。Android（Google Play）は後回し。

**先に実機で動かしたい場合は `docs/testflight-guide.md`**（EAS のセットアップから
TestFlight 配信まで）。本書は公開審査に出すための入力項目をまとめたもので、
手順3〜5は TestFlight ガイドと重複する。

## 前提: 先に終わらせること

1. **RLS の実ポリシー化** — `docs/rls-rollout.md`。現状 `allow_all` のため、
   anon キーを知っていれば他組織のデータが読める。**公開前に必須**
2. **プライバシーポリシーの運営者情報** — `public/privacy.html` の TODO コメント箇所に
   正式名称と連絡用メールアドレスを記入する。審査で連絡先の実在性が見られる
3. **Vercel Production の `OPENAI_API_KEY`** — Development のみ設定されている疑いがある。
   本番のAI機能（アプリは本番APIを叩く）が動かないと審査で機能不全と判断されうる

**上記以外にも公開を止める問題が複数ある。着手前に `docs/pre-release-audit.md` を読むこと**
（2026-09-05 の監査。プライバシーポリシーURLに審査担当が到達できない・作業写真が
RLS適用後も公開のまま・アカウント削除導線が無い・パスワード再設定が失敗する、など）。

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

### アプリ情報
- 名前: 農作業レポート
- サブタイトル（30字以内）: 例「農場の作業記録・予定・分析」
- カテゴリ: ビジネス（または仕事効率化）
- プライバシーポリシーURL: `https://kishu-farm.vercel.app/privacy`
  （独自ドメイン運用中なら `https://kishufarm.com/privacy`）

### スクリーンショット（必須）
6.7インチ（iPhone 15 Pro Max 等）が最低1セット必要。
実機のスクショか、シミュレータで撮影する。推奨する構成:

1. ホーム（今日の天気・予定）
2. 記録の入力フォーム
3. 分析タブ（KPI・グラフ）
4. 計画ガント（横向き）
5. AI機能（画像診断 or 防除助言）

デモデータは `node scripts/seed-demo-reports.mjs <ID> <PW>` で投入できる
（`--delete` で撤収。note に `[demo]` が入る）。

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
| 5.1.1(v) | **アプリ内のアカウント削除が必須** | **未対応。`docs/pre-release-audit.md` の 4 を参照** |
| 1.2 | ユーザー生成コンテンツの通報機能 | コメントは同一組織内のみ。閉じた業務利用として説明する |

## 8. 申請後

- 審査は通常24〜48時間。初回は長めに見る
- リジェクト時は Resolution Center で理由が来る。修正して再提出（ビルド番号が上がる）
- 承認後、リリースは手動公開にしておくと日付を選べる

## 進捗記録

（実施ごとに追記）

- 2026-08-04: 申請準備の実装完了（プッシュ通知・EAS設定・プライバシーポリシー）。
  Apple Developer 未登録のため、ここから先はユーザー作業待ち
