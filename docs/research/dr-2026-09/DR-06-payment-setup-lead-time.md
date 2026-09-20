# DR-06 個人開発者の課金開始手続きと所要期間（iOS / Web）

- 調査時点: 2026-09-19
- 対象: 日本の個人開発者（個人事業主）／月額980円の自動更新サブスクリプション／2026年12月末までに課金・入金到達が必要
- 検証方式: 3票アドバーサリアル検証（**20クレームが検証通過、5クレームが反証により棄却**）
- 関連: [`../../app-store-submission.md`](../../app-store-submission.md) / [`DR-07`](DR-07-elderly-payment-methods.md)

## 本レポートの信頼度について

**Apple（App内課金）経路と Stripe の審査期間**については、公式ドキュメント／公式サポートの原文に到達し、3票検証を通過した一次情報のみで構成（**信頼度：高**）。

一方、**特定商取引法・インボイス制度・消費税・請求書払い／口座振替・決済失敗率／解約率（設問3〜7）については、今回の検証ラウンドで検証通過したクレームが存在しない。** 該当セクションは「未検証」として明示し、確認すべき一次情報のURLと確認手順のみを記載する。**数値・解釈を確定情報として扱わないこと。**

## 0. エグゼクティブサマリー

1. **iOS経路のクリティカルパスは「有料App契約（Paid Apps Agreement）」であり、アプリ実装や審査ではない。** Appleの公式手順は「Apple Developer Program加入 → Account Holderが有料App契約に署名 → 税務フォーム提出 → 銀行情報登録」の順で、契約が Active でなければ有料アプリ・App内課金の**提出そのものができない**。
2. **12月中の「着金」を狙うなら、売上を Apple の会計月10月中に立てる必要がある。** Appleは「トランザクションが完了した会計月の末日から45日以内」に入金する。会計10月末（≒10/31）＋45日 ≒ **12月中旬**で December に着地するが、会計11月末（≒11/28）＋45日 ≒ **1月12日**となり12月を外す。
3. **Web（Stripe）経路が最短。** Stripe公式（日本向け、2026-09-17更新）は本番有効化審査を「通常2〜3営業日、書類不備や追加確認が必要な場合は1〜2週間」と明記。審査中もテストは可能。
4. **手数料15%（Small Business Program）は即時には効かない。** 登録が承認された会計月の末日から15日後の売上から調整開始。**アプリ申請を待つ必要はないので今すぐ登録すべき。**
5. **個人事業主でも全経路が可能だが、App Storeには実名（半角ローマ字）が販売元として公開される。** 屋号（DBA・商号）は使えない。D-U-N-S Numberは組織登録のみの要件なので、個人経路では取得待ちが発生しない。

### 結論（最短課金開始日）

- **Web（Stripe）経路**: 2026年9月26日ごろ（申込 → KYC審査2〜3営業日 → 実装済み前提で即開始）
- **iOS経路**: 2026年10月下旬（ADP登録 → 契約/税務/銀行 → 契約Active → IAP構成・Sandbox検証 → 10月中旬申請 → 審査通過後リリース）

## 1. iOS：App内課金（自動更新サブスクリプション）

### 1.1 手続きの順序と依存関係（Apple公式）

```
Apple Developer Program 登録（Account Holder権限を持つ）
        ↓（必須の前提）
有料App契約（Paid Apps Agreement）に Account Holder が署名
        ↓
├─ 税務フォーム提出（米国外はW-8BEN / W-8BEN-E / W-8ECI のいずれか）
└─ 銀行情報の入力
        ↓（銀行情報の「処理」は税務フォーム提出完了が条件）
契約ステータスが Active
        ↓
App内課金アイテムの作成・Sandboxテスト・有料アプリの提出が可能
```

