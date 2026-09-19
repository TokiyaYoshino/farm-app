# 農業アプリのASO（日本のApp Store / Google Play）

> **調査日: 2026-09-19**
>
> **⚠️ 重大な制約（最初に読むこと）**
> この調査環境のネットワーク egress プロキシが、**apps.apple.com / play.google.com / applion.jp / app-liv.jp / dotapps.jp / smartagri.jp / noukiguou.com / getgamba.com / agri-note.jp / agrihub-solution.com / appfollow.io / apptweak.com / sensortower.com** など、ストア本体とアプリ系メディアのほぼ全てを **EGRESS_BLOCKED で遮断**した。到達できたのは `developer.apple.com` のみ。
> そのため **競合の評価点・レビュー件数・ランキング順位・サブタイトル原文・レビュー本文の逐語引用は、一次ソースから確認できていない。**
> 本ノートで「確認済」と書いたのは (a) developer.apple.com の原文、(b) 検索エンジンが返したページタイトル（＝ストア掲載タイトルそのもの）である。それ以外の数値・文面は**検索エンジンの要約経由の二次情報**で、原ページで裏取りしていない。必ずその旨を各項目に明記した。
> 申請前に、後述の「手作業で確認すべきURL一覧」を人間が開いて確定させること。

---

## Q1. 日本語で農業記録アプリを探すときのキーワードの検索需要

### Takeaway
具体的な検索ボリューム（推計値含む）は**一つも取得できなかった**。ただし「どの語がストア上で実際に使われているか」は、競合のアプリ名文字列から実測的に読み取れる。App Store 検索は名前・サブタイトル・キーワード・カテゴリのみをインデックスするため、競合が名前に入れている語＝彼らが検索需要があると判断した語、というシグナルとして使える。

