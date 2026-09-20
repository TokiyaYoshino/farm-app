# DR-11 アプリストアレビュー立ち上げ調査

- 調査日: 2026-09-19
- 対象: App Store / Google Play での新規アプリのレビュー獲得方法
- **注意: 本レポートは単体エージェントによる調査で、複数票検証を経ていない。また、多くの業界ブログ・統計サイトがアクセス不可（404/403）であったため、定量データは公式ドキュメントと一部学術文献に限定されている**
- 関連: [`DR-05`](DR-05-aso-store-keywords.md)（競合の評価実測） / [`../../app-store-submission.md`](../../app-store-submission.md)

## エグゼクティブサマリー

新規アプリのレビュー獲得において、Apple・Googleの公式APIには**厳格な表示制限**があり、ユーザー体験を損なわない適切なタイミングでの依頼が必須。**規約上、レビューと引き換えの特典提供は禁止、低評価を避けるための事前振り分け（レビューゲーティング）も推奨されていない。**

実測データの入手は困難だったが、一般的な推定ではプロンプト表示ユーザーの1〜2%がレビューを投稿するとされ、**★4平均・10件到達には1,500〜5,000人（日本市場ならさらに1.5〜2倍）の実利用者が必要**と考えられる。

## 1. 規約上の可否（Apple / Google）

### 1.1 Apple App Store

**禁止事項** — App Store Review Guidelines 3.2.2(x):

> "Apps must not force users to rate the app, review the app, download other apps, or other store-related actions in order to access functionality, content, or use of the app."

Section 3: Business:

> "If we find that you have attempted to manipulate reviews, inflate your chart rankings with paid, incentivized, filtered, or fake feedback, or engage with third-party services to do so on your behalf, we will take steps to preserve the integrity of the App Store, which may include expelling you from the Apple Developer Program."

**禁止される行為**: 機能・コンテンツへのアクセス条件としてレビューを強制／有償・インセンティブ付き・偽装レビューによる操作／第三者サービスを使ったレビュー操作／チャートランキングの不正な引き上げ

**許可される行為**: アプリ内アクション（レベルクリア、広告視聴など）へのインセンティブ提供／機能を阻害しない正当なレビュー依頼

**SKStoreReviewController / AppStore.requestReview の制限**（developer.apple.com/app-store/ratings-and-reviews/）:

- **表示回数制限: 365日間で最大3回**
- **システム側で自動制御**（開発者が回数管理する必要はない）
- ユーザーが拒否可能
- **推奨タイミング**: ユーザーが満足を感じる瞬間（タスク完了、レベルクリアなど）
- **避けるべきタイミング**: アプリ起動直後、作業中の中断、ユーザーが不満を感じている時
- 技術的注意: iOS が自動的にレート制限を適用するため、`requestReview()` を呼んでも**プロンプトが必ず表示されるわけではない**

### 1.2 Google Play

**禁止事項**（support.google.com/googleplay/android-developer/answer/9898684）:

- **インセンティブ付きレビュー**: 「レビューと引き換えにインセンティブを提供する」ことは規約違反
- **偽装レビュー**／**欺瞞的なポップアップ**／不適切な内容の誘導／自動化による水増し

**In-App Review API の制限**（developer.android.com/guide/playcore/in-app-review）:

- **時間制限クォータ**: Google Playは表示頻度に時間ベースのクォータを適用（**具体的な数値は非公開**）
- **1ヶ月未満の短期間で複数回** `launchReviewFlow()` を呼んでも、ダイアログが表示されない場合がある
- クォータは予告なく変更される
- **事前の誘導質問は禁止**: 「このアプリは好きですか？」「★5をつけてくれますか？」などの質問をレビューボタンの前後に表示してはいけない

**設計上の重要注意事項**:
- **CTA（行動喚起ボタン）を作らない**: ユーザーがクォータに達している場合、ボタンを押してもダイアログが表示されず、**壊れた体験になる**。そのような用途では Play Store への直接リンクを使用する
- レビューカードのサイズ・透明度・形状を変更しない／カードの上下にオーバーレイを追加しない