| 事項 | 公式原文 | 出典 |
|---|---|---|
| 有料販売・App内課金には有料App契約の署名が必須 | "To sell your apps on the App Store or offer In-App Purchases, the Account Holder must sign the Paid Apps Agreement." | developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements |
| 契約が Active でないと提出・更新ができない | "This agreement must be active in order for you to submit or update paid apps and In-App Purchases." | 同上 |
| **Sandboxでの課金テストも Active が条件** | "The agreement must be Active to test In-App Purchases in the sandbox environment." | …/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases |
| 税務フォーム提出の前提が契約署名 | "In order to submit tax forms, you first need to sign the Paid Apps Agreement." | …/manage-tax-information/provide-tax-information |
| 銀行情報の登録前に契約署名が必要／税務フォーム未提出だと銀行情報を処理しない | "in order to add banking information, you'll first need to sign a Paid Apps Agreement." / "You must submit all required tax forms needed for your paid contract in order for us to process banking information" | …/manage-banking-information/enter-banking-information |
| 米国外はW-8BEN等、質問への回答で自動振り分け | "you'll be prompted to answer a series of questions to direct you to the most appropriate tax form" | …/provide-tax-information |
| 契約署名は Account Holder のみ | ロール権限表で "Accept legal agreements" が Account Holder のみ | developer.apple.com/support/roles/ |

**契約ステータスの意味**: New（未署名）→ Pending User Info（署名済みだが必要情報が未完了で**効力なし**）→ Processing（Apple審査中）→ Verifying → Active（効力発生）。

**署名だけでは Active にならない点が最大のスケジュールリスク。Appleは Processing/Verifying の所要日数をどのページにも公表していない。** したがって後述スケジュールの「契約Active待ち」はAppleの公表値ではなく**想定バッファ**である。

### 1.2 個人事業主で可能か／費用

| 項目 | 内容 | 個人事業主 |
|---|---|---|
| Apple Developer Program 年会費 | 99米ドル/メンバーシップ年（個人・組織とも同額） | 可 |
| 登録主体 | Appleに「個人事業主」区分はなく Individual のみ。"If your legal status is a sole proprietorship/single person business, enroll as an individual." | 可 |
| D-U-N-S Number | **組織登録のみの要件。** "If you're enrolling as an individual, you don't need a D-U-N-S Number." | **不要（リードタイム0）** |
| 銀行口座 | 個人名義口座でよい。ただし**屋号名義口座は不可**と読むべき（"We do not accept DBAs, fictitious business names, trade names, or branches"）。口座情報は「口座に記載のとおり正確に」入力しないと支払拒否 | 可 |
| 販売元名の公開 | 個人登録では**本人の法的氏名が App Store の販売元として公開表示**される。日本語氏名の場合は半角ローマ字表記 | 可（**実名公開は避けられない**） |
| 支払口座 | 支払処理時点のプライマリ口座1つのみ。複数口座・分割送金は不可 | — |

**補足（developer.apple.com/jp/support/enrollment/）**: 個人・個人事業主は登録時に**その場で**ライセンス契約に同意してメンバーシップを購入できる（組織はApple Developer Supportの確認メール待ちが発生）。ただしエイリアス・ニックネーム・会社名を氏名欄に入れると承認が遅延する、クレジットカードが本人名義でない場合は政府発行写真付きIDによる保留になる、との注意書きがある。→ **個人経路は最短だが、氏名とカード名義を法的氏名に揃えることが遅延回避の鍵。**

### 1.3 審査で落ちやすい要件（3.1.1 / 3.1.2）

**(a) 3.1.2(a) 自動更新サブスクリプションの実体要件（公式原文）**

> "If you offer an auto-renewable subscription, you must provide ongoing value to the customer, and the subscription period must last at least seven days and be available across all of the user's devices."

適切な例として "apps that offer consistent, substantive updates; ... software as a service (SAAS); and cloud support" を列挙。別項に "Subscriptions must work on all of the user's devices where the app is available."（**must**）。

- 月額980円は7日以上要件を自動的に満たす
- **全デバイスで購読状態が有効にならない実装は 3.1.2(a) 違反。** 作業記録アプリ＝クラウド同期を伴うSaaS型なので「継続的価値」の説明はしやすい
- 購入の復元（restore）機構は 3.1.1 側で **should**。ただしサインアップ画面には「既存サブスクライバーがサインインまたは購入を復元する手段」が **must** として求められるため、**実務上は実装必須**

