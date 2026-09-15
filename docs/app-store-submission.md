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
2. **プライバシーポリシーの運営者情報** — `public/privacy.html` の TODO コメント箇所に
   正式名称と連絡用メールアドレスを記入する。審査で連絡先の実在性が見られる
3. **Vercel Production の `OPENAI_API_KEY`** — Development のみ設定されている疑いがある。
   本番のAI機能（アプリは本番APIを叩く）が動かないと審査で機能不全と判断されうる
4. **worker アカウントを1つ配る** — 審査の要件ではないが、**0.1.0 のリリース条件に含めた**。
   worker が0人のままだと、出したあとの判断材料が次も得られない
   （`docs/decisions/20260912-release-line.md`）

**逆に、前提に入れないもの**: 2組織目での越境アクセス実地テストは**他農場へ配る前**の
必須項目であって、審査に出るのは霧珠ファームの1組織なので App Store 公開の前提ではない。

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

## 6. App Store Connect の入力項目（0.1.0 ドラフト・2026-09-15）

そのまま貼れる形にしてある。**【オーナー記入】** の箇所だけ値を入れる。
書き方の決まり: 地域名・特定品目を出さない／入口に「AI」の語を出さず成果で書く／
自動生成であることは注意書きで明示する（`CLAUDE.md` の「AI機能の見せ方」）。
字数は `node` で数えた値（表の右列）。

### アプリ情報

| 項目 | 入力値 | 字数 |
|---|---|---|
| 名前（30字） | 農作業レポート | 7 |
| サブタイトル（30字） | 農場の作業記録をチームで共有 | 14 |
| プライマリカテゴリ | ビジネス | — |
| セカンダリカテゴリ | 仕事効率化 | — |
| サポートURL | `https://kishufarm.com/support`（`public/support.html`） | — |
| プライバシーポリシーURL | `https://kishufarm.com/privacy` | — |
| 著作権 | 2026 【オーナー記入: 運営者名】 | — |

### プロモーション用テキスト（170字）

```
作業者がスマホで残した作業・農薬・写真が、そのまま農場全体の記録になります。記録をもとに、日報のまとめ、次の散布時期の目安、農薬の使用回数の確認まで行えます。
```

### 説明文（4000字）

```
農作業レポートは、農場の作業記録・予定・分析をチームで共有する業務用アプリです。
アカウントは農場の管理者が発行します。

■ 作業を記録
・作物・圃場・作業の種類・作業時間を選んで記録
・使った農薬と使用量、写真、メモを添付
・圃場の位置は現在地から登録。記録した時間帯の天気は自動で残ります
・メモはキーボードの音声入力で話して書けます。書いた内容は項目に振り分けられます

■ 農薬の使用回数
・登録された農薬の情報と照らし合わせ、作物ごとの使用回数を確認できます
・照合できない場合はその旨を表示し、推測で数えません

■ 相談
・作付けごとに、次にやる作業を相談できます。やりとりは作付けに残ります
・その作付けの記録と農薬の登録内容をふまえて答えます
・写真で病害虫を調べる、過去の記録を調べる、もここから行えます

■ 日報・次の散布時期
・その日の記録を日報にまとめます
・天気予報とこれまでの散布実績から、次の散布時期の目安を出します

■ 予定・分析
・作付けの予定をガントチャートで管理
・収穫量・作業時間・防除回数を、年と作物で切り替えて前年同時期と比べられます

■ チームで使う
・記録と予定にコメントを付けられます。メンションされると通知が届きます
・管理者・作業者・閲覧者の権限を分けて使えます

【ご注意】
相談・写真での病害虫の判定・散布時期の目安は、記録をもとに自動で作成する参考情報です。
農薬を使う前には、必ずラベルの登録内容（適用作物・使用時期・使用回数）を確認してください。
```

### キーワード

```
農業,農家,営農日誌,作業日誌,栽培記録,圃場,防除,農薬,散布,日報,GAP
```