## 2. レビューゲーティング（低評価の事前振り分け）の可否

- **Apple**: 公式ガイドラインに明示的な言及はないが、Section 3 の「filtered feedback」の禁止に**該当する可能性**
- **Google**: **明示的に禁止**（「事前の誘導質問」として、レビューボタンの前後で満足度や評価を尋ねることが禁止）

**結論: レビューゲーティングはグレーゾーン〜明確に禁止の範囲であり、規約違反リスクがある。実装は推奨されない。**

## 3. レビュー依頼のタイミングと転換率

### 公式推奨タイミング

- **Apple**: ユーザーが満足を感じる瞬間（タスク完了、レベルクリア、取引完了後）。避けるべき＝アプリ起動直後、重要なワークフロー中、フラストレーションを感じている時
- **Google**: ユーザーがアプリを十分に体験した後。過度なプロンプトは避ける

### 転換率（実測データ）

**データ入手困難**: 多くの業界ブログ・ASO企業サイトがアクセス不可。

**一般的な推定（非公式・出典確認できず）**:
- プロンプトを表示されたユーザーのうち **1〜2%** がレビューを実際に投稿
- 満足度が高いタイミング（ポジティブな体験直後）では **2〜5%** に上昇する可能性
- アプリ起動直後や不満時のプロンプトでは **0.5%以下**

**学術研究**（全文アクセスが必要で、具体的な転換率の数値は未取得）:
- Söllberg, Wang, Numminen (2023) "Combinatory Role of Online Ratings and Reviews" — Journal of Marketing Analytics
- Pella et al. (2022) "Impact of Online Reviews on Download Numbers" — 720アプリのデータ分析
- Gokgoz, Ataman, van Bruggen (2021) "Understanding Drivers of Mobile Application Downloads" — Journal of Business Research

## 4. 評価とダウンロード率の関係

**アクセス可能だったデータ: ほぼなし。** Sensor Tower, Apptopia, data.ai 等のブログ記事が 404 / 403 エラー。

**一般的な業界知見（非公式・出典確認できず。推定値として扱うこと）**:
- ★3.0未満: ダウンロード率が大幅に低下（推定 50〜70% 減）
- ★3.5〜4.0: 標準的な水準
- ★4.5以上: ダウンロード率が 20〜40% 上昇（★4.0と比較）
- レビュー件数: 10件未満は信頼性が低いと見なされる。50件以上で安定

上記3つの学術論文は「評価がダウンロード数に有意な影響を与える」ことを示唆しているが、具体的な倍率は論文全文の入手が必要。

## 5. ★4・レビュー10件到達に必要な利用者数

### 前提条件

- プロンプト表示率: 実利用者の 30〜50%（アプリの UX 設計による）
- レビュー投稿率: プロンプト表示者の 1〜2%
- ポジティブレビュー率（★4以上）: 60〜70%

### 計算例

**ケース1（保守的）**: 1000人 → プロンプト300人 → レビュー3件 → ★4以上 1.8件
→ **10件到達には 5,000人**

**ケース2（楽観的）**: 1000人 → プロンプト500人 → レビュー10件 → ★4以上 7件
→ **10件到達には 1,500人**

**結論: ★4平均・レビュー10件到達には、1,500〜5,000人の実利用者が必要と推定される。中央値として 2,500〜3,000人 が現実的な目標。**

※ [`DR-05`](DR-05-aso-store-keywords.md) の実測と整合する: アグリハブは自称3万人・Play 1万+DL に対し iOS 評価125件（≒0.4%）。

## 6. 日本のレビュー投稿率の特性

**日本と海外のレビュー投稿率を比較する公開データは見つからなかった。**

一般的な観察（非公式）: 日本ユーザーのレビュー投稿率は低いとされる（控えめな文化、匿名性への配慮、批判を避ける傾向）。推定で欧米の 50〜70% 程度。