**(b) 購入画面の必須表示**

developer.apple.com/app-store/subscriptions/（**must**）:

> "the following details must be included in your subscription's sign-up screen:
> ・Subscription name and duration, and the content or services provided during the subscription period
> ・Full renewal price, shown clearly and prominently, and localized in available currencies
> ・A way for current subscribers to sign in or restore purchases"
> "your app and App Store metadata must include links to your Terms of Use and Privacy Policy."
> "In the purchase flow, the amount that will be billed must be the most prominent pricing element in the layout."

契約上の根拠（ADPLA Schedule 2 §3.8(b)）: "Title of auto-renewing subscription / Length of subscription / Price of subscription, and price per unit if appropriate / Links to Your Privacy Policy and Terms of Use must be accessible within Your Licensed Application."

**実装チェックリスト（公式に「こう書かれている」項目）**

- [ ] サブスクリプション名・期間・期間中に提供される内容の明示
- [ ] 更新時の全額（980円/月）を明瞭・目立つ形で、ローカライズされた通貨で表示
- [ ] 「既にご購読の方はこちら（サインイン／購入を復元）」の導線
- [ ] アプリ内の利用規約（EULA）とプライバシーポリシーへのリンク
- [ ] App Store Connect のメタデータ側にもプライバシーポリシーURLとEULAを設定（Apple提供の標準EULAをそのまま使ってよい。プライバシーポリシーURLは自前で用意）
- [ ] 購入フロー内で「実際に課金される金額」が最も目立つ価格要素になっている

**「1日あたり約32円」表示のリスク（本調査の解釈であり公式の例示ではない）**: Appleの明文例は年額プランの月割り表示についてだが、規則自体は「実課金額が最も目立つこと」という一般規則。月額980円を「1日あたり約32円」と強調するレイアウトは内訳価格が実課金額より目立つ状態になり得るため違反リスクがある。

**「どの条項で指摘されるか」は公式記載ではない**（Appleはリジェクト時にどの番号を引くかを公表していない）。

**検証ラウンドで棄却された主張（＝本レポートは主張しない）**

- 「Web決済のみでiOSアプリの機能を解放する設計は3.1.1違反で必ずリジェクト」（0-3で棄却）
- 「マルチプラットフォーム例外（3.1.3(b)）は同一アイテムがApp内課金でも提供されている場合に限られる」（0-3で棄却）
- → **外部Web課金とiOSアプリの関係は今回の検証では結論が出ていない。実装方針を決める前に3.1.3各号の原文を個別に読み直すこと（未解決の重要論点）。**

### 1.4 App Store Small Business Program（手数料15%）

| 項目 | 内容 |
|---|---|
| 対象 | "The App Store Small Business Program is intended for small businesses and individual developers." **前年実績ゼロの新規開発者も対象** |
| 登録要件 | ①Account Holderであること ②最新の有料App契約（ADPLA Schedule 2）をレビュー・承諾していること ③該当する場合はAssociated Developer Accountsをすべて申告 |
| **アプリのリリースは要件ではない** | 申請前・アプリ未公開でも登録可能 |
| 適用開始タイミング | **即時ではない。** "Your proceeds will be adjusted fifteen (15) days after the end of the fiscal calendar month in which your enrollment is approved."（例: 2022/2/10承認 → 2022/3/14から調整） |

- 9月中に承認 → 10月上旬〜中旬の売上から15%
- 10月承認 → 11月上旬〜中旬の売上から15%（それ以前は30%）
- → **アプリ申請を待たず、有料App契約を締結したら即日SBPに登録するのが最適。**
- 注：「会計月」はAppleの会計月でカレンダー月末とは一致しない（Apple FY2026は2026-09-26終了）

### 1.5 入金サイクル（売上計上 → 着金）

> "payments are made to the bank account and the currency you provided **within 45 days of the last day of the fiscal month in which the transaction was completed**."
> — developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments（Last-Modified: 2026-09-17）