**上限は「100」だが、字数か バイト数か は資料によって割れている。** バイト数でも収まる長さにしてある
（下の計測値）。入力欄の残数表示で最終確認し、溢れたら後ろ（GAP→日報）から削る。
「作業記録」はサブタイトルと重複するので外した。

**計測値（2026-09-15・`node` で本文ブロックを数えた）**

| 項目 | 上限 | 字数 | バイト数（UTF-8） |
|---|---|---|---|
| プロモーション用テキスト | 170字 | 79 | 237 |
| 説明文 | 4000字 | 660 | 1904 |
| キーワード | 100 | 39 | 91 |
| 審査用備考（英語） | 4000字 | 899 | 899 |
名前・サブタイトルに含まれる語（農作業・レポート・記録・チーム）は重複しても効かないので入れていない。

### スクリーンショット

**撮影済みの5枚を使う**: `docs/appstore/screenshots/`（1320×2868＝6.9インチ枠。iPhone 17 Pro Max シミュレータ）。

| # | ファイル | 画面 |
|---|---|---|
| 1 | `05-home.png` | ホーム |
| 2 | `03-input.png` | 作業を記録 |
| 3 | `01-soudan-list.png` | 相談（一覧） |
| 4 | `02-soudan-chat.png` | 相談（会話） |
| 5 | `04-bunseki.png` | 分析 |

並びは「毎日開く画面 → 本丸の記録 → 差別化 → 分析」。ファイル名の番号は撮影順。
農薬の使用回数・ガント・写真診断などを**撮らなかった理由**は `docs/handoff-appstore-release.md` 5章
（実装ではなく実績データが無いことが原因。0.2.0 で差し替える）。
**Web の画面は使わない**（見た目が違い、Guideline 2.3.3 に触れる）。

### 審査用情報（App Review Information）

- サインイン情報: **【オーナー記入: 審査用デモアカウントの ID / パスワード】**
  （Web → 右上のユーザーアイコン → 管理画面 で作る。作業者権限で、作物・圃場・農薬が1件以上ある組織に入れる）
- 連絡先: **【オーナー記入: 氏名・電話・メール】**
- 備考（英語。審査担当が読む前提）:

```
This is a business app for farm staff to record field work (tasks, pesticide use, photos) and share it within their farm.

- There is no in-app sign-up. Accounts are issued by each farm's administrator from the web admin page. Please use the demo account above (worker role).
- Because accounts are not created in the app, there is no in-app account creation flow. Users can request account deletion from their administrator or via the support URL.
- Comments are visible only to members of the same farm organization. There is no public feed or content shared outside the organization.
- The consultation, pest photo check, and spray timing features generate reference information from the farm's own records. The spray timing and pesticide registration screens tell users to follow the product label.
- Location is requested only when the user taps "set from current location" to register a field.
```

### App のプライバシー（Data Collection の申告）

`public/privacy.html` と実装（`expo-prototype/`）の両方に合わせた。**トラッキングは全項目「いいえ」**
（広告用識別子は取得せず、他社データとの結合もしない）。**すべて「ユーザーに紐付けられる」**。

| Apple の分類 | 具体的なデータ | 用途 | 根拠 |
|---|---|---|---|
| 連絡先情報 › 名前 | 氏名 | アプリの機能 | `users` 表 |
| 連絡先情報 › メールアドレス | メール | アプリの機能 | 認証 |
| 位置情報 › 正確な位置 | 圃場の緯度経度（「現在地から設定」を押したときのみ） | アプリの機能 | `ManageScreen.tsx` / `FieldMapSheet.tsx` |
| ユーザコンテンツ › 写真またはビデオ | 記録の添付写真・診断用の写真 | アプリの機能 | Storage `report-images` |
| ユーザコンテンツ › その他のユーザコンテンツ | 作業記録・メモ・コメント・相談のやりとり | アプリの機能 | `reports` / `comments` / `crop_advice_messages` |
| 識別子 › ユーザID | ユーザーID | アプリの機能 | `created_by` 等 |
| 識別子 › デバイスID | Expo プッシュトークン | アプリの機能 | `device_tokens` |
| 使用状況データ › 製品の操作 | どの画面から助言・診断を使ったか | アナリティクス | `ai_outputs.entry_point` |

