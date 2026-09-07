# 仕様書: 作物ごとの相談（農業エージェント）

最終更新: 2026-09-06（9章「畑全体の相談」を追加。1〜8章はExpo版を基準に書かれた2026-08-23時点の記述で、その後Web版にも移植済み）
関連: [`docs/decisions/20260810-next-action-advice.md`](decisions/20260810-next-action-advice.md)（設計判断・検討した他案の詳細はこちら）、[`docs/decisions/20260906-general-advice-entry.md`](decisions/20260906-general-advice-entry.md)（畑全体の相談・ホーム導線の格上げ）

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
| `watch_points` / `unknowns` | assistant発言のみ。「今の時期に見ておくべき点」と「渡された情報では判断できないこと」。生成はしていたが保存先が無く画面に出ていなかったため 2026-08-29 に列を追加した（既存行は null） |
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

RLSは実ポリシー適用済み（`crop_advice_messages_all_own_org` ほか、条件は `organization_id = jwt_organization_id()`）。**作物を見ていないので `crop_id` が null の行も読み書きできる**（2026-09-07 に本番のポリシー定義で確認）。

---

## 4. API仕様（`api/advise.ts`）

Vercel Serverless Function（Node.js）。`POST` のみ、`OPENAI_API_KEY` のみを持ちSupabaseには触れない。