**入金の4条件**: ①有料App契約が有効 ②App Store Connectに銀行情報 ③各国の最低支払額しきい値を超える ④月次インボイス要件の完了

**日本の個人開発者にとっての実質的な意味**

- 条件3は**実質的な障害にならない**。JPYは 0.02（未掲載通貨の既定は40 USD）。月額980円1件でも超える。→ 「980円では最低支払額を下回って初月着金しない」という説は検証で**棄却（0-3）**
- 条件4は**日本には原則適用されない**（月次の源泉徴収書類を課すのはブラジルとメキシコのみ）
- **実質的なリスクは条件1・2（契約Activeと銀行/税務情報の完了）**

**ずれの測り方（重要）**: 「会計月末から45日」なので、会計月の締めを起点にすると最大約1.5か月。個々の購入日を起点にすると**最大約75日（約2.5か月）**。**逆算の起点は必ず「会計月末」で計算すること。**

**12月着金の可否（本調査の計算／Appleの公表値ではない）**

| 売上が立った会計月 | 会計月末（概算） | ＋45日 | 12月着金 |
|---|---|---|---|
| 会計10月 | 2026-10-31前後 | 2026-12-15前後 | **○** |
| 会計11月 | 2026-11-28前後 | 2027-01-12前後 | **×** |

→ **12月中に1円でもAppleから着金させるには、会計10月中（＝実質10月末まで）に売上を立てる必要がある。**

※ Appleの会計月末日は4-4-5パターンで、公式の会計カレンダーページは見つけられなかった。正確な会計月末日はApp Store Connectの Payments and Financial Reports 画面で確認すること。

**売上の可視化タイミング**: 前会計月の支払情報は当会計月の**第1水曜日**から表示され、Financial Reportsは**第1金曜日**までに揃う。

## 2. Web：Stripeでの決済

### 2.1 審査期間（公式・一次情報）

> 「審査は、通常 2 〜 3 営業日で完了します。書類不備や追加確認が必要な場合は 1 〜 2 週間かかることがあります。」
> — support.stripe.com/questions/getting-started-with-stripe-a-guide-for-users-in-japan?locale=ja-JP（article:modified_time = 2026-09-17）

- この審査は本番環境を有効化するための**KYC審査**
- **審査中もテスト環境で開発・テストが可能**。→ 実装とKYCを並行できる
- **2〜3営業日はStripeの自己申告する「通常」の目安で、SLA（保証）ではない。** 12月というハード期限に対してはバッファを持つこと

### 2.2 必要書類・個人事業主での開設（**部分的に未検証**）

今回の検証ラウンドで通過したStripeクレームは**審査期間のみ**。必要書類の詳細は確定情報として提示しない。

確認先（すべて公式）: support.stripe.com（日本向けガイド）／docs.stripe.com/get-started/account/activate ／stripe.com/jp/legal/restricted-businesses ／docs.stripe.com/billing/subscriptions/build-subscriptions

一般に必要とされるもの（**未検証・要確認**）: 本人確認書類、事業内容とサイトURL、個人名義の銀行口座、住所・電話番号。

**入金サイクル（Stripe側）も未検証。** 日本では初回入金までに一定の待機期間があるのが一般的とされるが、公式の日数を確認していないため、12月入金の逆算に用いる際は必ず docs.stripe.com/payouts で確認すること。

### 2.3 最短で課金を始めるまでの日数

| ステップ | 所要 | 備考 |
|---|---|---|
| アカウント作成・プロフィール入力 | 即日 | テストモードは即使える |
| KYC審査 | 通常2〜3営業日（不備時1〜2週間） | 公式記載 |
| Products/Prices・Checkout or Billing実装 | 審査と並行可 | 実装工数はプロジェクト依存 |
| **本番課金開始** | **最短 2026-09-26 前後** | 9/19申込 → 9/24〜25承認 → 即開始 |

## 3〜7. 法務・税務・請求実務（**今回のラウンドで検証通過クレームなし＝未検証**）

