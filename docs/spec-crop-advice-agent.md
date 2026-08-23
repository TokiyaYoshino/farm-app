# 仕様書: 作物ごとの相談（農業エージェント）

最終更新: 2026-08-23（origin/main 時点の実装を元に作成）
関連: [`docs/decisions/20260810-next-action-advice.md`](decisions/20260810-next-action-advice.md)（設計判断・検討した他案の詳細はこちら）

このドキュメントは「今どう動くか」だけを追える1枚物。設計に至った経緯・却下案の理由はADR（上記リンク）を参照する。

---

## 1. 概要

### 目的
競合レビュー調査で判明した「次にやる作業・データが分からない」というギャップ（`docs/research/competitor-gap-analysis-2026-08.md`）への対応。既存の記録検索チャット（`api/search-chat.ts`）は「渡された作業記録のみを根拠に答える」設計のため、記録が薄い農場（本番実データ n=18件・4.5か月）では実質何も返せない。この機能は記録の検索ではなく**知識の補填**を担う。

### エージェントとして成立する3条件
| # | 条件 | 実現方法 |
|---|---|---|
| 1 | **会話**として続く | 直近のやりとり（`messages`）を渡し、追加質問に文脈を踏まえて答える |
| 2 | **作物（作付け）ごとに溜まる** | `crop_advice_messages`／`crop_advice_actions` に永続化。作付けを開くと過去の相談が残っている |
| 3 | **作業記録と照合できる** | 助言から構造化した「やること」を `work_type` をキーに `reports` と突き合わせる（3が要点。これが無いと単なるチャット） |

---

## 2. 画面・導線

| 場所 | 内容 |
|---|---|
| `ManageScreen.tsx` | 作物の行から「この作付けを相談する」で `AdviseSheet` を起動 |
| `HomeScreen.tsx` | 「今日の予定」の直後に導線を配置（予定が空のときに詰まるのが本来の課題のため） |
| `AiSheets.tsx` の `AdviseSheet` | スレッド形式のボトムシート（本体） |

### `AdviseSheet` の挙動（`expo-prototype/screens/AiSheets.tsx`）
- 開くと呼び出し元の作物（未指定なら先頭の作付け）を選択し、その作付けのスレッドを読み込む
- 作付けを切り替えるたびにスレッドを読み直す（作物ごとに溜まる、を実現する仕組み）
- 送信時:
  1. 質問をすぐ画面に仮表示（保存の成否を待たせない）
  2. 天気予報（取得できなければ無しで続行）・その作付けの作業記録・登録農薬の適用行（`famic_crop_name` が未設定なら空配列）・会話履歴・過去の助言の照合結果を組み立てて `POST /api/advise`
  3. 成功したら保存済みの行に仮表示を差し替え、失敗時は「回答は表示するが保存されない」旨をエラー表示
  4. `ai_outputs` にもコスト集計用の記録を残す（`kind: "advice"`）
- 「やること」一覧には照合バッジ（実施済み／未実施／期限切れ／照合不可）と、照合に使った期間・該当した記録を併記
- 農薬の情報は本文に混ぜず、`registrationFacts` を原文の表として別枠表示
- 「やらない」判断は `dismissAdviceAction` で `dismissed_at` を立てる（削除ではなく履歴として残す）

---

## 3. データモデル

`scripts/migrations/2026-08-10-crop-advisor.sql`（本番適用済み・2026-08-10）

### `crop_advice_messages`（相談の1発言）
| 列 | 内容 |
|---|---|
| `role` | `user` / `assistant` |
| `content` | 発言本文 |
| `sources` / `limits` | assistant発言のみ。サーバーが固定文言で返した出典・限界 |
| `registration_facts` | FAMIC登録適用部の原文（LLMには生成させず、この列に保存して画面表示） |
| `model` / `usage` / `cost_usd` | 生成に使ったモデル・トークン使用量・コスト |