### リクエスト
```
{
  crop?: { name, famic_crop_name?, start_date? },  // 省略で「畑全体の相談」（9章）。渡すなら name必須・60文字以内
  today?: "YYYY-MM-DD",                             // 省略時はサーバー側の今日
  forecast?: string,                                 // 4000文字以内
  registrations?: RegistrationInfo[],                // FAMIC登録適用部の原文行
  records?: string,                                  // 8000文字以内
  aggregates?: string,                                // 呼び出し側が事前に数えた値（4000文字以内・下記）
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

### 公的な防除マニュアルを渡す（2026-09-07〜）
農水省「総合防除実践マニュアル」の作目別PDFから抽出したテキストを `references`（`{title, source, text}[]`・合計12000字まで）で渡し、「## 公的な防除マニュアル（原文・この範囲は資料に基づく）」として置く。出典は `sources` に必ず載せ、画面の「この回答の前提」から原文へ辿れるようにする（公共データ利用規約が求める出典表示でもある）。対応は**キャベツ・ぶどうの2作目のみ**で、近い作物への代用はしない。資料の栽培暦は特定産地を想定した例なので時期はそのまま当てはめさせず、薬剤の可否は従来どおり FAMIC 原文でのみ判断する（`docs/decisions/20260907-national-references.md`）。

### 集計は渡す（2026-09-06〜）
散布履歴（`formatSprayHistoryForPrompt`）と年×作業種別の件数（`formatWorkCountsForPrompt`）をクライアントが `aggregates` として渡し、プロンプトは「## 自農場の集計（コードが数えた確定値・数え直さないこと）」の別ブロックに置く。**新しい集計は書かない**——画面・防除助言と同じ関数を通すことで、AIの言うことと画面の数字が食い違わないようにする。渡すだけでは使わないため「散布の時期・間隔・回数の質問では必ず答えに反映する」ことと、「同じ商品の繰り返しを、同じ薬剤を続けてよい根拠にしない」ことをプロンプトで明示している。

### 返答の長さと聞き返し（2026-09-06〜）
文数の固定縛り（「2〜3文」「全体500字程度」）は廃止し、長さは質問に合わせさせる（結論を先に述べる原則は維持）。情報が足りないときの聞き返しは `follow_up_question`（40字以内の疑問文 or `null`）として**スキーマの専用枠**に置く —— プロンプトの指示だけでは、聞くべきことを `unknowns` に流してしまうため。`unknowns` は「判断できないこと」、`follow_up_question` は「利用者に尋ねること」で役割が違う。クライアントは聞き返しを本文の最後の段落として `content` に連結して保存する（`docs/decisions/20260906-advice-reply-tone.md`）。

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
- `crops.famic_crop_name` は7件中4件が紐付け済み（2026-09-07 時点。ぶどう×2・キャベツ×2）。残る3件（ほうれん草・にんにく・たまねぎ）は、登録済みの農薬に該当作物の適用行が無いため紐付けても `registrationFacts` は0件のまま。未紐付けの作付けでは `limits` に「作物名が紐付いていないため薬剤の使用可否は判断していません」が出る（設計どおりの縮退）。紐付けの妥当性は `scripts/check-crop-links.mjs` で検査できる
- `work_type` の命中率は実測1回のみ。摘芯・芽かき等の専門的・作物固有の作業名では語彙外に落ちる可能性が残る
- 実機（Expo）での動作確認（スレッドの読み込み・保存・dismiss）は未実施
- Vercel Production の `OPENAI_API_KEY` は設定済みと確認済み

---

## 8. 関連ファイル一覧

| ファイル | 役割 |
|---|---|
| `api/advise.ts` | API本体 |
| `scripts/test-advise.mjs` | APIの契約テスト（130 assertions） |
| `scripts/fetch-maff-ipm.mjs` | 農水省の防除マニュアルの取り込み（`src/data/maffIpmData.ts` を生成） |
| `src/data/maffIpm.ts` | 作物名から資料を引く（対応が無ければ空＝資料なしとして縮退） |
| `src/data/maffIpmData.ts` | 取り込んだ原文（自動生成・手で編集しない） |
| `scripts/test-maff-ipm.mjs` | 引き当ての検証（21 assertions。**近い作物に当てない**ことが主眼） |
| `scripts/test-advice-match.mjs` | Web版の照合ロジックのテスト（37 assertions） |
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
| `src/App.tsx` | Web版の実装（スレッド・シート・ホーム導線。機能6のWeb移植は2026-08-23以降に完了） |
| `src/lib/adviceMatch.ts` | Web版の照合ロジック（Expo版とは型定義のみ異なる） |
| `scripts/migrations/2026-09-06-crop-advice-general-thread.sql` | 畑全体の相談のための `crop_id` nullable 化 |

---

## 9. 畑全体の相談（`crop_id` なし、2026-09-06〜）

作物を指定しないスレッドを1本足した。作物を1件も登録していない利用者と、作物にまたがる相談のための入口（設計判断は [`docs/decisions/20260906-general-advice-entry.md`](decisions/20260906-general-advice-entry.md)）。

- **保存先は同じ2テーブル**。`crop_id` を nullable 化し、null = 畑全体のスレッドとする（`scripts/migrations/2026-09-06-crop-advice-general-thread.sql`）。読み出しは `.is("crop_id", null)`
- **導線**: ホームの「相談する」カード（旧「作付け中」カード）の主操作ボタン。行き先は作物0件なら畑全体、1件ならその作付け、2件以上なら畑全体。シート上部の対象セレクタで切り替えられる
- **農薬の適用情報は照合しない**。作物が定まらないため `api/advise.ts` は `crop` 未指定を `isGeneral` として扱い、適用情報を渡されてもプロンプトに載せず、`limits` に「作物を指定していない相談のため、薬剤の使用可否は判断していません。…対象の作物を選んで相談してください」を必ず付ける
- **記録は全作物を渡す**（作物名を各行に添える）。照合（`src/lib/adviceMatch.ts`）も作物で絞らず全記録を対象にする
- **バッジには出さない**。ホームの「やること」件数は作物行に出すものなので、`crop_id` が null の行は集計から除く
- **Expo版も対応済み**（2026-09-08）。対象セレクタの先頭に「畑全体」を常に置き、ホームの入口も作物1件ならその作付け・0件/複数なら畑全体に振り分ける

---

## 10. 橋渡し（記録・写真、2026-09-08〜）

相談をホームの主操作に格上げした結果、そこに持ち込まれる用事は3種類になった。知識の用事しか果たせないままだと「相談する」を押した人が取りこぼされるので、記録と写真も同じ窓から扱えるようにした（設計判断は [`docs/decisions/20260908-advice-handoff.md`](decisions/20260908-advice-handoff.md)）。

3つは性質が違うので同じ機構では解いていない。

| 用事 | 解き方 | 実装 |
|---|---|---|
| 農薬の実績 | 材料を渡す | リクエストの `pesticideUsage`（スキーマ変更なし） |
| 記録の検索 | スキーマに枠を作る | strict スキーマの `record_search_query` |
| 写真 | UIの導線＋材料フィールド | リクエストの `photoDiagnosis`（**LLM の判定枠は作らない**） |

写真に判定枠を作らないのは、「写真を撮ってください」がモデルの最も安易な提案であり、枠を作れば過剰に出るため。写真は利用者しか用意できないのでボタンで足りる。

### 10-1. 農薬の使用実績（`pesticideUsage`）

- クライアントが `formatPesticideUsageForPrompt`（`src/lib/pesticideUsage.ts`）で見出しごと整形し、API は `adviceHistory` と同じく**素通し**する。2500字を超えると 400
- 相談では `includeLabelRows: false` で適用行（ラベル原文）を落とす。作付けの相談では `registrationFacts` と二重になり、畑全体では下記の境界を踏み越えるため
- 作付けの相談ではその作物だけを数える。他の作付けの実績を混ぜると誤帰属を招く
- **`aggregates` には混ぜない**。混ぜるとサーバーが中身を判別できず、畑全体での書き分けも `limits`/`sources` の出し分けもできない

**述べてよい範囲**（`scripts/test-advise.mjs`「畑全体 × 農薬」節で固定）:

| | 作付けの相談 | 畑全体の相談 |
|---|---|---|
| 使用回数（記録から算出） | ○ | ○ |
| 総使用回数の原文「6回以内」 | ○ | ○ |
| 「超過の疑い」の警告 | ○ | ○ |
| 希釈倍数・使用方法・適用のある病害虫 | ○（登録情報の原文のみ） | × |
| 使用の可否・薬剤の推奨 | × | × |
| 「あと◯回使える」 | **×** | **×** |

**「あと◯回使える」は明文で禁止している。** 画面（`src/components/PesticideUsageSummary.tsx`）が意図的に残り回数を出していないため、相談だけが言うと数字が食い違い、しかも食い違う方向が「許可」側になる。実績と上限を並べて述べさせれば読み手が引き算できる。

`limits` には「記録し忘れは含まれない」「同じ有効成分の別剤とは合算していない」「上限未達＝使ってよい ではない」の3件をサーバー側で固定生成する。

### 10-2. 記録の橋渡し（`record_search_query`）

相談が見ている作業記録は直近60件・7500字だけなので、その窓の外を数える質問には答えようがない。strict スキーマに `record_search_query`（`string | null`）を足し、記録検索（`api/search-chat.ts`）へ渡す検索語を返させる。`follow_up_question` と同型にしたのは、**置き場のある方へ行く**ことが実測で分かっているため。

その裏返しで枠を作ると入れたがるので、3重で抑える。

1. プロンプト —— 条件を「記録を数え直す/探し直すことでしか確かめられない質問」に絞り、null にする例を並べ、「迷ったら null」と明示
2. サーバー側の握りつぶし —— `records` を渡していなければ null（行き止まりへ送らない）、`follow_up_question` が非 null なら null（1ターンに出す「次の一手」は1つ）
3. 契約テスト —— 上記をすべて固定

握りつぶしたことは `limits` に出さない。落としているのは事実ではなく提案で、利用者が失う情報が無いため（`work_type` を null に倒す場合とは性質が違う）。

画面はボタンを出して検索シートを開くところまでで、**自動送信はしない**（利用者が押していない課金呼び出しを起こさない）。検索語は `crop_advice_messages.record_search_query` に残すので、スレッドを開き直しても導線が消えない（`scripts/migrations/2026-09-08-crop-advice-record-search.sql`）。

### 10-3. 写真の橋渡し（`photoDiagnosis`）

`api/diagnose-image.ts` は変更していない。結果をクライアントが整形して `photoDiagnosis`（800字以内）で渡す。

**`messages` に user 発言として混ぜない。** 画像診断の出力は LLM の推定であって利用者の申告ではないので、user 発言に入れると「べと病である」が確定事実として洗浄され、`limits` を付ける場所も無くなる（1章の情報源3分割の原則に反する）。専用の材料ブロックに置き、「確定診断ではない」「〜の可能性として扱い確かめ方を併せて示す」と指示し、出典と限界をサーバー側で固定して返す。

添付は1ターンだけで送信後に消す。毎ターン再送すると12ターンの窓と文字数の予算を食い続け、会話が古い写真に引きずられる。写真を添えているときは入力が空でも送れる（屋外・手袋での利用）。

導線は4本:

| 起点 | 行き先 |
|---|---|
| 記録詳細の診断結果 →「この結果をもとに相談する」 | その作付けの相談（適用情報まで照合できる側） |
| 単体の写真診断 → 同ボタン | 畑全体の相談（記録を介さず作付けが分からない） |
| 相談 →「写真で調べる」 | 画像診断シート |
| 相談 →「記録を調べる:「〈検索語〉」」 | 記録検索シート（検索語入り・未送信） |

### 10-4. 関連ファイル（10章ぶん）

| ファイル | 役割 |
|---|---|
| `scripts/migrations/2026-09-08-crop-advice-record-search.sql` | `record_search_query` 列の追加 |
| `src/lib/pesticideUsage.ts` | `formatPesticideUsageForPrompt` の `includeLabelRows` |
| `src/lib/metrics.ts` | `formatWorkCountsForPrompt` の `maxChars`（打ち切りを明示） |
| `expo-prototype/data/maffIpm.ts` / `maffIpmData.ts` | Web版からの移植（2026-09-08。バンドル純増 41KB） |
| `expo-prototype/scripts/test-maff-ipm.mjs` | 上記の引き当て検証（21 assertions） |