以下は設問3〜7に対応するが、3票検証を通過した一次情報が存在しないため、**確定情報として記載しない**。到達すべき一次情報と、確認すべき論点のみを列挙する。**税務・法務の最終判断は税理士・弁護士に確認すること。**

### 3. 特定商取引法に基づく表記（未検証）

- 一次情報: 消費者庁 特定商取引法ガイド https://www.no-trouble.caa.go.jp/ ／ 通信販売の広告表示義務（特商法11条、同施行規則）
- 論点: ①個人事業主の氏名・住所・電話番号の広告表示義務の範囲 ②「請求があったら遅滞なく提供する」運用（省令に基づく省略）が認められる条件 ③App内課金のみの場合とWeb決済もある場合の差（Appleが販売主体になるか否かで整理が変わる可能性）
- **④iOS経路ではAppleが販売元として実名を公開する（§1.2）ため、実名の非公開は事実上不可能である点は確定情報として使える**

### 4. インボイス制度（適格請求書発行事業者登録）（未検証）

- 一次情報: 国税庁 インボイス制度特設サイト
- 論点: ①顧客が個人（消費者）のみなら適格請求書は不要という整理の妥当性 ②免税事業者が登録すると課税事業者になる（＝980円に対する消費税の納税義務が発生する）トレードオフ、2割特例等の経過措置 ③登録申請から登録番号通知までの期間

### 5. 消費税（980円は税込か税抜か）（未検証）

- 論点: ①総額表示義務（消費税法63条）により消費者向けは税込表示が原則 ②App Store Connectで設定する価格は税込のストア価格であり、Appleが消費税を扱う（プラットフォーム課税）構造 ③免税事業者の場合の扱い ④980円は既存ティアに存在する

### 6. 請求書払い・口座振替（未検証）

- 論点: ①法人向けの標準的な支払サイトは商慣習であり法定ではない ②口座振替の導入は収納代行会社経由か金融機関直接契約かでリードタイムが大きく異なる。**一般に数週間〜数か月かかるとされ、12月までの導入は現実的でない可能性が高い（未検証だが、スケジュール上は前提にしないのが安全）** ③月額980円という単価に対して請求書払い・口座振替の運用コストが見合うかは別問題

### 7. カード決済の失敗率・初月解約率（未検証）

- 今回のラウンドで検証通過した数値はない。**ベンチマーク数値は引用しない**
- 関連調査: [`DR-07`](DR-07-elderly-payment-methods.md) / [`DR-12`](DR-12-retention-churn.md) / [`DR-10`](DR-10-freemium-conversion.md)（いずれも単体エージェント版）
- 実務上の備え（一般論）: カード更新失敗に対するリトライ（Stripe Smart Retries、Appleの Billing Grace Period／Billing Retry）を有効化すること

## 8. 最短課金開始日（2026年9月19日起点）

### 8.1 Web（Stripe）経路

| 日付 | 作業 |
|---|---|
| 9/19（金） | Stripeアカウント作成、プロフィール・本人確認書類提出、テストモードで実装開始 |
| 9/24〜25 | KYC審査完了（通常2〜3営業日）※不備時は10/1〜10/3 |
| 9/25〜26 | 本番キー切替、価格980円のPrice作成、Checkout公開 |
| **9/26前後** | **最短課金開始（Web）** |

前提: 特商法表記・利用規約・プライバシーポリシーがサイトに掲載済みであること（3章は未検証なので、掲載内容は専門家確認が必要）。

### 8.2 iOS経路