**「使用状況データ › 製品の操作」は申告する。** `entry_point` は利用者に紐付く操作ログで、
撤退条件の判定（＝アナリティクス）に使っているため。privacy.html の利用目的「機能改善」に含まれる。
委託先（Supabase・Vercel・OpenAI・Open-Meteo・Expo）はサービス提供者なので「第三者への共有」には当たらないが、
申告対象の「収集」には含める。

### 年齢制限（質問票）

2025-07 に改定され（区分は 4+ / 9+ / 13+ / 16+ / 18+）、2026-07 にソーシャルメディア機能の設問が追加された。
**設問の文面は入力時に画面で確認する。** 当てはまる実態は次のとおり:

| 論点 | 本アプリの実態 |
|---|---|
| 暴力・性的表現・ギャンブル・医療 | なし |
| 利用者が作ったコンテンツ／メッセージ | あり（コメント・メンション）。**同一組織内のみ** |
| ソーシャルメディア機能（フィードや発見の仕組みで拡散） | なし（フィード・公開範囲の拡大・他組織の発見は無い） |
| 自動生成の応答（相談） | あり。農作業に関する内容に限定 |
| 制限の無いWebアクセス | なし |

判定結果が 4+ にならない場合も、そのまま受け入れる（不正確な申告はメタデータ不一致として扱われる）。

### 輸出コンプライアンス
`app.json` に `ITSAppUsesNonExemptEncryption: false` を設定済み（HTTPS のみの利用）。
これにより毎回の質問がスキップされる。

## 7. リジェクトされやすい点

| ガイドライン | 内容 | 本アプリの状態 |
|---|---|---|
| 2.1 | デモアカウント未提供 | 6章の審査用情報に必ず記載する |
| 2.3.3 | スクショが実物と違う | Expo シミュレータで撮影済み。Web の画面は使わない |
| 4.2 | 機能が最小限／WebViewラッパー | ネイティブ実装済み（WebView案は不採用: `docs/decisions/20260801-...`） |
| 5.1.1 | 権限の説明文が不十分 | `app.json` の `infoPlist` に日本語で記載済み |
| 5.1.1(v) | **アカウント削除をアプリ内で始められること** | 下記。**要注意** |
| 1.2 | ユーザー生成コンテンツの通報機能 | コメントは同一組織内のみ。閉じた業務利用として説明する |
| — | サポートURLが無い／連絡先が無い | `public/support.html` を用意。連絡先は【オーナー記入】 |

**5.1.1(v) の読み（2026-09-15 時点・確証なし）**: 要件は「アカウント作成に対応するアプリ」が対象で、
本アプリはアプリ内で作成できないため**対象外と読むのが素直**。ただし、管理者発行型のアカウントを
明示的に除外する記述は Apple の公開資料で見つからなかった。また**メール等での削除依頼で済ませてよいのは
「規制の厳しい業種」だけ**とされている。リジェクトされた場合の手当ては、設定画面に「アカウントの削除」行を置き、
削除依頼（管理者への通知＋サポートURL）へ直接つなぐこと。**先回りでは作らない**（3問の①に当たるかは審査結果で確定するため）。

## 8. 申請後

- 審査は通常24〜48時間。初回は長めに見る
- リジェクト時は Resolution Center で理由が来る。修正して再提出（ビルド番号が上がる）
- 承認後、リリースは手動公開にしておくと日付を選べる

## 進捗記録

（実施ごとに追記）

- 2026-08-04: 申請準備の実装完了（プッシュ通知・EAS設定・プライバシーポリシー）。
  Apple Developer 未登録のため、ここから先はユーザー作業待ち
