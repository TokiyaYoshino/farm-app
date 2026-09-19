# 個人開発者の課金手続き（iOS App内課金 / Web決済）と所要期間

**調査時点: 2026年9月19日**。制度・料率・処理期間はいずれも変更されうる。税務・法務の最終判断（特商法の省略可否、インボイス登録の要否、消費税の扱い）は税理士・弁護士への確認が必要。以下では「公式文書にこう書かれている」と「一般にこう運用されていると報告されている」を分けて記載する。

---

## Q1. App内課金（自動更新サブスクリプション）の手続きと所要期間

### Takeaway
Apple Developer Program の登録（個人名義可、年 $99）は公式には最大48時間だが実例では数日〜2週間かかる。有料課金を有効にするには「Paid Apps 契約（Schedule 2）の締結 → 税務フォーム提出 → 銀行口座登録」の順が必須で、**税務フォームが未提出だと銀行口座情報の処理自体が進まない**。入金は「会計月末から45日以内」が公式規定、実務上は約33日後が通例と報告されている。

### Cited Findings

**登録（Apple Developer Program）**
- 個人（Individual）登録に必要なのは氏名・生年月日・住所・電話番号・メール等の基本情報で、2ファクタ認証を有効にした Apple Account と、居住地域の成人年齢が要件 — [Apple Developer Program 登録ページ](https://developer.apple.com/programs/enroll/) / [Enrollment - Apple Developer Help](https://developer.apple.com/help/account/membership/program-enrollment)
- 個人登録では D-U-N-S 番号は不要（法人のみ必要）— [テクラル: Apple Developer Program登録方法2026年版](https://www.tekural.com/blog/apple-developer-program-registration-guide)
- 本人確認書類はパスポート推奨、運転免許証も可 — [Qiita: Apple Developer Program個人登録完全ガイド](https://qiita.com/tomada/items/57ed85f66cb3a233ebad)
- 審査期間は「支払い完了後、数分〜24時間」とする解説 — [株式会社一創](https://www.issoh.co.jp/tech/details/7317/)。一方、Apple の画面表示は「最大48時間」で、実例では金曜19時〜火曜17時の約70時間 — [note: 「最大48時間」のはずが丸3日待った話](https://note.com/toyo_kome/n/n12b92041d609)、**2週間かかった個人申請の実例も複数** — [ENISHI BLOG](https://enishiblog.org/post-4617/)、[thwork](https://thwork.net/2020/11/10/appledeveloperprogram%E3%81%AB%E5%80%8B%E4%BA%BA%E7%94%B3%E8%AB%8B%E3%81%97%E3%81%9F%E3%82%892%E9%80%B1%E9%96%93%E3%81%8B%E3%81%8B%E3%81%A3%E3%81%9F%E8%A9%B1/)
- 遅延要因として、身分証のアップロード画像が読み取れず再提出になるケースが報告されている — [Qiita](https://qiita.com/tomada/items/57ed85f66cb3a233ebad)

**課金を有効にするための前提（公式・順序が重要）**
- Apple 公式: 支払いを受け取るには (1) Paid Apps 契約が有効であること、(2) App Store Connect に銀行口座情報を登録していること、(3) 最低支払金額のしきい値を超えていること、(4) 該当地域では月次インボイス要件を満たすこと — [Overview of receiving payments - App Store Connect Help](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments/)
- Apple 公式（銀行口座登録ページ）: 「**You must submit all required tax forms needed for your paid contract in order for us to process banking information**」＝税務フォームを全部出さないと銀行口座情報の処理が進まない。また銀行口座登録の前に Paid Apps 契約の締結が必要 — [Enter banking information - App Store Connect Help](https://developer.apple.com/help/app-store-connect/manage-banking-information/enter-banking-information/)
- 銀行口座情報を Admin/Finance ロールが登録した場合、Account Holder の承認が必要で、**承認後24時間以内に処理**。承認は30日以内に行わないと反映されない。会計月の支払処理が始まった後の変更は、次回支払いから反映される — [同上](https://developer.apple.com/help/app-store-connect/manage-banking-information/enter-banking-information/)
- 日本の開発者は米国税務フォーム **W-8BEN** の提出が必要（App Store Connect の Tax Forms から電子提出）— [zenn: App Storeで有料アプリを公開するための銀行口座・納税フォーム登録手順](https://zenn.dev/moutend/articles/31abd8d6c3ac87)（※Apple 公式ヘルプの当該ページには W-8BEN の名称は明示されておらず「required tax forms」とのみ記載）

**入金サイクル**
- Apple 公式: 「payments are made to the bank account and the currency you provided **within 45 days of the last day of the fiscal month** in which the transaction was completed」 — [Overview of receiving payments](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments/)
- Apple の契約書（Schedule 2/3）: 「payments will be made **no later than forty-five (45) days following the close of the monthly period**」、最低送金額のしきい値の対象 — [Schedule 2 and 3 (v126, 2025年12月17日版) PDF](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf)
- 財務レポート（Financial Reports）は「当会計月の最初の金曜日までに前会計月分が利用可能になる」 — [Overview of receiving payments](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments/)
- 実務上の観測値: Apple は会計月末から **33日後**に支払うのが通例（Apple は公式の支払日カレンダーを公表していないため、コミュニティの観測に基づく推定）— [RevenueCat: Apple fiscal calendar and payment dates](https://www.revenuecat.com/blog/growth/apple-fiscal-calendar-year-payment-dates)、[Superwall: Apple Payment Dates 2026](https://superwall.com/blog/apple-payment-dates-when-app-store-payments-are-sent)
- Apple の会計年度は **10月始まり**。各四半期は「35日の月＋28日の月×2」の 5-4-4 構成。年12回支払い — [Apphud: Apple's Fiscal Calendar and Payment Dates 2026](https://apphud.com/apple-fiscal-calendar-2026)、[Adapty: Apple Fiscal Calendar](https://adapty.io/glossary/apple-fiscal-calendar/)
- 最低支払しきい値: 国・通貨ごとに設定。取得したページの表では **JPY は 0.02**（＝実質ゼロ）、表に無い国・通貨は 40 USD。しきい値未満の分は次回に繰り越し — [Minimum payment threshold - App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/minimum-payment-threshold/) ※この「JPY 0.02」という値はページの表の機械読み取り結果であり、表記が正しいか App Store Connect 上で要確認（後述 Gaps）

**審査期間（アプリ本体）**
- Apple の App Review ページは「提出の 90% が24時間未満で審査される」と記載。ただし Apple は2026年6月に「90%が48時間以内、平均1.5日」とも述べている — [AppCompliance: How Long Does App Store Review Take in 2026](https://appcompliance.io/blog/app-store-review-time-2026/)、[bettercodepush](https://bettercodepush.com/blog/app-store-review-times-2026)
- 実感値は「既存アカウントのアップデートで5時間〜、新規アプリ（特にセンシティブなカテゴリ）で2〜3日」。**新規アプリは更新より時間がかかる**傾向 — [ezscreenshots](https://ezscreenshots.com/blog/app-store-review-time)、[LOW/CODE](https://www.lowcode.agency/blog/app-store-review-time)

### Inferences
- 手続きの**クリティカルパスは「Paid Apps 契約 → 税務フォーム → 銀行口座」の直列**。アプリ審査と並行できるので、10月中旬の申請を待たず、今すぐ Developer Program 登録と同時に着手すべき。これらは App が未公開でも完了できる（App Store Connect の Agreements, Tax, and Banking セクションはアプリの有無と独立）。
- 実務上の登録リードタイムは「公式48時間・実測は数日〜2週間」と幅が大きいので、スケジュールは**2週間バッファ**で引くのが安全。
- 課金の「サーバ側で有効」になるタイミングと「ユーザーが実際に払える」タイミングは別物。サブスク商品は App Store Connect で作成後「Ready to Submit」→ 初回はアプリのバイナリと一緒に審査される（サブスク商品単体の先行審査は原則不可）。

### Gaps
- Apple Developer Program の**日本円建ての年会費**（US$99 相当）の正確な現行価格を、公式ページから確認できなかった（US$99 表記のみ確認）。
- 2026年10月〜2027年1月の **Apple 会計月の正確な開始・終了日と推定支払日**を、一次または信頼できる二次ソースから取得できなかった（apphud.com / adapty.io / aso.dev / revenuecat.com はいずれもネットワーク制限で本文取得不可、検索スニペットのみ）。後述の逆算スケジュールはこの点が推定であることに注意。
- 最低支払しきい値の JPY 値（0.02）の正確性。Apple のヘルプ表の読み取り結果であり、原文の再確認が望ましい。

---

## Q2. 自動更新サブスクリプションの審査で落ちやすい要件（3.1.1 / 3.1.2）

### Takeaway
3.1.2 で落ちる典型は「**購入画面（およびメタデータ）に、価格・期間・自動更新の説明・利用規約(EULA)・プライバシーポリシーへの機能するリンクが揃っていない**」こと。3.1.1 は「アプリ内の機能解放を IAP 以外の手段でやっている」こと。加えて 3.1.2(a) の「**7日以上の期間**」「**ユーザーの全デバイスで利用可能**」「**継続的な価値の提供**」は個人開発の記録系アプリだと説明を求められやすい。

### Cited Findings（ガイドライン原文）
出典はいずれも [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)。

- **3.1.1 In-App Purchase**: 「If you want to unlock features or functionality within your app, (by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version), **you must use in-app purchase**. Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc.」
- 3.1.1: 「Any credits or in-game currencies purchased via in-app purchase **may not expire**, and you should make sure you have a **restore mechanism** for any restorable in-app purchases.」
- 3.1.1（非サブスクの無料試用）: 「Non-subscription apps may offer a free time-based trial period before presenting a full unlock option by setting up a Non-Consumable IAP item at Price Tier 0 that follows the naming convention: 'XX-day Trial.' **Prior to the start of the trial, your app must clearly identify its duration, the content or services that will no longer be accessible when the trial ends, and any downstream charges** the user would need to pay for full functionality.」
- **3.1.2(a) Permissible uses**: 「If you offer an auto-renewable subscription, **you must provide ongoing value to the customer, and the subscription period must last at least seven days and be available across all of the user's devices**.」
- 3.1.2(a) 適切な例として列挙: 「new game levels; episodic content; multiplayer support; **apps that offer consistent, substantive updates**; access to large collections of, or continually updated, media content; **software as a service ("SAAS")**; and cloud support.」
- 3.1.2(a): 「Subscriptions **must work on all of the user's devices** where the app is available.」
- 3.1.2(a): 「those offering subscriptions should allow a user to get what they've paid for **without performing additional tasks**, such as posting on social media, uploading contacts, checking in to the app a certain number of times, etc.」
- 3.1.2(a)（既存アプリのサブスク化）: 「If you are changing your existing app to a subscription-based business model, **you should not take away the primary functionality existing users have already paid for**.」
- 3.1.2(a)（詐欺的手法）: 「Apps that attempt to **trick users into purchasing a subscription under false pretenses or engage in bait-and-switch** and scam practices; these will be removed from the App Store and you may be removed from the Apple Developer Program.」
- **3.1.2(c) Subscription Information**: 「**Before asking a customer to subscribe, you should clearly describe what the user will get for the price.** How many issues per month? How much cloud storage? What kind of access to your service? Ensure you clearly communicate the requirements described in **Schedule 2 of the Apple Developer Program License Agreement**.」
- **5.1.1 Privacy Policy**: 「All apps must include a **link to their privacy policy in the App Store Connect metadata field and within the app** in an easily accessible manner」。収集するデータ・その用途、第三者提供先の保護水準、保持/削除方針と同意撤回・削除請求の方法を明示すること。
- 5.1.1（アカウント）: 「If your app supports account creation, **you must also offer account deletion within the app**.」

### Cited Findings（実際に指摘される点・開発者報告）
- リジェクト実例として「アプリのメタデータに**利用規約（EULA）への機能するリンク**が見つからない」が挙げられている — [Zenn: Appleのサブスクを実装した時にもらった審査のリジェクト対応](https://zenn.dev/kimurayut/scraps/30f170a858eb26)
- 購入画面に「サービス利用規約」「プライバシーポリシーへのリンク」「課金内容の説明」が無いことが 3.1.2 違反になる — [同上](https://zenn.dev/kimurayut/scraps/30f170a858eb26)
- 年額サブスクの価格表示が月額換算の実額と大きく乖離していると、不正確・誤解を招く表示としてガイドライン違反になる — [同上](https://zenn.dev/kimurayut/scraps/30f170a858eb26)
- 対応策として「利用規約とプライバシーポリシーを別々の Web ページで用意」「アプリ内に利用規約へのリンクを実装」「App Store Connect の EULA 欄に利用規約を記入」が推奨されている — [同上](https://zenn.dev/kimurayut/scraps/30f170a858eb26)
- リジェクト全般の実務まとめ — [株式会社ペンタゴン: アプリ審査落ち対策](https://pentagon.tokyo/app/1285/)、[堺総合研究所: リジェクトのポイント](https://docs.sakai-sc.co.jp/article/programing/apple-app-review.html)

### Inferences
- farm-app の文脈で特に注意すべき点:
  1. **3.1.2(a)「全デバイスで利用可能」** — 課金状態をアカウントに紐づけ、別デバイスでも復元できること。Supabase の認証と StoreKit のトランザクションを紐づける設計が必要。「購入の復元」ボタンは実質必須（3.1.1 の restore mechanism）。
  2. **3.1.2(a)「継続的な価値」** — 作業記録アプリは SAAS/クラウド同期として説明可能。レビューノートに「クラウド同期・データ保管・継続更新」を明記するとよい。
  3. **既存無料ユーザーの機能剥奪の禁止** — CLAUDE.md の「新機能追加時に既存機能を削除しない」という方針と整合する。既存の記録機能を有料化で取り上げる設計は 3.1.2(a) に触れるリスクがある。
  4. **5.1.1 のアカウント削除** — ログインを伴うなら、アプリ内でのアカウント削除導線が必須。
  5. 購入画面に必要な要素（実務上の定型）: サブスク名、期間（1か月）、価格（¥980）、自動更新である旨と解約方法、利用規約リンク、プライバシーポリシーリンク、復元ボタン。
- AI 機能を有料の価値として売る場合、3.1.2(a) の「継続的な価値」は説明しやすい一方、CLAUDE.md の「入口に AI の語を出さない」方針と、審査時の説明（レビューノート・App 説明文）は分けて考えてよい。

### Gaps
- Apple Developer Program License Agreement Schedule 2 が求める「サブスク情報の開示項目」の逐語リストは、PDF（v126, 2025年12月17日版）の存在を確認したのみで本文を取得していない。実装前に原文の確認を推奨。

---

## Q3. App Store Small Business Program（手数料15%）

### Takeaway
新規開発者は自動的に対象。申請は無料・10分程度だが、**15%が適用されるのは「登録が承認された会計月の末日から15日後」以降の売上**。承認が遅れると初月の売上に30%が掛かるため、今すぐ（アプリ公開前でも）申請しておくべき。

### Cited Findings
- 対象: 前暦年の proceeds が **100万ドル以下**の既存開発者、および **App Store に新規の開発者**。関連開発者アカウント（Associated Developer Accounts）の合算で判定 — [App Store Small Business Program - Apple Developer](https://developer.apple.com/app-store/small-business-program/)
- 新規開発者は自動的に対象（Automatically eligible）— [同上](https://developer.apple.com/app-store/small-business-program/)
- 申請要件: (1) Apple Developer Program の **Account Holder** であること、(2) App Store Connect で最新の **Paid Apps 契約（Schedule 2）**をレビュー・承諾済みであること、(3) 該当する場合は関連開発者アカウントを申告すること — [同上](https://developer.apple.com/app-store/small-business-program/)
- **適用開始: 「登録が承認された会計月の末日から15日後」**。公式の例: 2022年2月10日に承認 → 調整後手数料（15%）は 2022年3月14日から適用 — [同上](https://developer.apple.com/app-store/small-business-program/)
- 手数料は 15%（標準30%から引き下げ）、対象は有料アプリと Apple の App内課金。申請自体は無料で Apple Developer Program（年 $99）の範囲内、追加費用なし — [RevenueCat: App Store手数料を15%にする方法【2026年版ガイド】](https://www.revenuecat.com/jp/blog/engineering/small-business-program)
- 申請から承認までの手続きは10分程度で完了する簡単なもの、との開発者報告 — [Qiita: App Store Small Business Programを申請してみた](https://qiita.com/y-some/items/4a18f0e8a805f0d6de83)、[.NETゆる〜りワーク: 登録手順](https://www.yururiwork.net/archives/1263)
- 途中で100万ドルを超えた場合は以降の売上に標準30%、翌年以降に下回れば再度対象になれる — [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)

### Inferences
- 「申請してすぐ適用」ではなく「**翌会計月の中旬から**」。9月中に申請・承認されれば、Apple 会計9月末＋15日 ≒ 10月中旬から15%。10月中旬のアプリ申請より前に片付けられるので、**今日やるべきタスクの筆頭**。
- 申請には Paid Apps 契約の承諾が前提なので、「Paid Apps 契約 → SBP 申請」の順。Q1 の手続きと同じ日に着手できる。
- ¥980/月で手数料15%なら Apple 取り分 ¥147、開発者取り分 ¥833/月（税の扱いは別途）。30%なら ¥686。

### Gaps
- 承認までの実際の所要日数について、Apple 公式の記載は見つからなかった（開発者報告では申請作業が10分、承認通知は数日以内とされるが、ばらつきの一次データなし）。

---

## Q4. Web 決済（Stripe）— 個人事業主の開設要件・審査・入金

### Takeaway
Stripe は個人事業主でも開設可能で、**アカウント作成当日から決済を受け付けられる**（審査は後追いで走る）のが実務上の通例。日本の標準アカウントの入金は**デフォルト週次（毎週金曜）で、支払い対象は入金日の4営業日前までの取引**、初回入金だけ約1週間余計にかかる。

### Cited Findings
- 日本の標準アカウントの既定の入金サイクルは**週次（毎週金曜）**。金曜の入金に含まれるのは、**入金日の4営業日前**を基準とした1週間分の取引 — [PAY.JP: Stripeの入金はいつ？入金サイクル・タイミング](https://pay.jp/column/stripe-payout-schedule)
- **初回入金のみ、通常のスケジュールより約1週間長くかかる**（新規アカウントの信頼性確認のため）— [同上](https://pay.jp/column/stripe-payout-schedule)
- 入金サイクルは Stripe ダッシュボードから daily / weekly / monthly / manual に変更可能 — [同上](https://pay.jp/column/stripe-payout-schedule)、[Stripe ドキュメント: 入金スケジュールの管理](https://docs.stripe.com/connect/manage-payout-schedule)
- 加盟店審査では、業種・販売商品・ウェブサイトの運営状況・経営実績が確認される。必要情報は正式な事業者名（個人事業主は氏名）、連絡先、**ウェブサイトURL**、提供する商品・サービスの説明、ビジネスモデルの概要 — [PAY.JP: Stripeの審査とは？流れ・期間・落ちる原因](https://pay.jp/column/stripe-review-guide)
- 個人事業主には登記簿がないため、事業実態を示す資料の用意が必要になる場合がある — [同上](https://pay.jp/column/stripe-review-guide)
- 本人確認（KYC）では顔写真付き身分証明書の提出が求められる。顔写真なしの書類の場合は承認に時間がかかる — [Shopifyコミュニティ](https://community.shopify.com/t/shopify-payment/35162)
- 日本での本人確認・審査の実務まとめ — [PAY.JP: Stripe日本対応ガイド](https://pay.jp/column/stripe-japan-guide)、[ネトデジ: 最短でStripe決済導入してみた](https://ec.minikuru.co.jp/post-48882/)、[ネビ活: 個人向けStripe審査全手順](https://nebikatsu.com/12499.html/)

### Inferences
- Stripe は「アカウント開設→即テスト・本番決済可、KYC書類の追加提出を後から求められる」運用が一般的。**Web 経路は当日〜数日で課金開始可能**で、iOS より圧倒的に速い。
- ただし審査で見られるのは主に**サイトの内容**（特商法表記、利用規約、プライバシーポリシー、サービス説明、価格、解約方法）なので、これらのページを先に整備しておくことが審査通過の実質的な前提。
- 入金までの最短: 12月1日に課金開始 → 初回入金は通常週次＋約1週間なので **12月中旬には着金**が現実的。
- Stripe Billing（サブスクリプション）は Checkout + Customer Portal を使えばコード量が最小。解約導線を Customer Portal に持たせると特商法・消費者契約上の「解約方法の明示」も満たしやすい。

### Gaps
- **Stripe 公式ドキュメント（docs.stripe.com / support.stripe.com）はネットワーク制限で本文を取得できなかった**。上記の入金サイクル・初回入金の記述は PAY.JP（競合の決済代行会社）の解説記事が出典であり、一次情報ではない。**Stripe 公式の「入金」ヘルプページで再確認が必要**。
- 日本における Stripe の審査期間の公式な目安（何営業日）は、一次情報で確認できなかった。

---

## Q5. 特定商取引法に基づく表記

### Takeaway
通信販売では氏名（個人事業主は**戸籍上の氏名**）・住所・電話番号の表示が原則義務。ただし「**請求があったら遅滞なく提供する旨を広告に表示し、かつ実際に遅滞なく提供できる措置を講じている**」場合に限り省略できる、というのが消費者庁の整理。「遅滞なく」は「申込みの意思決定に先立って十分な時間的余裕をもって提供されること」と解釈されており、**開示請求から数日かかる運用は要件を満たさない可能性が高い**。App内課金のみでも、Apple は代理人（agent）として販売するだけで**開発者が販売主体**になるため、表記の必要性は Web 決済と基本的に変わらない。

### Cited Findings
- 通信販売では事業者の氏名（名称）・住所・電話番号の表示が必要。ただし「消費者からの請求によって、これらの事項を記載した書面（インターネット通信販売では電子メールでもよい）を**遅滞なく**提供することを広告に表示し、かつ、実際に請求があった場合に遅滞なく提供できるような措置を講じている場合」には、広告の表示事項を一部省略できる — [消費者庁 特定商取引法ガイド 通信販売広告Q&A](https://www.no-trouble.caa.go.jp/qa/advertising.html)（※本文はネットワーク制限で直接取得できず、検索結果の要約に依拠）
- 「遅滞なく」提供されることとは、「**販売方法等の取引実態に即して、申込みの意思決定に先立って十分な時間的余裕をもって提供されること**」 — [同上](https://www.no-trouble.caa.go.jp/qa/advertising.html)
- 通信販売の表示義務の全体像 — [消費者庁 特定商取引法ガイド 通信販売](https://www.no-trouble.caa.go.jp/what/mailorder/)
- 個人事業主の省略ルールの解説（実務） — [マネーフォワード クラウド確定申告: 特定商取引法に基づく表記とは？個人事業主が守るべき義務](https://biz.moneyforward.com/tax_return/basic/79606/)、[特定商取引法に基づく表記とは？個人事業主の省略ルールを解説](https://spread-site.com/article/ma3vlfbim)
- 住所を非公開にする方法（バーチャルオフィス等）の実務解説 — [STORES Magazine](https://stores.fun/magazine/articles/netshop-tokushoho-guide)、[ワンストップビジネスセンター: 特商法の表記にバーチャルオフィスの住所は使える](https://www.1sbc.com/virtualoffice/about-law/)
- 弁護士による実務解説（Q&A形式） — [Webサイトの利用規約: 特定商取引法に基づく表示のQ&A](https://kiyaku.jp/faq/specified_commercial_transactions.html)、[IT弁護士 中野秀俊: アプリやECサイトに必要な特定商取引法に基づく表記](https://it-bengosi.com/%E3%82%A2%E3%83%97%E3%83%AA%E9%96%8B%E7%99%BA%E3%81%AE%E6%B3%95%E5%BE%8B/ec-apuri/)
- **Apple はアプリ開発者に対し、特定商取引法に基づき氏名・住所・連絡先情報を表示するよう通知している**と報じられている — [ソフトアンテナ: Apple、アプリ開発者に対し特定商取引法に基づき氏名、住所、連絡先情報を表示するよう通知](https://softantenna.com/blog/apple-requirements-for-apps-in-japan/)（※本文はネットワーク制限で取得できず、検索結果の見出し・要約に依拠。**Apple 公式の告知原文の確認が必要**）
- 日本で有料DLまたはアプリ内課金を行うアプリは、App Store 公開時に特定商取引法の情報（販売主体の名前・住所・連絡先）を表示することが求められる — [lisfun: iPhone/iOSアプリの特定商取引法に基づく表記](https://lisfun.com/info/app-store-transactions)
- 記載すべき項目: 事業者の氏名もしくは名称・住所・電話番号、販売価格・送料、支払い方法・支払時期・商品の引渡時期、キャンセル・返品 — [Square: 特定商取引法に基づく表記とは](https://squareup.com/jp/ja/townsquare/the-specified-commercial-transaction-act-for-online-store)
- 令和3年改正特商法による「購入申込み画面（最終確認画面）」の表示義務に関する解説（サブスクの場合、金額・支払時期・自動更新の有無・解約方法を最終確認画面に表示する必要性） — [IKEDA & SOMEYA: ゲーム内通貨を使用したゲーム内アイテムの購入に特商法の適用はあるのか](https://www.ikedasomeya.com/insight/7864)

### Inferences
- **「公式にこう書かれている」**: 省略は「請求があれば遅滞なく提供する旨の広告表示」＋「実際に遅滞なく提供できる措置」の両方が揃って初めて認められる（消費者庁Q&A）。
- **「一般にこう運用されている」**: 個人開発者の多くは「氏名・住所・電話番号はご請求に応じて遅滞なく開示します」とだけ書いて省略している。ただしこれは消費者庁Q&Aの要件を満たす措置（即応できる問い合わせ窓口、営業時間内の返信体制）が伴っていることが前提であり、**単に文言を書いただけでは要件を満たさない**というのが解説の一致した見解。
- App内課金のみか Web 決済もあるかで**法律上の要否は変わらない**と考えられる（いずれも開発者が販売主体の通信販売）。ただし実務上の違いとして、(a) App Store では Apple が「サブスクリプションの管理・解約」を代行するため、解約方法の記載が「App Store の設定から」になる、(b) 返金も Apple が窓口になるため、返品・返金ポリシーの書き方が変わる、(c) Web 決済では自社で最終確認画面（令和3年改正対応）を実装する責任が自社にある。
- 実務的な落とし所として、**バーチャルオフィス／私書箱の住所と転送電話番号を契約して記載する**ほうが、省略運用よりリスクが小さい。費用は月数千円〜、契約は数日〜2週間程度（後述 Gaps）。
- App Store Connect には「App Review Information」の連絡先とは別に、日本向けの特商法情報の入力欄／記載要求がある可能性があるが、Apple 公式の該当ヘルプは確認できていない。

### Gaps
- **消費者庁（caa.go.jp / no-trouble.caa.go.jp）のページ本文をネットワーク制限で取得できなかった**。上記の引用は検索結果の要約経由であり、**原文（通信販売広告Q&A、特定商取引法第11条および施行規則）の直接確認が必須**。
- 経済産業省の見解について、独立した一次資料は取得できなかった（現在、特商法の所管は消費者庁）。
- Apple が日本の開発者に特商法表記を求める公式告知の原文（Apple Developer News / App Store Connect のヘルプ）に到達できなかった。
- バーチャルオフィス契約のリードタイムと費用の具体的な一次情報は未調査。

---

## Q6. インボイス制度（適格請求書発行事業者）

### Takeaway
**消費者向け（BtoC）の月額課金だけなら、適格請求書発行事業者の登録は不要**。必要になるのは、法人・課税事業者の顧客が仕入税額控除を受けたがる場合。登録申請から登録番号の通知までは、国税庁の公表目安で **e-Tax 約1か月、書面 約1.5か月**。

### Cited Findings
- 国税庁公表の登録通知時期の目安: **e-Tax 提出は約1か月、書面提出は約1.5か月**。申請書に記載漏れや誤りがある場合は内容確認のためさらに時間がかかる — [国税庁: 適格請求書発行事業者の登録通知時期の目安について (PDF)](https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/kensu_kikan.pdf)（※PDF 本文はネットワーク制限で取得できず、検索結果の要約に依拠）
- 一部の解説では「e-Tax 経由は概ね1〜2週間、書面は2〜3週間」とする記載もあり、**情報源によって目安が異なる** — [ポートサイド税理士事務所: インボイスの登録完了までどのくらいかかる？](https://ptszeiri.jp/invoice-notification-period/)、[ひとり開業ラボ: インボイス登録のやり方（2026年）](https://hitorikaigyo.com/articles/invoice-toroku-tetsuzuki/)
- 目安を超えている場合や記載誤りがある場合はインボイス登録センターに連絡できる — [国税庁: 各局（所）インボイス登録センターのご案内](https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_yuso.htm)
- 申請手続の一次情報 — [国税庁: 申請手続](https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_shinsei.htm)
- 登録申請の手順・必要書類・登録日の解説 — [BtoBプラットフォーム請求書: インボイス制度の登録申請の手順](https://www.infomart.co.jp/seikyu/column/invoice-system_register)、[新宿間税会: 登録申請の手続き](https://shinjuku-kanzeikai.jp/tax-qa/invoice/registration-procedures.html)

### Inferences
- **登録が必要になる典型ケース**:
  1. 法人顧客（課税事業者・原則課税）に月額課金を売り、相手が仕入税額控除を取りたい場合。
  2. 農協・法人農場・自治体など、経費精算で適格請求書を求める取引先がいる場合。
  3. 逆に、個人農家（多くが免税事業者または簡易課税）中心なら、相手は仕入税額控除を必要としないので**登録は不要**。
- 免税事業者が登録すると**課税事業者になる**（消費税の納税義務が発生する）。¥980/月の規模では、登録によって受け取る消費税の納税負担のほうが重くなる可能性が高く、BtoC 主体なら登録しないのが合理的。この判断は税理士に確認すべき。
- 12月までに法人顧客が見込まれるなら、e-Tax で**10月中に申請**すれば11月中に番号が出る計算。ただし「約1か月」は目安であり、12月の請求に間に合わせるなら10月上旬の申請が安全。

### Gaps
- 国税庁PDFの**最新版の時点（何年何月現在の目安か）**を確認できなかった。2026年9月時点での最新の処理期間は国税庁サイトで再確認が必要。
- 「登録の取りやめ（取消届出）」の期限や、登録後に免税事業者へ戻る際の2割特例・経過措置の現行状況は本調査の範囲外で未確認。

---

## Q7. 消費税の扱い（¥980 は税込か税抜か）と総額表示

### Takeaway
免税事業者は総額表示義務の対象外だが、**消費者が最終的に支払う金額をそのまま表示するのが適正**とされる。実務上は **¥980 を「そのまま利用者が払う額」として提示**（＝内税的に扱う）のが素直で、App Store の価格設定も「利用者が払う額」を選ぶ方式なので整合する。

### Cited Findings
- 総額表示義務とは、事業者が消費者に対してあらかじめ価格を表示する場合に、消費税額（地方消費税額を含む）を含めた価格（税込価格）を表示することを義務付けるもの — [国税庁 No.6902 「総額表示」の義務付け](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6902.htm)
- **免税事業者における価格表示は、消費税の総額表示義務の対象とはされていない**が、仕入れに係る消費税相当額を織り込んだ、消費者の支払うべき価格を表示することが適正な表示 — [国税庁 No.6902](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6902.htm)
- 免税事業者は取引価格（売上）に消費税が課されないため「税込価格」「税抜価格」という概念が存在せず、**消費者が最終的に支払うべき金額を表示することが適正な表示** — [国税庁 No.6902](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6902.htm)
- 総額表示に該当する表示例（本体980円の場合）: 「1,078円（税込）」「1,078円（うち税98円）」「1,078円（税抜価格980円）」「980円（税込1,078円）」など、**はっきりと総額が提示されていること** — [財務省: 令和3年4月1日より税込価格の表示（総額表示）が必要です (PDF)](https://www.mof.go.jp/tax_policy/summary/consumption/210107leaflet_sougaku.pdf)、[財務省: 総額表示に関する主な質問](https://www.mof.go.jp/tax_policy/summary/consumption/a_001.htm)
- 「980円（税抜価格）」「980円＋税」は総額表示義務を満たさない — [Yahoo!ニュース エキスパート（東龍）](https://news.yahoo.co.jp/expert/articles/7e4c5e947a4d36989b0a8e4242864cafc85d2c50)
- 経済産業省の解説資料 — [中小企業庁: 消費税の総額表示について (PDF)](https://www.chusho.meti.go.jp/zaimu/zeisei/shouhizei/syouhizei_sogakuhyoji.pdf)

### Inferences
- **¥980 を「月額980円」とだけ表示し、支払額が980円である**運用が最もシンプルで、免税事業者の適正表示にも合致する。「980円＋税」は避ける。
- 将来、課税事業者になった場合（売上1,000万円超 or インボイス登録）、¥980 を内税として扱うなら本体価格は ¥891（税 ¥89）になる。**この切り替えで値上げが発生しないよう、最初から「支払額980円」として設計しておくのが安全**。
- App Store の価格設定は「顧客が支払う額（消費税込み）」を選ぶ方式で、Apple が日本の消費税を徴収・納付する（Apple が agent として）ため、開発者側の表示は「¥980」で完結する。※ Apple の日本における消費税の取扱い（開発者が納税義務者か Apple か）は本調査で一次確認できておらず、税理士に確認すべき事項。
- Stripe 側は税率設定（Stripe Tax または固定の税率オブジェクト）を使うかどうかを決める必要があるが、免税事業者なら「税を分離しない980円」で運用するのが整合的。

### Gaps
- **Apple の App内課金における日本の消費税の納税主体**（Apple が「電気通信利用役務の提供」のプラットフォーム課税で納付しているのか、開発者が納付義務者か）について、一次情報を確認できなかった。免税事業者の売上判定（1,000万円の分母）にも影響するため、税理士確認が必要。

---

## Q8. 請求書払い・口座振替（法人顧客向け）

### Takeaway
法人向け請求書払いの標準は「**月末締め翌月末払い**（30日サイト）」で、入金は課金開始から最大2か月遅れる。口座振替は金融機関との手続きに**1〜2か月**かかるため、12月に間に合わせるのは現実的でない。

### Cited Findings
- 国内商取引では30日サイトと60日サイトが一般的で、「月末締め翌月末払い」「月末締め翌々月末払い」という形で設定される。**30日サイトが日本の商取引で最も一般的**で、IT・サービス業でも広く見られる — [マネーフォワード: 支払サイトとは？](https://biz.moneyforward.com/accounting/basic/46313/)
- SaaS での実例: 10/1 契約開始なら、初回は10月末請求・11月末までに銀行振込、以降も月末請求・翌月末振込 — [Zenn: Stripeでサブスクを実装したが途中で法人から月末締め翌月末払いをお願いされることが多くなった時に読む記事](https://zenn.dev/kusuke/articles/05bc1590966cb4)
- 支払サイトと下請法の60日上限の解説 — [freee: 支払いサイトとは？下請法の60日上限](https://www.freee.co.jp/kb/kb-accounting/payment-site/)
- 請求書の支払期限は「翌月末」「翌々月末」の2パターンが基本 — [マネーフォワード クラウド請求書](https://biz.moneyforward.com/invoice/basic/50029/)
- **口座振替は、郵送期間を含め金融機関の手続き完了までに1〜2か月程度**かかる — [決済代行のゼウス: 口座振替とは？集金代行を利用した口座振替サービスの導入方法](https://www.cardservice.co.jp/support/beginner/begin_31.html)
- 口座振替は顧客・事業者・金融機関の間での事前手続きを要し、**利用開始まで約1か月から2か月**かかると想定するとよい — [マネーフォワード: 口座振替・収納代行とは？](https://biz.moneyforward.com/accounting/basic/78966/)
- 購入者の口座情報を登録するまでに1〜2か月かかることがある — [サブスクペイ: 口座振替（自動引き落とし）の導入方法](https://www.robotpayment.co.jp/beginner/furikae.html)
- **個人事業主でも口座振替（集金代行）は導入可能**とされる — [リコーリース: 個人事業主でも口座振替を導入できる？](https://www.rl-shukin.jp/qa/p95.html)
- 収納代行と集金代行（口座振替）の違い — [マネーフォワード](https://biz.moneyforward.com/accounting/basic/78972/)、サービス比較 — [アスピック: 口座振替サービス比較13選](https://www.aspicjapan.org/asu/article/22230)

### Inferences
- **12月中に入金を立てる目的では、請求書払いも口座振替も使えない**。請求書払いなら10月に契約開始 → 10月末請求 → 11月末入金、というスケジュールでようやく12月前に着金する。
- 口座振替は「収納代行会社の審査（個人事業主は通常より厳しい）＋金融機関登録＋顧客の口座振替依頼書の回収」が直列で走るため、今日から始めても引き落とし開始は早くて11月末〜12月末。12月に入金を確定させる手段としては不確実。
- 法人顧客向けには、**当面は Stripe のカード決済＋（必要なら）銀行振込での請求書払い**に絞るのが現実的。口座振替は2027年以降の検討事項。

### Gaps
- 具体的な収納代行サービス（リコーリース、ROBOT PAYMENT サブスクペイ、ゼウス等）の**個人事業主向けの審査基準・初期費用・月額費用・最短リードタイム**の個別数値は、各社公式サイトの本文まで到達していない。

---

## Q9. サブスクの決済失敗率（involuntary churn）と初月解約率

### Takeaway
解約全体の **20〜40% が非自発的（決済失敗由来）**、決済の失敗率は業界平均で約8%。リトライ・督促（dunning）を実装すれば失敗分の **50〜70% は回収できる**とされる。初月解約率の一般値は信頼できる一次ソースを確認できなかった。

### Cited Findings
- **サブスク解約の20〜40%が非自発的（involuntary）**。リスクの高い業種では48%に達する報告もある — [Baremetrics: Involuntary Churn (2026)](https://baremetrics.com/blog/involuntary-churn)、[RetentionLens: The State of Involuntary Churn 2026](https://retentionlens.com/state-of-involuntary-churn)
- 非自発的解約は全カテゴリを通じて解約全体の **18〜32%** を占める — [Churnkey: State of Retention 2025](https://churnkey.co/reports/state-of-retention-2025)
- **業界横断の決済失敗率の平均は 7.9%**、一部業種では 14.7% に達する — [The Kaplan Group: 55 SaaS and B2B Payment Statistics for 2025](https://www.kaplancollectionagency.com/news/subscription-facts-55-saas-and-b2b-payment-statistics-for-2025/)
- ソフトウェアのサブスクでは月次解約が**自発 2.41% / 非自発 0.86%** に分かれるという数値 — [SubJolt: Churn Rate Benchmarks 2026](https://www.subjolt.com/guides/churn-rate-benchmarks/)
- DTC のサブスクボックスは物理カードの問題で非自発的解約が 8〜15%、B2B SaaS は 2〜5% — [Slicker: Involuntary vs Voluntary Churn (2026年5月)](https://www.slickerhq.com/resources/blog/involuntary-churn-vs-voluntary-churn)
- 2025年にサブスク事業者が決済失敗で失った額は約 1,290億ドルと推計 — [subrevival: What Is Involuntary Churn?](https://subrevival.com/guides/what-is-involuntary-churn)
- 適切なリカバリープロセスがあれば**失敗した決済の 50〜70% は回収できる** — [Baremetrics](https://baremetrics.com/blog/involuntary-churn)
- 一般的な解約率のベンチマーク — [Focus Digital: Average Churn Rate for Subscription Services](https://focus-digital.co/average-churn-rate-subscription-services/)、[Count.co: Involuntary Churn Rate](https://count.co/metric/involuntary-churn-rate)

### Inferences
- **iOS の App内課金では非自発的解約の管理が Apple 側にある**（Apple が「Billing Retry」を最大60日間実施し、Grace Period を設定できる）。開発者がやるべきは App Store Connect で **Billing Grace Period を有効化**すること。Web（Stripe）では Smart Retries と Dunning メールの設定が必要。
- ¥980/月・国内の個人ユーザー中心なら、カードの失効・限度額超過が主因で、実効的な非自発解約率は数%/月のオーダーと見込める。ただし上記ベンチマークは英語圏 SaaS/DTC 中心で、**日本の農業従事者という顧客層への外挿は根拠が弱い**。
- 12月の「課金が立っている」の目標設計上は、非自発的解約よりも**初期の契約獲得数**がボトルネックになる。

### Gaps
- **初月解約率（first-month churn / trial-to-paid 後の1か月目の解約率）の一般的な水準について、信頼できる一次ソースを確認できなかった**。上記の出典はいずれもベンダーのブログ記事（Baremetrics、Churnkey、Slicker 等）で、サンプル構成や算定方法が明示されていないものが多く、数値は幅を持って解釈すべき。
- 日本国内のサブスクアプリの解約率ベンチマークは本調査で見つけられなかった。

---

## 統合: 最短の課金開始日と12月逆算スケジュール

### Takeaway
**Web（Stripe）経路の最短課金開始は2026年9月下旬（今日から数日〜1週間）**、**iOS 経路の最短は2026年10月中旬〜下旬（アプリ審査通過日）**。12月中の「入金」到達は、Web 経路なら余裕を持って可能、iOS 経路は Apple の45日規定のため **10月中に課金が立っていないと12月着金は危うい**。

### 各手続きのサマリ（何を / どこに / 何日 / 費用 / 個人事業主可否）

| 手続き | どこに | 所要 | 費用 | 個人事業主 |
|---|---|---|---|---|
| Apple Developer Program 登録 | developer.apple.com | 公式最大48時間、実例で数日〜2週間 | 年 US$99 | 可（D-U-N-S不要） |
| Paid Apps 契約（Schedule 2）締結 | App Store Connect | 即日（画面で承諾） | 無料 | 可 |
| 税務フォーム（W-8BEN 等）提出 | App Store Connect | 即日入力、審査で数日 | 無料 | 可 |
| 銀行口座情報の登録 | App Store Connect | 入力即日、Account Holder 承認後24時間で処理 | 無料 | 可（個人名義口座） |
| Small Business Program 申請 | developer.apple.com/app-store/small-business-program/enroll/ | 申請10分、**適用は承認された会計月末+15日** | 無料 | 可 |
| サブスク商品（自動更新）作成 | App Store Connect | 即日、初回はアプリと一緒に審査 | 無料 | 可 |
| アプリ審査 | App Review | 公式「90%が24時間未満」、新規アプリは2〜3日、リジェクト時は再提出ごとに繰り返し | 無料 | 可 |
| Apple からの入金 | — | **会計月末から45日以内**（実測約33日） | 手数料15%（SBP適用後） | 可 |
| Stripe アカウント開設 | stripe.com | 当日〜、KYC は後追い | 初期/月額なし、決済手数料（日本は3.6%が標準とされるが公式未確認） | 可 |
| Stripe 初回入金 | — | 週次（金曜、4営業日前締め）＋初回は約1週間追加 | — | 可 |
| インボイス登録 | 国税庁 e-Tax | e-Tax 約1か月 / 書面 約1.5か月 | 無料 | 可 |
| 口座振替（収納代行） | 各収納代行会社 | **1〜2か月** | 各社による | 可（審査あり） |
| 特商法表記ページ作成 | 自社サイト＋アプリ内 | 即日 | 無料（バーチャルオフィス利用なら月数千円〜） | 可 |

### 最短の課金開始日（2026年9月19日起算）

**Web（Stripe）経路: 最短 2026年9月22日〜26日頃**
- 前提作業: 特商法表記・利用規約・プライバシーポリシー・料金ページを公開 → Stripe アカウント作成 → Stripe Billing（Checkout + Customer Portal）実装 → 本番キーで公開。
- Stripe は開設直後から本番決済を受け付けられる運用が通例（KYC 書類提出は後追い）。ボトルネックは実装と法定表記ページの整備であって、Stripe 側の審査ではない。
- ※「当日決済可能」の一次ソース（Stripe 公式）は本調査で確認できていない（Gaps 参照）。

**iOS 経路: 最短 2026年10月中旬〜下旬（現実的には10月20日前後）**
- クリティカルパス: Developer Program 登録（〜9/25、遅延リスク込みで〜10/3）→ Paid Apps 契約＋税務フォーム＋銀行口座（9月中に完了可）→ SBP 申請（9月中）→ サブスク商品作成＋アプリ実装 → 10月中旬に審査提出 → 審査 1〜3日（リジェクト1回で +2〜5日）→ **リリース日に課金開始**。
- リジェクトを1回見込んで **10月20日前後が現実的な課金開始日**。10月中旬の申請予定と整合する。

### 12月中に「入金」まで到達させる逆算スケジュール

前提: Apple の支払いは「会計月末から45日以内（実測約33日）」。Apple の会計年度は10月始まりで、各四半期は 5-4-4 週構成。**FY2027 Q1 の最初の会計月（5週）はおおむね9月下旬〜10月末、次の会計月（4週）が11月、その次が12月**と推定される（※正確な会計月の区切り日は取得できなかった。Gaps 参照）。

| 期限 | やること | 根拠 |
|---|---|---|
| **9/19〜9/22（今日〜3日）** | Apple Developer Program 登録申請（本人確認書類はパスポート推奨）／ Stripe アカウント開設／特商法表記・利用規約・プライバシーポリシーのドラフト | 登録は実例で2週間かかることがある |
| **9/22〜9/30** | 登録承認後すぐ: Paid Apps 契約承諾 → **税務フォーム（W-8BEN）提出** → 銀行口座登録 → **SBP 申請**。この順序は必須 | 税務フォーム未提出だと口座情報が処理されない |
| **9月末まで（SBPのデッドライン）** | SBP の承認を9月の Apple 会計月内に取る。承認が9月会計月内なら 15% は**10月中旬から**適用 | 「承認された会計月末+15日」 |
| **10/1〜10/10** | Web 版の課金を先行リリース（Stripe Billing）。**ここで「課金が立つ」状態を確保** | Apple 審査のリスクヘッジ |
| **10/10〜10/15** | iOS: サブスク商品を App Store Connect で作成、購入画面に価格/期間/自動更新の説明/利用規約リンク/プライバシーポリシーリンク/復元ボタンを実装。アカウント削除導線を実装 | 3.1.2(c) / 5.1.1 |
| **10/15** | **App Store 申請（審査提出）** | 予定どおり |
| **10/20前後** | 審査通過 → リリース → **iOS 課金開始**。以降の売上は10月の会計月に計上 | リジェクト1回分のバッファ込み |
| **10/31（Apple会計10月の月末・推定）** | **この日までに iOS の売上が立っていること**。ここが12月着金の分水嶺 | 会計月末+33〜45日 → 12月上旬 |
| **11月上旬** | Stripe の初回入金が着金（10月分）。Financial Reports で10月分の Apple proceeds を確認 | Stripe 週次＋初回1週間、Apple は会計月の最初の金曜までにレポート |
| **11月末〜12月上旬** | 法人顧客がいれば10月末請求分が着金（月末締め翌月末払い） | 30日サイトが標準 |
| **12月上旬（推定 12/3〜12/15）** | **Apple から10月会計月分の入金**（会計月末+33日で12月初旬、公式上限の45日でも12/15まで） | 45日以内が公式規定 |
| **12月末** | Stripe の11月・12月分が随時着金。Apple の11月会計月分は12月末〜1月上旬 | — |

**リスクと代替案**
- iOS 審査が10月末までに通らなかった場合、Apple からの初回入金は**1月にずれ込む**（11月会計月分は12月末〜1月上旬、12月会計月分は1月末〜2月）。この場合、12月の「入金」目標は **Web（Stripe）経路だけで達成する**必要がある。
- したがって **Web 課金の先行リリース（10月上旬）が、12月入金目標に対する最も確実な保険**。iOS は「12月までに課金開始」は可能でも「12月までに着金」は Apple の支払サイクル次第。
- Apple の最低支払しきい値（日本円は実質ゼロと読める）に阻まれて繰り越される懸念は小さいが、App Store Connect の表示で要確認。

### Gaps（統合部分）
- **Apple の2026年10〜12月の会計月の正確な区切り日と推定支払日**が未確認。上記の「10/31」「12月上旬」は 5-4-4 構成と10月始まりから推定した値であり、**App Store Connect の Payments and Financial Reports で実際のカレンダーを確認すること**。
- Stripe の日本での決済手数料率（3.6% とされる）について、Stripe 公式の価格ページに到達できなかった。
- Apple のアプリ審査が「新規アプリの初回提出」でどれだけかかるかの Apple 公式の数値（90%/24時間 vs 90%/48時間・平均1.5日）は、出典が二次情報で食い違っている。Apple 公式の App Review ページ原文の確認が望ましい。