### Cited Findings
- App Store の検索結果は「text relevance（アプリの **title, subtitle, keywords, primary category** のマッチ）」と「user behavior（ダウンロード数、評価とレビュー など）」で決まる、と Apple が明記 — [App Store search - Apple Developer](https://developer.apple.com/app-store/search/)
- キーワードフィールドは **100文字**、カンマ区切り・スペースなし、キーワード句内は単語をスペースで区切れる（例: `Property,House,Real Estate`） — [App Store search - Apple Developer](https://developer.apple.com/app-store/search/)
- 競合が実際にアプリ名に入れている語（＝ストア掲載タイトル実測、Q2の表を参照）: **農業日誌 / 圃場管理 / 営農情報 / 農作業 / 農薬 / 記録 / 管理 / 栽培管理 / 日記**
- App Store の全ダウンロードの **65%** が検索由来（Sensor Tower が 2017年5月〜2018年4月のDLを分析）。非ゲームアプリに限ると **69%**、ゲームは56% — [Sensor Tower blog](https://sensortower.com/blog/app-store-download-sources)（※検索要約経由。原ページ遮断）
- 2020年時点では検索経由は **59%** に低下したが依然最大の流入元 — [Sensor Tower blog 2021](https://sensortower.com/blog/app-store-download-sources-report-2021)（※検索要約経由。原ページ遮断）
- Apple 自身も広告ページで「almost 65% of downloads happen directly after a search」と記載 — [Apple Ads - App Store](https://ads.apple.com/app-store)（※検索要約経由）
- AppTweak は「App Store の場合、キーワードボリュームは **Apple 公式の検索人気度指標（search popularity）から直接取得**している」と説明。つまり iOS のボリュームは推計ではなく Apple 由来の指標（0-100 のスケール） — [AppTweak ASOブログ（日本語）](https://www.apptweak.com/ja/aso-blog/app-store-keyword-research-aso)（※検索要約経由。原ページ遮断）
- 日本市場向けの無料/安価なキーワード需要確認手段として **「ASO Japan」アプリ**（キーワードを入れると検索需要・競合の強さ・狙い目度を表示）、**ASOWise**（インディー向け、日本語ローカライズ済）が App Store に存在 — [ASO Japan](https://apps.apple.com/jp/app/id6800411382) / [ASOWise](https://apps.apple.com/jp/app/asowise-aso%E3%82%AD%E3%83%BC%E3%83%AF%E3%83%BC%E3%83%89%E3%83%84%E3%83%BC%E3%83%AB/id6762876018)（※タイトルのみ確認、中身未確認）

### Inferences
- 「農業日誌」と「圃場管理」は**アグリノートが iOS の名前欄に入れている**（`アグリノート – 農業日誌・圃場管理アプリ`）。名前欄は30文字しかない最も貴重な枠で、国内最大級の事業者がそこに置いた2語である以上、**この2語が日本語ASOでの本命キーワードである可能性が高い**（強い状況証拠。ただしボリュームの実測ではない）。
- 「農作業」「農薬」「記録」「管理」は aKnow が名前欄を **ぴったり30文字**まで使って詰め込んでいる語（`aKnow(エイノウ) - 農作業や農薬を農業日誌で記録管理`）。小規模事業者ほど名前欄をキーワードで埋めており、これは「その語で獲れる」と判断している側の行動。
- 逆に「営農管理」「防除記録」「作業日報 農業」は、確認できた範囲では**どの競合も名前欄に入れていない**。競合密度が低い＝取りやすいが、需要も小さい可能性がある。ボリューム未確認のため、ここは ASO Japan / AppTweak の無料枠で申請前に必ず実測すべき。
- 検索の65%（非ゲーム69%）という数字は2018年のもので、2020年に59%へ低下している。**「ストア検索が最大流入」という前提自体は今も妥当だが、「65%」を根拠に計画を立てるのは古い。6割前後と見るのが安全。**

### Gaps
- 「農業日誌」「農作業記録」「農薬 記録」「防除記録」「営農管理」「圃場管理」「農業 アプリ」「作業日報 農業」各語の**検索ボリューム数値（推計・実測とも）は一切取得できなかった**。ASO ツールのデータはログイン必須で、かつ全ツールのドメインが遮断されていた。
- 日本ロケール限定のボリュームデータ（Sensor Tower / data.ai / AppTweak の公開レポート）も取得できなかった。
- **申請前の必須アクション**: App Store Connect のアプリ内 Apple Search Ads（キャンペーン作成画面の Search Match / キーワード提案）を使うと、**Apple 公式の検索ボリューム指標を無料で見られる**（広告を実際に配信しなくても提案画面までは進める）。予算ゼロでも、この画面で上記8語の相対需要を確定させてから申請するのが最も確度が高い。

---

## Q2. 主要キーワードでの競合順位と、上位アプリの名前・サブタイトルの作り方

### Takeaway
**順位データは取得できなかった（ストア遮断のため0件）。** 一方、アプリ名の文字列は検索結果のページタイトルから実測できた。国内競合の名前設計は明確に2系統に分かれる——「ブランド名のみ（アグリハブ・畑らく日記）」と「ブランド名＋キーワード列挙（アグリノート・aKnow）」。後者は名前欄を上限近くまで使っている。

### キーワード × 競合順位の表

**⚠️ 順位は1件も取得できなかった。** 以下は「その語で戦うことになる相手」の推定であり、順位は空欄のままにしてある。申請前に人間がストア検索して埋めること（iPhone実機で、日本ストア・日本語で検索するのが唯一正確）。

| キーワード | 想定される上位競合（推定） | iOS順位 | Android順位 | 競合密度（推定） | 根拠 |
|---|---|---|---|---|---|
| 農業日誌 | アグリノート（名前欄に保有）／aKnow（名前欄に保有）／アグリハブ（自社サイトで「国内最大の農業日誌アプリ」と自称） | 未取得 | 未取得 | 高 | 3社が名前欄またはポジショニングで直接保有 |
| 圃場管理 | アグリノート（名前欄に保有）／Agrion／Z-GIS | 未取得 | 未取得 | 高 | アグリノートが名前欄に保有 |
| 農作業記録 | aKnow（名前欄に「農作業」「記録」）／畑らく日記／アグリハブ | 未取得 | 未取得 | 中 | 完全一致で名前欄に持つ競合は未確認 |
| 農薬 記録 / 農薬管理 | アグリハブ（公式サイトのタイトルが「ユーザー数No.1の農業日誌・農薬管理アプリ」）／aKnow（名前欄に「農薬」） | 未取得 | 未取得 | 中〜高 | アグリハブの主戦場 |
| 防除記録 | レイミーのAI病害虫雑草診断（隣接）／Z-GIS | 未取得 | 未取得 | 低（推定） | 名前欄に持つ競合を確認できず |
| 営農管理 | KSAS／Z-GIS／Agrion | 未取得 | 未取得 | 低〜中（推定） | 名前欄に持つ競合を確認できず。B2B寄りの語 |
| 農業 アプリ | 上記全て＋情報収集系アプリ | 未取得 | 未取得 | 非常に高 | 一般語すぎる |
| 作業日報 農業 | 該当競合を確認できず | 未取得 | 未取得 | 低（推定） | 空白地帯の可能性 |
| 栽培管理 | あい作（名前欄に保有と推定）／Agrion | 未取得 | 未取得 | 中 | — |
| 家庭菜園 | 畑らく日記（家庭菜園層も対象と明記） | 未取得 | 未取得 | 中 | B2C寄り。母数は大きいが課金しない層 |

### 競合のアプリ名・サブタイトル一覧（実際の文字列）

**名前（Name）欄 — 検索結果のページタイトルから実測。文字数は日本語1文字=1としてカウント。**

| アプリ | プラットフォーム | 名前欄の文字列（原文） | 文字数 | App Store ID / package |
|---|---|---|---|---|
| アグリハブ | iOS | `アグリハブ` | 5 | [id1434543837](https://apps.apple.com/jp/app/id1434543837) |
| アグリハブ | Android | `アグリハブ` | 5 | [com.ito.agrihub.app](https://play.google.com/store/apps/details?id=com.ito.agrihub.app) |
| アグリノート | iOS（現行） | `アグリノート – 農業日誌・圃場管理アプリ` | 21 | [id1069768608](https://apps.apple.com/jp/app/id1069768608) |
| アグリノート | iOS（旧名、URLスラッグに残存） | `アグリノート：営農情報を記録・管理・共有する農業日誌アプリ` | 29 | 同上 |
| アグリノート | Android | `アグリノート：営農情報を記録・管理・共有する農業日誌アプリ` | 29 | [jp.agri_note.android](https://play.google.com/store/apps/details?id=jp.agri_note.android) |
| 畑らく日記 | iOS | `畑らく日記` | 5 | [id929968090](https://apps.apple.com/jp/app/id929968090) |
| 畑らく日記 | Android | `畑らく日記` | 5 | [jp.co.esk.fpro](https://play.google.com/store/apps/details?id=jp.co.esk.fpro) |
| KSAS | iOS | `KSAS（クボタスマートアグリシステム）` | 19 | [id6446663999](https://apps.apple.com/jp/app/id6446663999) |
| KSAS | Android | （APPLIONに `KSAS（クボタスマートアグリシステム）` として掲載） | 19 | com.kubota.ksas |
| aKnow | iOS | `aKnow(エイノウ) - 農作業や農薬を農業日誌で記録管理` | **30（上限ちょうど）** | [id1546487302](https://apps.apple.com/jp/app/id1546487302) |
| Agrion | iOS | `Agrion(アグリオン)` | 14 | [id1171705933](https://apps.apple.com/jp/app/id1171705933) |
| あい作 | iOS | `あい作 栽培管理`（推定。URLスラッグは `あい作栽培管理`） | 7（推定） | [id1403677224](https://apps.apple.com/jp/app/id1403677224) |
| レイミーのAI病害虫雑草診断 | iOS | `レイミーのAI病害虫雑草診断`（メディア表記。ストア掲載名は未確認） | 13 | 未取得 |
| Z-GIS | — | JA全農提供。PC/Web中心で、iOSネイティブアプリの存在を確認できなかった | — | 未取得 |

**サブタイトル（Subtitle）欄 — ⚠️ 1件も確定できていない。**
唯一の手がかりは、アグリノートの App Store ページについて検索エンジンが返した要約に含まれていた次の文字列:
> 「作業記録・圃場管理・共有をひとつに農業経営を効率化するアプリです」
これは「`作業記録・圃場管理・共有をひとつに`（16文字、サブタイトル上限30以内）」＋説明文冒頭、という構成である可能性が高いが、**未確認**。

### Cited Findings
- Apple 公式: 「The name must be at least two characters and no more than **30 characters**.」 — [App Store Connect ヘルプ: App information](https://developer.apple.com/help/app-store-connect/reference/app-information)
- Apple 公式: 「A summary of your app that appears under your app's name on your App Store product page. This can't be longer than **30 characters**.」（サブタイトル） — [同上](https://developer.apple.com/help/app-store-connect/reference/app-information)
- Apple 公式: キーワードは **100文字**、カンマ区切り・スペースなし — [App Store search - Apple Developer](https://developer.apple.com/app-store/search/)
- Apple 公式: 「Ratings and reviews appear on your product page and in search results, and **can influence how your app ranks** in App Store search.」 — [同上](https://developer.apple.com/app-store/search/)
- アグリハブ自社サイトのタイトルは `AGRIHUB（アグリハブ）| ユーザー数No.1の農業日誌・農薬管理アプリ/クラウド` — [agrihub-solution.com](https://www.agrihub-solution.com/)（タイトル文字列のみ確認、本文遮断）
- アグリノート自社サイトのタイトルは `アグリノート | 4軒に1軒が使っている営農支援アプリ` — [agri-note.jp](https://www.agri-note.jp/)（タイトル文字列のみ確認）
- 畑らく日記の公式サイトは `無料で使える農業スマホアプリ「畑らく日記（はたらくにっき）」` — [hata-nikki.jp](http://www.hata-nikki.jp/)

### Inferences
- **アグリノートは iOS の名前を長い説明型（29字）から短い keyword型（21字）に作り変えた形跡がある**（URLスラッグに旧名が残り、現行タイトルが新名）。App Store の名前欄はブランド＋2キーワード程度に絞るのが現在の最適解、と国内最大手が判断したことを示唆する。一方 Google Play では旧来の長い名前をそのまま維持している＝**iOSとAndroidで名前を分けている**。farm-app も同様に分けるべき。
- aKnow が名前欄を**上限30文字ぴったり**まで使っているのは、無名ブランドが検索で拾われるための典型戦術。farm-app も無名なので、アグリハブ型（ブランド名のみ5文字）ではなく aKnow/アグリノート型（ブランド＋キーワード）を取るべき。ブランド名だけで検索されるのは、既に3〜5万ユーザーを持つアグリハブだから成立している。
- 「アグリ」で始まる名前が多い（アグリハブ、アグリノート、アグリオン）ため、**カタカナ「アグリ」系の名前は既存3社の指名検索に埋もれる**。CLAUDE.md の「カタカナ語より漢字語を優先」方針とも整合するので、漢字/ひらがな寄りの名前にするのが検索上も有利。

### Gaps
- **全競合のサブタイトル原文が未取得。** これが今回最大の欠落。申請前に必ず iPhone 実機か Mac の App Store アプリで各アプリページを開いて、名前の下の1行を書き写すこと。
- 各キーワードでの実順位が未取得。
- レイミー・Z-GIS の iOS アプリ実在有無とストア掲載名が未確認。

---

## Q3. 競合各社のレビュー数と平均評価（iOS / Android）

### Takeaway
**取得できなかった。評価点・レビュー件数は iOS / Android とも1社も確認できていない。** ストア本体（apps.apple.com / play.google.com）、レビュー集約サイト（APPLION / Appliv / dotapps）、比較メディア（smartagri / 農機具王 / gamba）の全てが egress プロキシに遮断された。数値を捏造しないため、ここは空欄のまま残す。

### Cited Findings（数値の代わりに得られた間接情報のみ）
- アグリハブ: 「全国で約3万人が利用」（検索要約）／「ユーザー数3万5千人を超える国内最大の農業日誌アプリに成長しました。**アプリレビュー1位を記録**」 — [PR TIMES STORY](https://prtimes.jp/story/detail/DBnZvoTqDaB)（※検索要約経由、原ページ遮断。「レビュー1位」が何のランキングかは不明で、自社発表である点に注意）
- アグリハブ: 「調布の農家が作ったアプリ…全国３万７千の農家が使う」 — [TOKYO GROWN](https://tokyogrown.jp/topics/?id=1606416)（検索要約経由）
- アグリハブ: 「4.5万人の農家が選んだ作業記録・農薬管理アプリ」（App Store ページ記載として検索エンジンが返した文字列） — [App Store id1434543837](https://apps.apple.com/jp/app/id1434543837)（※未確認）
- アグリハブ: 「リリースから3年で登録会員5万人を達成」 — [agrihub-solution.com](https://www.agrihub-solution.com/agrihub)（検索要約経由）
  - ⚠️ **3万人 / 3万5千人 / 3万7千人 / 4.5万人 / 5万人 と出典によってバラバラ**。時点が違うだけの可能性が高いが、どれも自社発表由来で、そのまま引用しないこと。
- アグリノート: 「4軒に1軒が使っている営農支援アプリ」（自社キャッチコピー） — [agri-note.jp](https://www.agri-note.jp/)
- 畑らく日記: 「アプリのダウンロードが累計10,000を超えました」（2020年前後の記事）／別記事では「ダウンロード数 2 万を超える」 — [スマート農業360](https://smartagri.jp/)・[hata-nikki.jp](http://www.hata-nikki.jp/)（検索要約経由）
- KSAS: 「2014年開始、10年以上の運用実績」 — [KSAS Marketplace](https://marketplace.ksas.kubota.co.jp/app/nichino-products)（検索要約経由）

### Gaps
- **iOS / Android の平均評価と評価件数（全社）** — 未取得。
- **手作業で確認すべきURL一覧（申請前に人間が開いて、2026年◯月◯日時点として記録すること）:**
  - アグリハブ iOS: https://apps.apple.com/jp/app/id1434543837 （レビュー全件: `?see-all=reviews`）
  - アグリハブ Android: https://play.google.com/store/apps/details?id=com.ito.agrihub.app&hl=ja
  - アグリノート iOS: https://apps.apple.com/jp/app/id1069768608
  - アグリノート Android: https://play.google.com/store/apps/details?id=jp.agri_note.android&hl=ja
  - 畑らく日記 iOS: https://apps.apple.com/jp/app/id929968090
  - 畑らく日記 Android: https://play.google.com/store/apps/details?id=jp.co.esk.fpro&hl=ja
  - KSAS iOS: https://apps.apple.com/jp/app/id6446663999 ／ Android: com.kubota.ksas
  - aKnow iOS: https://apps.apple.com/jp/app/id1546487302
  - Agrion iOS: https://apps.apple.com/jp/app/id1171705933
  - あい作 iOS: https://apps.apple.com/jp/app/id1403677224
  - 集約サイト（評価推移が見られる）: https://applion.jp/%E3%82%A2%E3%82%B0%E3%83%AA%E3%83%8F%E3%83%96/iphone-1434543837/review/ ／ https://applion.jp/android/app/jp.agri_note.android/review/ ／ https://applion.jp/android/app/com.kubota.ksas/review/
  - なお **iTunes Lookup API**（`https://itunes.apple.com/lookup?id=1434543837&country=jp`）を叩けば `averageUserRating` と `userRatingCount` が JSON で一発で取れる。ローカルの端末からなら認証不要。今回はプロキシが itunes.apple.com への CONNECT を 403 で拒否したため使えなかった。

---

## Q4. 競合の低評価レビュー（★1〜2）の内容

### Takeaway
**逐語引用はほぼ取得できなかった。** ストアとレビュー集約サイトが全て遮断されたため、確認できた「文面らしきもの」は畑らく日記の2件のみ。ただしその2件と、公式サイト側の不具合告知から、**低評価の第1要因は「機能への不満」ではなく「ある日突然ログインできない／起動しない」という可用性障害**である可能性が高い、という方向性は読み取れる。

### 低評価理由のランキング（※順位づけの根拠が薄い。確度も併記）

**1位（確度: 中）— 突然ログインできない・起動しない（アカウント/同期の可用性障害）**
検索エンジンが App Store レビュー欄から拾った文面として、畑らく日記について以下が報告されている:
> 「突然アプリが起動しなくなった」
> 「突然、ログイン出来なくなり、全く表示されなくなりました」
— [App Store 畑らく日記 id929968090](https://apps.apple.com/jp/app/id929968090) より（※検索エンジンの要約経由。**原ページで未確認、星数も不明**。「」内が逐語か要約かも断定できない）
関連: 畑らく日記の公式FAQに「畑らく日記IDの確認／パスワード忘れ／機種変更時のデータ引き継ぎ／辞書同期」の項目が並んでおり、ここが問い合わせの集中先であることを裏付ける — [hata-nikki.jp FAQ](http://www.hata-nikki.jp/about/howuse-4/faq/)

**2位（確度: 中）— アプリのアップデートで壊れる**
アグリノートが 2026年7月28日に「［アプリの更新をお願いします］アグリノート モバイルアプリ **Android版 v4.1.3** に不具合が発生しました」という謝罪・更新依頼を公式サイトに掲出している — [agri-note.jp/2026/07/apology20260728/](https://www.agri-note.jp/2026/07/apology20260728/)（※タイトル文字列のみ確認、本文遮断。不具合の内容は未確認）

**3位（確度: 低〜中）— 入力動線が煩雑／画面を行き来させられる**
> 「作業記録入力時に、メイン画面とサブ画面を行ったり来たりする煩雑さ」
> 「メモ欄の検索ができない」
— アグリノートへの要望として検索要約が返した内容（出典ページは [APPLION アグリノート レビュー](https://applion.jp/android/app/jp.agri_note.android/review/) 等と推定。**逐語か要約か不明、星数不明**）

**4位（確度: 低）— スマホだけで完結しない（PC必須の機能がある）**
> 「アグリノートについて『売上管理がパソコン入力しかできない』という限界が指摘されている」
> 「PCがメインで、スマホアプリは補助的な使用に向いている」
— 検索要約経由（アグリハブとの比較レビュー、および比較メディア由来）

**5位（確度: 低）— 使い込むと物足りない／自分の作型に合わない**
> 「使うに従って物足りなさを感じるユーザーもいる」（アグリハブ）
> 「複数の作物に同時に農薬を撒く使い方への機能追加が検討されているが、機能をシンプルに保つことが難しい」（アグリハブ開発側の回答）
— 検索要約経由

### Cited Findings
- 畑らく日記の公式アップデート履歴に「端末の暦法や時間表示設定により起こる日付入力時の不具合」の修正が含まれる（＝和暦設定など端末設定依存のクラッシュ/入力不具合が実在した） — [App Store 畑らく日記](https://apps.apple.com/jp/app/id929968090)（検索要約経由）
- アグリハブのレビューには「いろいろな農業系アプリを試しましたがこれが一番です」という肯定的なものが多い一方、農薬検索機能への改善要望が併存する — [SMART AGRI](https://smartagri-jp.com/smartagri/7878)・[農機具王](https://noukiguou.com/agricultural-app/)（検索要約経由）

### Inferences
- 低評価の集中点が「機能不足」ではなく「**ログイン・同期・端末設定依存の障害**」に寄っているなら、farm-app が申請前に潰すべきは機能数ではなく次の4点:
  1. **ログイン喪失からの自力復旧導線**（機種変更・パスワード忘れ・Apple ID変更）を、アプリ内から完結させる。競合はここをWebのFAQに逃がしており、その結果が★1になっている。
  2. **オフラインで書けて、後から同期**。圃場は電波が弱い。同期失敗時に入力が消えると即★1。
  3. **端末のロケール/暦法設定（和暦）依存のクラッシュ**を事前に潰す。畑らく日記が実際に踏んでいる。
  4. **アップデート後のリグレッション**。アグリノートが2026年7月にAndroidで踏んでいる。
- 「PC必須の機能がある」への不満は、**スマホ単体で完結する**ことを1枚目スクショで明示する価値があることを示す（farm-app は Web アプリなので同じ罠に注意）。

### Gaps
- **★1〜2の逐語引用がほぼ無い。これは報告書の弱点として明記すべき。** 上記の「」は原ページ未確認。
- 星数ごとの分布（★1が何件、★2が何件）は全社未取得。
- KSAS・レイミー・Z-GIS の低評価内容は一切取得できなかった（B2B/メーカー系は「ログインできない」「対応機種が限られる」系が多いと予想されるが、**裏付けなし**）。
- **申請前の必須アクション**: Q3 の URL 一覧の `?see-all=reviews` と、Google Play の「最新」「評価の低い順」でレビューを20件ずつ読み、逐語でメモすること。所要30分程度。

---

## Q5. 競合の高評価レビューで繰り返し褒められている点

### Takeaway
繰り返し出てくるのは **(1) 農薬の自動計算と成分・使用回数の管理、(2) 紙・エクセルからの解放、(3) 音声入力で作業中に記録できること、(4) 操作が単純であること、(5) 無料であること** の5点。いずれも「機能が多い」ではなく「記録という面倒を減らす」方向の称賛である。

### Cited Findings
- アグリハブ: 「農業アプリ初の**農薬検索**ができ、登録された農薬情報をAIで計算して散布管理ができ、作物ごとに日誌がつけられる」「**農家目線の使いやすさ**で、現役農家が開発し、すべての機能を無料で利用可能」 — [agrihub-solution.com](https://www.agrihub-solution.com/agrihub)（検索要約経由）
- アグリハブ: 「**農薬使用量の自動計算と成分管理に特化**」 — [agrihub-solution.com](https://www.agrihub-solution.com/)（検索要約経由）
- アグリハブ（レビュー由来とされる文言）: 「いろいろな農業系アプリを試しましたが**これが一番です**」 — [SMART AGRI](https://smartagri-jp.com/smartagri/7878)（検索要約経由）
- アグリハブ（iPadレビューのタイトルとして APPLION に掲載）: 「**とても使いやすいです。農薬検...**」 — [APPLION](https://applion.jp/%E3%82%A2%E3%82%B0%E3%83%AA%E3%83%8F%E3%83%96/ipad-1434543837/review/5207326207/)（タイトル断片のみ。本文遮断）
- アグリハブ: 他アプリ（アグリノート・アグリオン）と比較して**操作性が優れ、特に売上管理機能が高く評価**されている — 検索要約経由
- 畑らく日記: 「**音声入力**にも対応しているので、作業中のメモも楽々」「作業中に手が汚れていても音声で作業記録や作物の状態を記録でき、写真撮影も可能」 — [農機具王](https://noukiguou.com/agricultural-app/)・[ファームコネクト](https://farm-connect.org/agricultural-management/application/)（検索要約経由）
- 畑らく日記: 「よく行う作業や作物を登録できる**辞書機能**で入力が楽になり、**エクセルで記録を管理するより便利**だと評価されている」 — 検索要約経由
- 畑らく日記: 「作物の状態を写真で撮影、日誌につけて保存することで、細かい変化に気づける。失敗した時に何がいけなかったのか一目でわかる」 — 検索要約経由
- アグリノート: 「**コスパが良く、土地利用型農業の方には使いやすく、アップデートや改良を頻繁に行ってくれる**」 — 検索要約経由
- Agrion: 「あらかじめ**日本全国の農地データが地図としてインプット**されており、栽培している圃場を選ぶだけで利用を開始できるため、**初期登録の手間を削減**したい方に人気」 — [先端農業マガジン](https://smartagri.jp/farm-management-app-comparison/)（検索要約経由）

### Inferences
- 褒め言葉の核は一貫して「**入力が楽**」である（辞書機能・音声入力・圃場を選ぶだけ・自動計算）。**初回登録の手間の少なさ**（Agrion）と**日々の入力の速さ**（畑らく日記の辞書/音声）が、高評価の2大ドライバー。
- 「農薬の成分・使用回数の自動計算」は**アグリハブが独占的に褒められている領域**で、かつ単なる記録より価値が高い（ミスが法令違反に直結するため）。farm-app が同等の機能を持つなら、ここはサブタイトル/スクショで明示する価値がある。逆に持たないなら、この語で戦うと期待値ギャップで★が落ちる。
- CLAUDE.md の方針（入口に「AI」の語を出さない）とストアの実態は整合する: アグリハブは「AIで計算」と説明文では書くが、**アプリ名には入れていない**。一方レイミーは名前に「AI」を入れている（AI診断が機能の実体そのものだから）。farm-app は記録アプリなので、名前にAIを入れない判断が競合実態とも一致する。

### Gaps
- 高評価レビューの逐語引用も原ページ未確認（断片1件のみ）。

---

## Q6. 評価とダウンロード率の関係を示すデータ

### Takeaway
「★1〜2 → ★4〜5 で**6〜7倍**」「★3 → ★4 でコンバージョン **+89%**」「4.5★以上は4.0★未満の**約2倍**の install CVR」という数字が繰り返し引用されている。ただし**日本市場限定のデータは見つからず**、一次ソース（Apptentive の原レポート）にも到達できていない。

### Cited Findings
- Apptentive 調査: 「improving an app's rating from **1-2 to 4-5 stars leads to six to seven times more downloads**」 — [AppFollow blog](https://appfollow.io/blog/ratings-and-reviews-what-affects-your-conversion-rate)（※検索要約経由、原ページ遮断。Apptentive の一次レポートは未確認）
- 「an app with a **3-star rating loses around half the downloads**, whereas apps rated **1–2 stars lose almost every download**」 — [AppFollow blog](https://appfollow.io/blog/what-is-app-ratings)（検索要約経由）
- 「Moving a three-star app to four stars can lead to an **89% increase in conversion rate**」 — 検索要約経由（出典は AppFollow / Appalize 系）— [Appalize](https://www.appalize.com/da/blog/app-marketing/app-store-ratings-impact-on-downloads-data-driven-analysis)
- 「apps with **4.5+ stars convert installs at roughly double the rate** of apps below 4.0」／「The critical threshold is **4.0 stars**…below 4.0, every tenth of a point creates disproportionate conversion loss」 — [screenfast.app（2026年データと自称）](https://screenfast.app/blog/app-rating-impact-on-downloads)（※検索要約経由、原ページ遮断。**自社ブログであり一次データではない**）
- Alchemer 調査: 「only **50% of users will even consider downloading an app rated three stars**」 — 検索要約経由
- Apple 公式: 評価とレビューは検索結果にも表示され、**ランキングそのものにも影響しうる** — [App Store search - Apple Developer](https://developer.apple.com/app-store/search/)（＝評価はCVRだけでなく順位にも効く、という点はApple公式で裏が取れている）

### Inferences
- **★4.0 が崖**という点で複数ソースが一致している。予算ゼロで自然流入に全賭けする farm-app にとって、**初期の★1が1件つくだけで平均が4.0を割る**（例: 最初の5件が★5でも、★1が2件入れば平均3.86）。つまり **レビュー依頼のタイミング設計（SKStoreReviewController を、記録が正常に保存できた直後など「成功体験の直後」にだけ出す）が、実質的に最大のASO施策**になる。
- Q4で見た通り低評価の主因が「ログインできない・同期が飛ぶ」であるなら、**評価対策＝可用性対策**であり、マーケの話ではなく実装の話になる。
- 6〜7倍という数字は「1-2★のアプリはそもそも他の面でも悪い」という交絡があり、因果として鵜呑みにはできない。**報告書では「相関」として扱うのが誠実。**

### Gaps
- **日本市場限定のデータは1件も見つからなかった。** 上記は全て英語圏のグローバルデータ。
- Apptentive / Alchemer の一次レポート（年次・サンプル数・測定方法）に到達できていない。引用の引用である。
- 「レビュー件数」が CVR に与える影響（例: 10件と100件の差）の数値は取得できなかった。

---

## Q7. ニッチなB2B向けアプリが ASO だけで得られる流入の実例

### Takeaway
**まともな実例はほとんど見つからなかった。** 見つかった2件はいずれも ASO 代理店の自社ケーススタディ（売り込み目的）で、ベースライン・期間・絶対数の開示が不十分。**「予算ゼロでASOだけでどれだけ来るか」を裏付ける信頼できる公開データは、今回の調査では確認できなかった**と正直に書くべき領域。

### Cited Findings
- Ninja Number（B2Bのビジネス電話アプリ）: 主要キーワード **「business number」で Top 50 → Top 3** へ。500以上のショートテール/ロングテールキーワードを分析して選定 — [App Guardians ケーススタディ](https://appguardians.com/case-studies/ninja-number-case-study/)（※ASO代理店の自社事例。検索要約経由。**インストール数の絶対値は非開示**）
- 新規リリースのAI記帳アプリ: キーワード最適化とメタデータ再構成で **7日間で1,200+ オーガニックダウンロード** — 検索要約経由（出典ページ特定できず。**検証不能**）
- 「B2B buyers are looking for tools that match a **very specific problem, industry, or workflow**. You'll want to target a mix of competitive and niche keywords」「**Capturing many niche searches can add up to a lot of organic traffic**」 — [OpenForge: ASO for B2B Apps](https://openforge.io/app-store-optimization-aso-for-b2b-apps/)・[Tenjin: How to Find Niche Keywords for ASO](https://tenjin.com/blog/how-to-find-niche-keywords-for-aso/)（※いずれも定性的な指針であり、数値の裏付けなし）
- 一般論としての土台: 非ゲームアプリのDLの **69%** が App Store 検索由来（2018年 Sensor Tower）／2020年には全体で59% — [Sensor Tower](https://sensortower.com/blog/app-store-download-sources)

### Inferences
- **定量的な期待値を置くなら、競合の規模から逆算するのが唯一の現実的な方法。** 日本の販売農家は約100万経営体規模、アグリハブが5年で3.5〜5万ユーザー（自社発表）、畑らく日記が累計1〜2万DL。つまり**このカテゴリの「勝者」ですら年間1万DL前後のペース**であり、ニッチB2Bとしてのカテゴリ天井はかなり低い。ASO だけで月数千DLといった期待は置くべきではない。（※農家数は本調査で裏を取っていないので、報告書に書くなら別途確認）
- ニッチB2Bの ASO の勝ち方は「ビッグワードで1位を取る」ではなく「**ロングテールを数十本拾って積む**」であることは複数ソースが一致。farm-app のキーワード設計も、1語に賭けず、`農薬`×`記録`×`圃場`×`防除`×`日報` の組み合わせで面を取る方向が妥当。

### Gaps
- **信頼できる（代理店の自社宣伝でない）ニッチB2BアプリのASO流入実績データは見つからなかった。**
- 日本のニッチB2Bアプリの事例は1件も見つからなかった。

---

## 【成果物】アプリ名・サブタイトル・キーワードの案 3パターン

> 前提: App Store の仕様は Apple 公式で確認済み — **名前30文字 / サブタイトル30文字 / キーワード100文字**、インデックス対象は name・subtitle・keywords・category のみ（[App Store search](https://developer.apple.com/app-store/search/) / [App information](https://developer.apple.com/help/app-store-connect/reference/app-information)）。
> **重要なルール**: Apple は「名前・サブタイトル・カテゴリに既に入っている語をキーワード欄で繰り返すな」としている（既にインデックス済みのため無駄） — [AppFollow ASO Keywords](https://appfollow.io/blog/aso-keywords)（検索要約経由）。以下の3案はすべて**名前・サブタイトルに入れた語をキーワード欄から除外**してある。
> **文字数カウントの注意**: 「Apple は文字数をバイトでなく文字で数え、CJKも1文字1カウント」とする情報（[aso.dev](https://aso.dev/metadata/cross-localization/)、[Applyra](https://www.applyra.io/blog/app-store-character-limits)）と、「emoji や一部のCJK文字は2文字として数えられることがある」とする情報（[AppScreenshotStudio](https://appscreenshotstudio.com/blog/app-store-metadata-for-indie-devs-title-subtitle-keywords-2026)）が**食い違っている**。いずれも検索要約経由で原ページ未確認。**安全のため、各フィールドは上限から2〜3文字の余裕を残す設計にしてある。**
> ブランド名は `ノウキロク`（5文字・仮）で計算した。実際のブランド名の文字数に応じて調整すること。

### パターンA: 「農業日誌 × 圃場管理」正面突破型（アグリノートと同じ土俵）

| 項目 | 文字列 | 文字数 |
|---|---|---|
| 名前 | `ノウキロク 農業日誌・農作業記録` | 15 / 30 |
| サブタイトル | `圃場ごとの農薬散布と作業の記録` | 15 / 30 |
| キーワード | `営農管理,防除,栽培管理,生産履歴,日報,施肥,収穫,出荷,作付,台帳,写真,音声,GAP,野菜,果樹,稲作,畑,田,農家,新規就農,帳簿,スマート農業` | 83 / 100 |

**狙い**: 最大需要と推定される「農業日誌」「農作業記録」「圃場管理」「農薬」を名前＋サブタイトルに全部載せる。`農業日誌` と `圃場` はアグリノートが名前欄に持つ語で競合が最も強いが、**検索母数が最大である可能性が高い語**に最初から露出しておく設計。
**リスク**: アグリノート（レビュー数・DL数で圧倒的）に text relevance で勝っても user behavior で負けるため、上位表示は期待しにくい。ロングテール（キーワード欄）が実質の流入源になる。
**CLAUDE.md整合**: 名前・サブタイトルとも体言止め（名詞）。カタカナ語より漢字語。「AI」なし。○

### パターンB: 「防除記録・農薬管理」特化型（空白地帯を取りに行く）

| 項目 | 文字列 | 文字数 |
|---|---|---|
| 名前 | `ノウキロク 農薬使用記録と防除の日誌` | 18 / 30 |
| サブタイトル | `散布量の計算と圃場ごとの作業管理` | 16 / 30 |
| キーワード | `農業,農作業,営農,栽培,生産履歴,希釈倍数,適用作物,使用回数,収穫前日数,特別栽培,GAP,台帳,日報,施肥,収穫,出荷,作付,野菜,果樹,稲作,農家,帳簿` | 89 / 100 |

**狙い**: 「防除記録」「農薬 記録」は、確認できた範囲で**どの競合も名前欄に持っていない**（アグリハブは名前が `アグリハブ` の5文字のみ）。名前欄に完全一致で持てば text relevance で優位に立てる可能性が高い。さらに `希釈倍数` `使用回数` `収穫前日数` `適用作物` という、**法令順守で実際に困っている人だけが打つ超ロングテール**を押さえる。これらは競合密度がほぼゼロと推定される。
**リスク**: 母数が小さい。また「農薬の自動計算」を実装していないのにサブタイトルに `散布量の計算` と書くと、期待値ギャップで★が落ちる（Q6参照）。**実装が伴う場合のみ採用**。
**CLAUDE.md整合**: 体言止め、漢字語優先。○

### パターンC: 「入力の速さ」訴求型（高評価レビューの共通項に寄せる）

| 項目 | 文字列 | 文字数 |
|---|---|---|
| 名前 | `ノウキロク 農作業記録・農業日誌アプリ` | 19 / 30 |
| サブタイトル | `畑での入力は3タップ、写真と音声` | 16 / 30 |
| キーワード | `農薬,防除,圃場,営農管理,栽培管理,生産履歴,日報,施肥,収穫,出荷,作付,台帳,家庭菜園,菜園,畑仕事,野菜,果樹,稲作,農家,新規就農,GAP,簡単,無料,帳簿` | 92 / 100 |

**狙い**: Q5で判明した通り、高評価の共通項は「入力が楽」。サブタイトルを検索用ではなく **コンバージョン用**に振り切り、検索語は名前欄とキーワード欄に寄せる。`家庭菜園` `菜園` `畑仕事` を入れて B2C 側の母数も拾う。
**リスク**: サブタイトルに検索語が入らない分、text relevance が3案中で最も弱い。また `家庭菜園` 層は課金しないので、有料化を狙うならノイズになる。
**注意**: サブタイトルの `3タップ` は**実際に3タップで完了する場合のみ**使うこと。読点を含むが体言止めではある（`写真と音声`）。CLAUDE.md の問いかけ形禁止・AI語禁止には抵触しない。

### 3案の使い分け（推奨）
- **有料化を見据えるなら B が本命**。「農薬の記録を法令通りに残したい」人は課金動機が明確で、かつ競合が名前欄を空けている。
- Aは「一番大きい池だが一番強い魚がいる」。**Bで足場を作ってから、アップデート時にAへ寄せる**のが安全。
- Cのサブタイトル文言は、**AまたはBを採用した上で、スクリーンショット1枚目に転用**するのが最も効率がよい（サブタイトルは検索インデックス対象だが、スクショは対象外なので、検索語はサブタイトルに、訴求文はスクショに置くのが正しい分担）。

### Google Play 側（iOSと同じ文字列を使わないこと）
アグリノートが **iOS を短い名前（21字）に作り変えつつ、Google Play では長い名前（29字）を維持している**という実測事実（Q2参照）に倣い、Play 側はタイトルに語を詰める。
- Play タイトル案: `ノウキロク：農作業記録・農薬と防除の農業日誌アプリ`（25字）
- ⚠️ Play のタイトル30字 / 簡単な説明80字 / 詳しい説明4000字という上限は、今回**公式ドキュメントで確認できていない**（support.google.com のページに到達できず）。申請前に [Play Console ヘルプ](https://support.google.com/googleplay/android-developer/answer/9859455) で確認すること。

---

## 【成果物】スクリーンショット1枚目の訴求文の案

> 前提: スクリーンショット内のテキストは **App Store の検索インデックス対象ではない**（インデックスは name / subtitle / keywords / category のみ — [Apple公式](https://developer.apple.com/app-store/search/)）。よって1枚目は**検索語を詰める場所ではなく、コンバージョン（CVR）専用の枠**。
> CLAUDE.md の文言規約に従い、見出しは**体言止め**、問いかけ形は使わない、カタカナ語より漢字語、「AI」の語は入口に出さない。

**第1候補（入力の速さ — Q5の高評価共通項に直結）**
> **畑での記録は3タップ**
> 圃場を選んで、作業を選んで、保存。

**第2候補（法令順守の安心 — Q5でアグリハブが独占的に褒められている領域）**
> **農薬の使用履歴が、そのまま台帳に**
> 散布した日・量・回数を自動で集計。

**第3候補（紙・エクセルからの移行 — 畑らく日記の高評価文言に一致）**
> **紙とエクセルの転記が不要**
> 記録はその場で、写真も一緒に。

**第4候補（Q4の低評価要因を先回りして潰す訴求）**
> **電波が届かない畑でも記録**
> 圏外で書いて、戻ったら自動で同期。

### 選定の指針
- **1枚目は第1候補（入力の速さ）を推す。** 高評価の共通項（入力が楽）と低評価の共通項（面倒・行き来が煩雑）の両方に同時に答えており、かつ「記録アプリを探している」という検索意図に最短で応える。
- 2枚目に第2候補（農薬台帳）、3枚目に第4候補（オフライン）を置くと、Q4で見た低評価要因（同期不安）への不安解消まで1画面内で完結する。
- **利用者に高齢層が多い**（CLAUDE.md）ため、1枚目の文字は**大きく・漢字とひらがなのみ・1行10〜12文字以内**に収める。英字とカタカナの多用は避ける。
- ⚠️ 「3タップ」「自動で集計」「圏外で記録」は**実装が伴う場合のみ使う**。Q6の通り★4.0が崖であり、期待値ギャップによる★1が最も高くつく。

---

## 申請前にやるべきこと（このノートの欠落を埋める手順）

1. **iPhone実機で日本ストアを開き**、Q3のURL一覧の全アプリについて「名前の下のサブタイトル1行」「評価点」「評価件数」を書き写す（2026年◯月◯日時点として記録）。所要20分。
2. 同じ画面で「農業日誌」「農作業記録」「農薬 記録」「防除記録」「営農管理」「圃場管理」「農業 アプリ」「作業日報 農業」を**実際に検索し、上位10件のアプリ名を順に控える**。これがQ2の順位表の中身になる。所要20分。
3. 各競合のレビューを「評価の低い順」で20件ずつ読み、**逐語でメモ**する。Q4の引用の穴が埋まる。所要30分。
4. **App Store Connect で Apple Search Ads のキャンペーン作成画面に入り**、キーワード提案の検索ボリューム指標で上記8語の相対需要を確認する（配信しなくても見られる）。Q1の穴が埋まる。所要15分。
5. `https://itunes.apple.com/lookup?id=<ID>&country=jp` を手元のブラウザで叩けば、評価点と評価件数がJSONで一発で取れる（今回はプロキシに遮断された）。