### `crop_advice_actions`（助言から切り出した「やること」）
| 列 | 内容 |
|---|---|
| `work_type` | `reports.work_type` と同じ語彙、または語彙に載せられなければ `null`（＝**照合不可**であって未実施ではない） |
| `due_from` / `due_to` | LLMが出した期間表現を日付に落としたもの。落とせなければ `null` |
| `when_text` | 「今週中」など画面表示用の原文 |
| `dismissed_at` | 利用者が「やらない」と判断した日時（行は消さない） |

**照合結果（実施済みか否か）はどちらのテーブルにも保存しない**。作業記録は後から増減するため、保存すると実態とずれる。`lib/adviceMatch.ts` で毎回計算する（`metrics.ts`・`pesticideUsage.ts` と同じ方針）。

RLSは他テーブルと同じく現状 `allow_all`（`docs/rls-rollout.md` で一斉に実ポリシー化する予定・未実施）。

---

## 4. API仕様（`api/advise.ts`）

Vercel Serverless Function（Node.js）。`POST` のみ、`OPENAI_API_KEY` のみを持ちSupabaseには触れない。

### リクエスト
```
{
  crop: { name, famic_crop_name?, start_date? },   // name必須・60文字以内
  today?: "YYYY-MM-DD",                             // 省略時はサーバー側の今日
  forecast?: string,                                 // 4000文字以内
  registrations?: RegistrationInfo[],                // FAMIC登録適用部の原文行
  records?: string,                                  // 8000文字以内
  question: string,
  region?: string,
  messages?: { role, content }[],                    // これまでのやりとり（直近12件まで）
  adviceHistory?: string,                             // 過去の助言＋照合結果（6000文字以内）
  workTypes?: string[],                               // 照合可能な作業種別の語彙
}
```

### 情報源3層分離（本機能の核）
| 層 | 内容 | 出所 | 扱い |
|---|---|---|---|
| 1 | 作物名・作付けからの経過日数・今日・地域 | 呼び出し側が渡す事実 | プロンプトに事実として渡す |
| 2 | 希釈倍数・使用時期・使用回数・総使用回数 | FAMIC登録適用部の**原文** | LLMに生成させない。レスポンスの `registrationFacts` として別に返し、画面はそちらを表示 |
| 3 | 作業の段取り・時期の目安 | LLM（gpt-4o-mini系）の一般知識 | 「目安」と明示。公的な栽培基準ではない |

### FAMIC原文の空欄処理
`-`・全角ハイフン・空文字は「制限なし」ではなく**「記載なし（判定不可）」**として扱う（`isBlankField`）。取り違えると法令違反に導くため。

### 作物名の突き合わせ
`crop.famic_crop_name` との**完全一致のみ**（部分一致は誤判定を生む）。`famic_crop_name` が未設定なら適用行を1件も渡さない・返さない。

### `work_type` の扱い
渡された `workTypes` 語彙に完全一致しない作業は API 側で `null` に落とす（近い語彙への丸めはしない）。打ち切った件数は `limits` に明記する。

---

## 5. 照合ロジック（`expo-prototype/lib/adviceMatch.ts`）

「言われた作業を実際にやったか」の判定を1箇所に集約（画面とAIプロンプトで食い違わせないため）。

### 判定は4値（＋dismissed）
| 状態 | 意味 |
|---|---|
| `done` | 照合期間内にその作業の記録がある |
| `pending` | まだ記録が無い（期限内、または期限なし） |
| `overdue` | 期限を過ぎても記録が無い |
| `unmatchable` | 作業記録の語彙に落とせない助言。**「未実施」ではない** |
| `dismissed` | 利用者が「やらない」と判断した |

`pending` と `unmatchable` を混ぜると「やったのに未実施と言われる」か「できていないのに見逃す」のどちらかが起きるため、明確に分離している。