**影響: §5 の計算例では、日本市場の場合さらに 1.5〜2倍の利用者数が必要になる可能性（例: ★4・10件到達に 3,000〜7,000人）。**

## 7. 低評価が付いたときの対応（開発者返信の効果）

### Apple の推奨

- **簡潔に**: フィードバックに直接対応する
- **敬意を持って**: 個人情報、マーケティング用語、スパムを避ける
- **親しみやすく**: ブランドに一貫したトーンを使用
- **パーソナライズ**: 一般的なテンプレートではなく個別に対応
- **優先順位**: 最低評価レビューや技術的問題に言及しているものを優先
- **プロアクティブな対応**: アップデートリリース時に該当する古いレビューに返信して修正を伝える。App Store Connect でレビュー編集のメール通知を設定

### 開発者返信の効果（実測データ）

**データ入手困難**: 開発者返信がダウンロード率や評価改善に与える定量的な効果を示すデータは見つからなかった。

※ [`DR-05`](DR-05-aso-store-keywords.md) §4.1 の9位・§5 の3番に**実例**あり — アグリハブでは「LINEで相談したらその日の夜に修正された」が★5の理由になる一方、「対応、態度が非常に悪い」「開発者がキレすぎてて見苦しい」が★1の直接原因になっている。**速さは褒められ、態度は叩かれる。**

## 8. レビュー依頼の実装仕様（推奨）

### 8.1 iOS (SKStoreReviewController)

**呼び出しタイミング**
1. **初回**: ユーザーが主要な機能を3〜5回使用した後（例: 作業記録を5件登録した後）
2. **2回目**: 初回から1〜2ヶ月後、かつユーザーがアクティブに使用している場合
3. **3回目**: メジャーアップデート後、新機能を体験した後

```swift
import StoreKit

func requestReviewIfAppropriate() {
    let completedTasksCount = UserDefaults.standard.integer(forKey: "completedTasksCount")
    let lastReviewRequestDate = UserDefaults.standard.object(forKey: "lastReviewRequestDate") as? Date

    // 条件: タスク完了数が5以上、かつ前回から30日以上経過
    guard completedTasksCount >= 5 else { return }

    if let lastDate = lastReviewRequestDate {
        let daysSinceLastRequest = Calendar.current
            .dateComponents([.day], from: lastDate, to: Date()).day ?? 0
        guard daysSinceLastRequest >= 30 else { return }
    }

    SKStoreReviewController.requestReview()
    UserDefaults.standard.set(Date(), forKey: "lastReviewRequestDate")
}
```

**注意**: 365日で3回の制限は iOS が自動管理するため開発者側で厳密にカウントする必要はないが、過度に頻繁に呼び出すとユーザー体験を損なうため **30日以上の間隔を推奨**。

### 8.2 Android (In-App Review API)

Google Play のクォータは非公開だが、1ヶ月未満の短期間で複数回表示されないことが明示されている。**最低でも30日以上の間隔を空ける。**

```kotlin
import com.google.android.play.core.review.ReviewManagerFactory

fun requestReview(activity: Activity) {
    val reviewManager = ReviewManagerFactory.create(activity)
    reviewManager.requestReviewFlow().addOnCompleteListener { task ->
        if (task.isSuccessful) {
            reviewManager.launchReviewFlow(activity, task.result)
                .addOnCompleteListener {
                    // レビューフロー完了（投稿したかは不明）。次回表示日を記録
                    saveLastReviewRequestDate()
                }
        } else {
            Log.d("InAppReview", "Review flow failed: ${task.exception}")
        }
    }
}
```

**重要**: **CTAボタンを作らない**（クォータに達している場合ダイアログが表示されず壊れた体験になる）。代わりに Play Store への直接リンクを用意する。

## 9. 規約違反リスクのあるグレー手法