| 日付 | 作業 | 根拠 |
|---|---|---|
| 9/19（金） | Apple Developer Program 登録（個人）。**氏名は法的氏名の半角ローマ字、カード名義も本人名義**。$99支払 | 個人はその場で購入可 |
| 9/19〜9/22 | Account Holder として有料App契約に署名 → 税務フォーム（W-8BEN）→ 銀行情報登録（個人名義・口座記載どおり） | 契約→税務→銀行の依存関係 |
| **同日** | **Small Business Program に登録**（アプリ未公開でも可） | 15%適用が1会計月遅れるため最優先 |
| 9/22〜9/30 | 契約ステータスが Processing/Verifying → Active（※Appleは所要日数を公表していない。**想定バッファ1〜2週間**） | view-agreements-status |
| Active後 | App内課金アイテム（月額980円・自動更新）作成、Sandboxで課金テスト、サインアップ画面の必須表示を実装 | Activeが条件 |
| 10月中旬 | App Store 審査に申請 | 審査期間はAppleが確約していない（未検証） |
| 10月下旬 | 審査通過・リリース＝iOS課金開始 | — |
| **10月末まで** | **会計10月中に最初の売上を立てる（これが12月着金の必須条件）** | 45日ルール |
| 11月上旬〜中旬 | SBPの15%調整が売上に反映開始（10月承認の場合） | 会計月末＋15日 |
| 12月中旬前後 | Appleから初回着金（会計10月分） | 会計月末＋45日以内 |

**iOS経路の最短はもっと早められる**: 申請を10月中旬から9月末〜10月初に前倒しできれば、10月上旬にリリース→会計10月にまるまる1か月の売上が立ち、12月着金の確実性が上がる。**逆にリリースが11月に入ると着金は2027年1月になる。**

### 8.3 12月中の入金到達に向けた逆算（クリティカルパス）

```
【逆算の終点】12月中の着金
   ↑ Appleは会計月末+45日以内に支払
【10/31（会計10月末）】までに App Store で売上が発生している
   ↑ 審査期間（不確定）＋ 修正リジェクト1往復のリスク
【10/10前後】までに App Store 審査へ申請  ← 当初予定の10月中旬より前倒しを推奨
   ↑ IAP構成・Sandbox検証には契約Activeが必要
【10/1前後】までに有料App契約が Active
   ↑ Processing/Verifying（Apple公表値なし）
【9/22前後】までに 契約署名＋税務フォーム＋銀行情報 をすべて提出
   ↑ 署名が全ての前提
【起点】Apple Developer Program 登録 → 契約署名 → 税務 → 銀行 → SBP登録
```

**今すぐやるべき3件（優先順）**

1. **Apple Developer Program 登録 → 有料App契約の署名 → 税務フォーム → 銀行情報**（iOS経路のクリティカルパスの先頭。ここが遅れると全部遅れる）
2. **App Store Small Business Program の登録**（1日遅れると15%適用が最大1会計月遅れる）
3. **Stripeアカウント申込**（KYCが2〜3営業日走るので、実装と並行させる。Web経路が12月の保険になる）

**リスクと緩和**

- 最大の不確定要素は**有料App契約がActiveになるまでの日数（Apple非公表）**と**App Store審査の往復回数**。→ 申請を10月中旬より前倒しし、3.1.2の必須表示チェックリストを申請前に全部潰しておく
- iOSが11月にずれるとApple入金は2027年1月。**12月中の「入金」を絶対要件にするなら、Web（Stripe）経路を先に立てて実売上を作るのが唯一確実な手**（ただしStripeの入金サイクルは未検証なので要確認）
- SBPはアプリ公開を待たずに登録できるので、**ここだけは今日確実に潰せる**

## 9. 情報の時点と限界

- すべてのApple／Stripe記述は2026年9月19日時点で公式ページ原文に到達して確認（Apple入金ページは2026-09-17更新、Stripe日本向けガイドは2026-09-17更新）。**制度・規約は変わるため、実行時に再確認すること**
- 「公式にこう書かれている」と「一般にこう運用されている」の区別: 1章・2.1・1.4・1.5の表中原文は**公式**。1.3末尾の「どの条項で指摘されるか」「1日あたり32円表示のリスク」、8章のスケジュール日数（Apple非公表部分）、3〜7章は**未検証または推論**
- **公式に日数が書かれていない項目**: 有料App契約のProcessing/Verifying期間、税務・銀行情報の検証期間、App Store審査期間、Appleの会計月末日一覧
- 税務（インボイス・消費税）と法務（特商法）の最終判断は税理士・弁護士に確認すること