### 照合条件
- 作物（`crop_id`）・作業種別（`work_type` 完全一致）・期間の3条件のみ。**圃場は見ない**（助言は作付け単位で圃場を指定しないため、絞ると別圃場の作業を見落とす）
- 照合期間の開始: 助言が出た日（`due_from` が助言日より後ならそちらを優先）。それ以前の作業は「言われる前にやった」ので数えない
- 照合期間の終わり: 切らない（期限後にやった記録も拾う）
- 期限（`due_to`）が無い助言は期限切れにしない

---

## 6. 法令・安全設計

`docs/decisions/20260805-pesticide-precheck.md` の非対称な安全側判定を継承。

- FAMIC原文の空欄は「判定不可」（「制限なし」と誤読させない）
- `famic_crop_name` 未紐付けなら農薬情報は常に空（他作物の適用情報を誤って提示しない）
- 作物名は完全一致のみ
- プロンプトで禁止: 渡されていない農薬値の推測・補完、新たな農薬名の推薦、施用量の数値断定
- 出典・限界（`sources`／`limits`）はLLMに書かせずサーバー側の固定文言
- 打ち切り（適用行30件・やりとり12件の上限）は黙って行わず `limits` に件数を明記
- `unmatchable` を未実施と決めつけさせない文言をプロンプト・画面の両方に明記

---

## 7. 現在の状態・既知の制限（2026-08-10 本番稼働時点）

- **本番稼働中**（`main` にマージ・マイグレーション2本適用済み）
- 実測: `crop=キャベツ`・`start_date=2026-06-20` で3件の「やること」を生成、`work_type` は3件すべて語彙に完全一致（施肥／防除／除草）＝ `unmatchable` ゼロ
- コスト: 1回 ¥0.07（$0.00044）
- **`crops.famic_crop_name` が7件すべて `null`（未紐付け）**。そのためレスポンスの `registrationFacts` は常に0件、`limits` に「作物名が紐付いていないため薬剤の使用可否は判断していません」が出る。設計どおりの縮退動作であり不具合ではない。紐付け作業は本番データ更新のため要承認・未実行
- `work_type` の命中率は実測1回のみ。摘芯・芽かき等の専門的・作物固有の作業名では語彙外に落ちる可能性が残る
- 実機（Expo）での動作確認（スレッドの読み込み・保存・dismiss）は未実施
- Vercel Production の `OPENAI_API_KEY` は設定済みと確認済み

---

## 8. 関連ファイル一覧

| ファイル | 役割 |
|---|---|
| `api/advise.ts` | API本体 |
| `scripts/test-advise.mjs` | APIの契約テスト（77 assertions） |
| `scripts/migrations/2026-08-10-crop-advisor.sql` | テーブル定義 |
| `scripts/migrations/2026-08-10-organizations-check.sql` | 上記の前提確認用（`organization_id` 参照先の実在確認） |
| `expo-prototype/lib/adviceMatch.ts` | 照合ロジック |
| `expo-prototype/scripts/test-advice-match.mjs` | 照合ロジックのテスト（29 assertions） |
| `expo-prototype/lib/ai.ts` | `adviseApi`・型定義・`AI_FEATURES.nextActionAdvice` |
| `expo-prototype/lib/store.tsx` | `loadCropAdvice`／`saveCropAdviceTurn`／`dismissAdviceAction` |
| `expo-prototype/lib/types.ts` | `CropAdviceMessage` 型 |
| `expo-prototype/screens/AiSheets.tsx` | `AdviseSheet`（UI本体） |
| `expo-prototype/screens/ManageScreen.tsx` | 作物行からの起動導線 |
| `expo-prototype/screens/HomeScreen.tsx` | 今日の予定直後の起動導線 |
| `expo-prototype/scripts/link-famic-crop-names.mjs` | FAMIC作物名の紐付け（1回きりの運用スクリプト、既定は確認のみ・`--apply`で更新） |