| 手法 | Apple | Google | リスク |
|---|---|---|---|
| レビューと引き換えの特典提供 | 「incentivized feedback」として**明示的に禁止** | 「incentivized reviews」として**明示的に禁止** | デベロッパーアカウント停止 |
| レビューゲーティング（低評価の事前振り分け） | 「filtered feedback」に該当する可能性 | 「事前の誘導質問」として**明示的に禁止** | 規約違反として指摘される可能性 |
| レビュー購入・代行サービス | 「third-party services」として**明示的に禁止** | 「automated services」として**明示的に禁止** | **デベロッパーアカウント永久停止** |

## 10. 実装ロードマップ（farm-app 向け）

**Phase 0: 実装準備（2026年10月上旬）**
- iOS: SKStoreReviewController の実装／Android: In-App Review API の実装
- 呼び出しタイミングのロジック（作業記録5件完了後、かつ30日以上間隔）
- 開発者返信のテンプレート作成

**Phase 1: リリース直後（2026年10月中旬〜11月）**
- 初回レビュープロンプト表示開始／レビュー投稿数の追跡／低評価レビューへの迅速な返信体制

**Phase 2: 初期成長（2026年12月〜2027年1月）**
- ★4・10件到達の進捗確認／レビュー投稿率の分析（実測値の取得）／プロンプトタイミングの最適化

**Phase 3: 継続的改善（2027年2月以降）**
- メジャーアップデート後のレビュー依頼／レビュー数50件到達を目標とした施策／開発者返信の効果測定

## 11. 参考文献・出典

**公式ドキュメント**（すべて 2026-09-19 確認）
1. Apple - App Store Review Guidelines: developer.apple.com/app-store/review/guidelines/
2. Apple - Ratings and Reviews: developer.apple.com/app-store/ratings-and-reviews/
3. Google Play - User Ratings and Reviews Policy: support.google.com/googleplay/android-developer/answer/9898684
4. Android Developers - In-App Review: developer.android.com/guide/playcore/in-app-review

**学術文献**: §3 の3論文（全文未確認だが査読済み）

## 12. 調査の限界

**アクセス不可だった情報源**: Sensor Tower, Apptopia, data.ai の ASO レポート／Adjust, AppsFlyer, Mixpanel の統計ブログ／RevenueCat, CleverTap, Braze のベストプラクティス記事／Stack Overflow, Reddit 等の開発者コミュニティ

**データの信頼性**: 公式ドキュメント＝高信頼性（原文引用）／学術論文＝中〜高（全文未確認）／**転換率・投稿率の推定値＝低信頼性（出典確認できず）**

**推奨される追加調査**: 学術論文の全文入手／ASOツールの有料レポート／競合アプリのレビュー数・評価・DL数の相関調査／**ベータテスト期間の実測**

## 13. 結論と推奨アクション

### 規約遵守の原則
- レビュー購入・インセンティブ提供は**厳禁**
- レビューゲーティングは避ける
- 公式API（SKStoreReviewController / In-App Review API）のみを使用
- 年3回（iOS）または月1回程度（Android）の制限を守る

### 実装仕様
- **タイミング**: 作業記録5件登録後、または主要機能を3〜5回使用した後
- **頻度**: 最低30日以上の間隔
- **ユーザー体験**: 満足度が高い瞬間（タスク完了直後）に表示

### 目標設定
- **★4・レビュー10件**: 2,500〜3,000人の実利用者が目標
- **日本市場の場合**: さらに1.5〜2倍（3,500〜6,000人）が必要な可能性
- **リリース後3ヶ月以内**: 最低10件のレビュー獲得を目指す

### 低評価対応
- **迅速な返信**: 24〜48時間以内
- **パーソナライズ**: テンプレートではなく個別の問題に対応
- **フィードバック反映**: アップデートで修正し、レビューに返信して改善を伝える

### 継続的測定
- レビュー投稿率の実測（プロンプト表示数とレビュー投稿数を追跡）
- タイミング最適化／評価とダウンロードの相関（App Store Connect Analytics）
