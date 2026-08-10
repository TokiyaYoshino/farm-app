# 引き継ぎ：記録入力画面の再設計（2026-08-09 時点）

このドキュメント1枚で状況が分かるようにしてある。**結論：モックの作り直しは止めた。実装より先に一次情報を取るべき段階。**

> **追記（2026-08-09 後半セッション）**
> 再測して数値は 6日前と完全に同一（実データ 18 件・新規ゼロ）。そのうえで**アカウント側を調べた結果、2章までの前提が2点崩れた**ので先に読むこと。
>
> 1. **worker アカウントは1つも存在しない**（全ユーザー5人が `role="admin"`）。「4章2. worker アカウントで1人でも入力させる」は、まず**アカウントを作る**話から始まる。**worker が入力しなかったのではなく、worker が居ない。**
> 2. **`organizations` テーブルが実質空で、全ユーザーが同一 `organization_id` を共有している。**「3組織が使っている」は誤り（→ 2.5章）。
>
> 加えて、この調査中に**公開前に塞ぐべき越境バグ**を1件見つけた（→ 2.6章）。入力UIより優先度が高い。

## 1. 何をやろうとしていたか

「作業記録の入力画面をもっと簡単にできないか」という相談から始まった。当初のイメージは**サイゼリヤの注文画面**（全項目が一度に見えていて階層が無い）。

### 依頼の変遷（重要な順に）

1. **老人が使うから簡単にしたい** → 最初の起点
2. **絵文字ではなくアプリ既存のアイコン（Feather / lucide 線アイコン）に合わせる** → 対応済み
3. **老人最適化への疑義**：「老人以外が使うと微妙。そもそも老人はダウンロードしないでしょ」。**本当のターゲットは農業法人・小規模の複数人運営**。老人には「最低機能が簡単に使える」だけあればいい
4. **音声は優先ではない**：音声もフォームも対等に。画面を見て迷わず、最低工数で入れられるのがユーザー視点
5. **既存仕様を落とすな**：現行 `QuickReportSheet.tsx` の仕様を全部引き継いだ上でモード切替を足す。切替は設定画面に
6. **最後の指摘（これが決定的）**：「このモックが『入力しやすい』『ダウンロードしてもらう点で効果的か』という確からしい情報は取れていない。20代の農家が老人が使うならという**ただの仮説**でしかない」

## 2. 一次情報の実測結果（ここが一番大事）

`expo-prototype/scripts/analyze-input-usage.mjs`（**新規作成・読み取り専用・書き込み一切なし**）で本番 Supabase の `reports` を実測した。

```
cd ~/farm-app/expo-prototype && node scripts/analyze-input-usage.mjs
```

### 母数

- `reports` 全 33 件 → デモ投入分（`note` に `[demo]`）15 件を除外し **実データ n=18**
- 期間 2026-03-23 〜 2026-08-03（約4.5か月）、記録がある日は **12日だけ**、平均 1.5 件/日
- `work_categories`（作業区分マスタ）は 6 件登録あり

### 入力者の分布 ← 最重要

| 入力者 | 件数 |
|---|---|
| 吉野(admin) | 6 |
| 中川(admin) | 3 |
| 泉吹(admin) | 3 |
| 飛鳥ワイン(admin) | 3 |
| user_id 空 | 3 |

**全件が admin。worker ロールの入力実績はゼロ件。**

### 項目別 入力率（n=18）

| 項目 | 入力率 |
|---|---|
| 日付 / 作物 / 作業の種類 / 天気 / 気温 | 100% |
| 圃場 | 88.9% |
| 作業者 | 83.3% |
| 湿度 | 66.7% |
| work_time（旧） | 44.4% |
| メモ | 38.9%（**中央値 6文字**・最大27文字） |
| quantity（旧） | 33.3% |
| 作業区分マスタ / 開始時刻 / 終了時刻 / 農薬(複数) / 雨量 | 各 16.7% |
| quantity_value / quantity_unit / work_minutes / 写真 | 各 5.6% |
| **pesticide_amount（散布量）/ soil_ph / pesticide_id** | **0%** |

### その他

- 同一組み合わせ（作物×圃場×作業）は 10 通り / 18 件、**上位3組で 55.6%**
- 当日中に入力 66.7% / 翌日以降 33.3%

## 2.5. アカウント構成の実測（2026-08-09 後半・**ここで前提が崩れた**）

`users` テーブルを集計のみで確認（氏名・login_id は出力していない）。

| 項目 | 実測値 |
|---|---|
| 全ユーザー数 | **5人** |
| role 内訳 | **admin 5人 / worker 0人 / viewer 0人** |
| ユニーク `organization_id` | **1つ**（全員が同一 `d7093714…`） |
| レガシー `org` 文字列 | **2種**（`kishu` 4人 / `asuka` 1人） |
| `organizations` テーブルの行数 | **anon key では0件に見えるが、実際は行がある**（下記訂正） |
| `auth_id` / `login_id` を持つ人 | 5/5（全員ログイン可能） |
| 実データ reports の内訳 | `org="kishu"` 15件 / `org="asuka"` 3件（`organization_id` は全件同一） |

### ここから言えること

- **「3組織が使っている」は誤り。** テナントとして分かれているのは `org` 文字列で 2種（kishu / asuka）だけ。中川・泉吹は kishu 組織内の admin アカウントであって別組織ではない。**ヒアリング対象は「3社の管理者」ではなく「1〜2社＋社内の別アカウント」**。n=3 の見込みは実質 n=1〜2 に下がる
- **worker ロールは0人。** 4章2.「worker アカウントで1人でも入力させる」は、既存アカウントに入力させる話ではなく**アカウント新規作成から**になる。「現場が入力しづらくて放棄した」ではなく**現場アカウントを一度も配っていない**が正しい状態
- **アカウント作成は Web 版にしか無い。** `src/App.tsx:660 inviteUser()` → `/api/set-user-auth`（role で admin/worker を選べる）。到達経路は `tab === "users"`（`src/App.tsx:3068`）で、**`navItems`（`src/App.tsx:2128`）に users は無く**、ヘッダーのユーザーピッカー内「管理画面」ボタン（`src/App.tsx:4121`、`isAdmin` のみ）からしか行けない。**Expo 版には作成UIも `set-user-auth` の呼び出しも存在しない**（`ManageSubTab = "crops" | "fields" | "pesticides"`、`expo-prototype/App.tsx:26`）
- → **worker に配るなら今は Web 版から admin が作るしかない。** モバイルだけ触っている人には worker を増やす手段が無い。これ自体が「なぜ現場に入力させていないのか」の答えの候補（＝UIの使いにくさ以前に導線が無い）

**ヒアリングの核心の質問は差し替えるべき**：「なぜ現場の作業者に入力させていないのか」→ **「作業者アカウントを作ろうとしたことはあるか。あるなら、どこで止まったか」**。前者は「入力UIが悪いから」を暗に含む誘導質問で、実測（worker 0人・作成導線がWebのみ）と整合しない。

## 2.6. この調査中に見つけた越境バグ（入力UIより優先）

**入力UIの件とは独立。公開前に塞ぐ必要がある。**

> **2026-08-10 追記（RLS の状態が確定した）。** `jwt_organization_id()` / `jwt_org()` を rpc で叩くと
> どちらも `PGRST202`（関数が無い）＝ **`2026-08-02-rls-policies.sql` は未適用**で確定。
> かつ **anon key だけで `users` 5件・`crops` 7件・`reports` 33件・`ai_outputs` 10件・
> `pesticide_registrations` 78件・`daily_weather` 371件・`work_categories` 6件が素で読める**
> （`allow_all` ポリシーのため。件数は `Prefer: count=exact` で取得、氏名等は取得していない）。
> 唯一 `organizations` だけが0件になるが、これは**ポリシーが無いため**であって行が無いからではない（下記訂正）。
> **RLS 適用が公開前必須という結論は変わらない。**

`org`（レガシー文字列）と `organization_id` のどちらでフィルタするかがテーブルごとにバラバラで、**同一 `organization_id` を共有する別テナント同士が互いのデータを見られる**。

`expo-prototype/lib/store.tsx:151-161`（Web 版 `src/App.tsx:510-519` も同じ構成）:

- `organization_id` で絞る: `users` `schedules` `comments`
- `org` 文字列で絞る: `crops` `fields` `reports` `settings` `pesticides` `projects`
- **どちらでも絞っていない**: `work_categories`（`.select("*").order("id")` のみ）

具体的な影響（実測値に基づく）:

1. **`users` の越境**：`asuka` の人がログインすると `organization_id` で絞るので **kishu の4人が全員見える**（名前・role）。`QuickReportSheet.tsx:222` の作業者ピッカーに他テナントの人が並ぶ。`reports` 側は `org` で絞られるため、**存在しないはずの user_id を持つ記録**という不整合も作れる
2. **`work_categories` の越境**：フィルタ列自体がテーブルに無い（実測の列は `id, name, unit` のみ）。**6件のマスタが全テナントで共有**。`docs/db-schema.md` にこのテーブルの記載も無い
3. `schedules` `comments` も同様に `organization_id` 基準なので越境する

> **⚠️ 訂正（2026-08-10）。** 上の表の「`organizations` は0行」は**測り方の誤り**だった。
> anon key での select は確かに空だが、これは行が無いのではなく**読めていない**。
> 根拠3点: (1) `users` → `organizations` の埋め込み select が `200` で解決する（FK が無い組み合わせ
> `users` → `pesticides_master` は `PGRST200` エラーになるので、解決すること自体が FK の実在を示す）。
> (2) `ai_outputs` に10行あり全行 `organization_id = d7093714…`。FK があって親行が無い行は作れない。
> (3) `2026-07-22-organizations-step1.sql` は organizations に `allow_all` ポリシーを作っていない
> （後続の `2026-07-31-ai-outputs.sql` 以降は作っている）。**RLS 有効＋ポリシー無しのテーブルは
> エラーを返さず0件を返す**ため、「0行」と「見えないだけ」がクライアントから区別できない。
> `jwt_organization_id()` は未作成（rpc が `PGRST202`）なので RLS 本適用は未着手のまま、という点は変わらない。
>
> **結論として、越境バグの構図（全員が同一 organization_id）は変わらないが、「行が無いので作る」ではなく
> 「行はあるので確認するだけ」になる。** 確認用 SQL は `scripts/migrations/2026-08-10-organizations-check.sql`
> （読み取り＋欠けていた場合のみ補填。**新しい id を振らず既存の `organization_id` を使う**のが要点）。

`users.organization_id` が全員同一なのは、`scripts/migrations/2026-07-22-organization-id-columns.sql:22` が**全行を無条件に kishu の id でバックフィル**したため。後から入れた `asuka` も同じ id を持ったままになっている（`org` 文字列だけが違う）。**したがって `2026-08-02-rls-policies.sql` を今のデータのまま適用しても、JWT の `organization_id` が全員同一なので kishu/asuka は分離されない。** RLS は「DB側の分離」を意味しない状態。

`docs/adr-001-multitenancy-and-ai.md` の穴 B/C/D は「対応済み ✅」となっているが、**`organization_id` の実体が1つしか無いため対応は名目上のもの**。ADR の想定（1組織 → 段階移行）と実データ（2テナントが1 id に同居）がずれている。

### 塞ぐ順序（提案・未着手）

1. `organizations` の中身を SQL Editor で確認する（`2026-08-10-organizations-check.sql`）。kishu の行は既にある見込みで、**足すのは asuka の1行だけ**。RLS 適用時に `allow_all` が無いテーブルであることも併せて確認する
2. `users` 等の `organization_id` を `org` 文字列に合わせて振り直す（**データ更新なので要ユーザー承認**）
3. `work_categories` に `organization_id` 列を追加＋バックフィル、クエリに `.eq()` を追加、`docs/db-schema.md` に追記
4. `org` / `organization_id` の二重基準をやめ `organization_id` に統一
5. そのうえで `2026-08-02-rls-policies.sql` を `docs/rls-rollout.md` の手順で適用
6. `docs/multitenancy-progress.md` の「2組織目を受け入れる前の越境アクセス実地検証」を実施（**asuka が既に2組織目になっている**ので、検証は事後になる）

## 3. 実測から言える事実と、言えないこと

### 事実として言えること

- **これは運用データではなく作り手のテストデータ**。4.5か月18件・全件管理者入力。「現場の作業者が入力しづらくて放棄している」という現象すら、まだ起きていない。**入力UIは現時点でボトルネックではない。**
- **老人の話は完全に仮説**。worker の入力が0件なので、老人が使うかどうかを示すデータは1件も無い。作ったモックは根拠ゼロの前提の上に立っている。
- **（2.5章の追記で強化）worker の入力が0件なのは「入力しなかった」からではなく、worker アカウントが0個だから。** つまり入力UIの良し悪しは**まだ一度も試されていない**。この観点では「入力UIがボトルネックではない」はさらに強く言える。
- **繰り返し率だけは弱い示唆あり**（上位3組で55.6%）→「いつもの作業」の再利用は筋が悪くない。ただし同一人物のテスト入力。

### 言えないこと（誤読しやすいので注意）

- 散布量・土壌pH・写真・単位が 0〜5.6% でも「**不要」の証明にはならない**。n=18 では「テスト時に誰も触らなかった」までしか言えない。**この数字を根拠に項目を削るのは誤り**（`CLAUDE.md`「既存機能を削除しない」にも反する）
- 「入力しやすいか」と「ダウンロードされるか」は**別問題**。農業法人で導入を決めるのは経営者・管理者で、入力の簡単さでDLは増えない。入力の簡単さが効くのは**導入後に現場が入力を続けるか**。ただし導入先がまだ無いので、そこも未検証

## 4. 次にやるべきこと（優先順）

> **2026-08-09 後半セッションで 2.5/2.6 章を踏まえて改訂。旧リストは下に残す。**

0. **越境バグを塞ぐ（2.6章）** — 入力UIの前。他テナントのユーザー一覧と作業区分マスタが見えている。公開前必須で、`RLS適用`（10章1.）とは**順序依存**：データを振り直してから RLS を当てないと分離されない
1. **worker アカウントを1つ作って現場に渡す** — 旧2.が実は最優先。**worker が0人なので、入力UIは一度も現場で試されていない。** ここを埋めない限り入力UIの議論は全部机上。作成は Web 版のユーザーピッカー →「管理画面」から（2.5章）
2. **管理者にヒアリング** — ただし対象は「3組織」ではなく実質 kishu / asuka の**1〜2社**（2.5章）。質問は「**作業者アカウントを作ろうとしたことはあるか。どこで止まったか**」に差し替え。「なぜ入力させていないのか」は誘導質問なので使わない
3. **実装するなら計測を先に入れる** — どの項目で離脱したか。18件では何を作っても当て推量
4. モックは捨てず、ヒアリングの叩き台（「こういう画面なら現場に渡せますか」）として使う ← 一番安い使い道

> **2026-08-09 追記：競合レビュー89件の調査で、0.〜1. と並行して着手できる独立項目が1つ出た。**
> 詳細と他の論点（売上の可視化・Expo版のユーザー作成・安定性検証）は `docs/research/competitor-gap-analysis-2026-08.md`。
>
> **→ 2026-08-10 に「入力途中の消失」は修正済み（下記11章）。次は「次にやる作業が分からない」＝農業エージェント方向。**

**未回答の問いかけ（前セッションから継続）**：「ヒアリング項目の設計に進むか、計測の仕込みから入るか」。**後半セッションの調査を踏まえると、どちらより先に 0.（越境バグ）と 1.（worker アカウント作成）** という判断になる。0. の手順2はデータ更新を含むため**ユーザー承認が必要で、まだ取っていない**。

<details>
<summary>旧リスト（2026-08-09 前半セッション時点・前提が崩れる前）</summary>

1. **既に使っている管理者にヒアリング** — 中川・泉吹・飛鳥ワインの3組織が実際に触っている。n=3〜4でも今の仮説より確実に強い。核心の質問は「**現場の作業者に入力させていないのはなぜか**」 ← **3組織は誤り・質問も誘導的（2.5章）**
2. **worker アカウントで1人でも入力させる** — 老人かどうか以前に、管理者以外が入力できるかが未検証 ← **worker は0人なので「作成する」から始まる**
3. **実装するなら計測を先に入れる**
4. モックはヒアリングの叩き台として使う

</details>

## 5. 成果物の場所

| ファイル | 状態 |
|---|---|
| `docs/design-simple-input.html` | **モック v3**。ブラウザで開いて確認する。下記参照 |
| `docs/mock3.png` | v3 の全景スクショ（1440×8142） |
| `expo-prototype/scripts/analyze-input-usage.mjs` | **新規**。実測スクリプト。読み取り専用。2026-08-09 後半に「アカウント構成（role とテナント）」の集計を追加（worker 0人・テナント越境・work_categories を自動で警告する）。氏名・login_id は出力しない |
| `docs/handoff-input-redesign.md` | この引き継ぎ資料 |
| `docs/research/competitor-app-reviews-2026-08.md` | **競合4アプリのApp Storeレビュー全89件**（取得可能分は網羅）。初版22件の結論は撤回済み |
| `docs/research/competitor-gap-analysis-2026-08.md` | 上記 × farm-app の突き合わせ。**褒め点で無いもの／不満で防げていないもの**と優先順 |
| `docs/decisions/20260810-next-action-advice.md` | **作物ごとの相談＝農業エージェント**（`api/advise.ts`）の設計判断。情報源を3層に分ける根拠、法令上の倒し方、記録との照合の設計 |
| `expo-prototype/lib/adviceMatch.ts` | 助言と作業記録の照合。**「未実施」と「照合できない」を混ぜない**のが設計の核（`scripts/test-advice-match.mjs` 29件で検証） |
| `scripts/migrations/2026-08-10-crop-advisor.sql` | 相談スレッドの2テーブル。**未適用**（12章参照） |

### モック v3 の中身（全11画面）

タイトル：「記録入力モック v3 — 既存仕様を全部引き継いだ上でモード切替」

- **通常モード** N-1（開いた直後）/ N-2（いつもの作業タップ後）/ N-3（任意項目を開いた）/ **X-1（空状態・失敗・登録中）**
- **条件付き項目** P-1（防除：農薬＋散布量＋使用状況）/ P-2（施肥：土壌pH）/ P-3（作業区分マスタがある組織）
- **音声・ドラフト** V-1（話している最中）/ V-2（AI振り分け直後）/ D-1（コピー・タイマー終了）
- **かんたんモード** E-1 / E-2 / E-3（防除は法令記録なので隠さず拡大）
- **設定画面** S-1（管理タブの4つ目のサブタブとして新設）

設計の核：現行の**4つの BottomSheet ピッカーを横スクロールのピル行に置換**（1タップ・高さ44px・選択肢が最初から見える）。タイル案（高さ約150px）は老人専用なので、かんたんモードのみ。

冒頭に**既存仕様の引き継ぎチェック表**があり、`QuickReportSheet.tsx` の全項目・全挙動 × DB列 × 通常モードの置き場所 × かんたんモードでの扱い、を対応付けてある。

### モック確認手順

```
cd ~/farm-app/docs && python3 -m http.server 8899   # 起動していなければ
open "http://localhost:8899/design-simple-input.html"
```

Playwright は `file:` プロトコルを開けないため、スクショを撮るには上記の HTTP サーバー経由が必須。`browser_resize` → `browser_navigate` → `browser_take_screenshot`（**filename は絶対パス**。相対だと `~/` に落ちる）の順。resize が navigate でリセットされて縦735pxの見切れ画像になることがあるので、高さが妥当か確認する。

## 6. 現行実装の仕様（引き継ぎ対象・`screens/QuickReportSheet.tsx` 587行）

再設計時に落としてはいけない全項目。

### state（21個）
`date` `cropId` `fieldName` `workCategoryId` `workType` `quantityUnit` `expanded` `userId` `quantity` `workStart` `workEnd` `note` `soilPh` `selectedPesticides[]` `pesticideAmounts{}` `imageUri` `periodWeather` `submitting` `aiStructuring` `pickerFor` `dtPicker`

### 主な挙動
- **初期値**：自分・`crops[0]`・`fields[0]`（← 毎回先頭なので、1日に何件も入れる人には選び直しが発生）
- **ドラフト反映**（`quickReportDraft`）：コピーして作成／タイマー終了から。時刻が入っていれば `setExpanded(true)`、日付は今日に
- **期間天気の自動取得**：`workStart` と `workEnd` が揃うと、圃場の lat/lng（無ければ `weatherCoords`）で `fetchWeatherForPeriod`。取れたら `wxAuto` より優先して保存
- **作業の種類**：`workCategories` があればマスタ名＋`unit`（キーは `cat-<id>`）、無ければ `WORK_TEMPLATES`。**防除以外に変えたら農薬選択をクリア**
- **`showQuantity`**：`workCategories.length === 0 || !!quantityUnit || !!selectedCat?.unit` → マスタありで単位が無い区分では数量欄が出ない
- **AI**：`structureVoiceApi(note, 圃場名[], 区分名[]orWORK_TEMPLATES, 農薬名[])` → note/field/work_category/pesticide_names/quantity_value/quantity_unit/soil_ph を反映し `saveAiOutput`。**文字起こしはiOS標準キーボードのマイク**（追加依存なし・追加課金なし）
- **条件付き表示**：農薬は `isPesticideWorkType(workType)`（防除・農薬散布）、土壌pHは `workType === "施肥"`
- **農薬**：複数選択＋**選択した農薬ごとに散布量入力**＋`PesticideUsageCard compact`（FAMIC使用回数）。農薬0件・作物未選択それぞれに専用文言。`onSetupCrop` → 管理›作物 へ
- **写真**：`expo-image-picker` でライブラリ選択のみ（カメラ起動は無い）＋削除ボタン。**アコーディオンの外＝常時表示**
- **submit ペイポード**：`user_id crop_id field date work_type work_category_id quantity quantity_value quantity_unit work_time:"" note weather temp humidity rain pesticide_id pesticide_amount pesticides_used soil_ph work_start work_end work_minutes`
- 保存後 `resetForm()` → `onClose()`。失敗は `Alert.alert("登録に失敗しました", err)`

### v3 モックで1つだけ増やしたもの
写真に**「写真をとる」（カメラ起動）**を追加。現行はライブラリ選択のみ。既存の「選ぶ」も残しているので削除ではない。**不要なら外す**（ユーザー未承認）。

## 7. 設計上の決定事項（再議論しないため）

- **role で自動判定しない**。`Role = "admin" | "worker" | "viewer"` は権限であって年齢や慣れではない（70歳の管理者も25歳の作業者もいる）。**端末ごとの `AsyncStorage` トグル**にする。先例：`notifSeen_${userId}`（`lib/store.tsx:645` 付近）
- **設定は管理タブの4つ目のサブタブ**。現状 `screens/` に設定画面が無く、ヘッダー人アイコンのシート（`App.tsx:262`、`heightRatio={0.4}`）はログアウト専用で狭い。ボトムナビ5つ目は重すぎる。人アイコンのシートには「設定をひらく」1行だけ足して両方から到達
- **かんたんモードは任意項目を隠すだけ**。**農薬・散布量・使用状況カードは法令記録なので隠さず拡大**する（例外）
- **現行 `QuickReportSheet` は消さず残す**（`CLAUDE.md`「既存機能を削除しない」）。「現行の詳細フォームで入力」から開く
- **ウィザード案（案B）は却下**。`ui/BottomSheet.tsx` が単一シート前提（`heightRatio` 既定 0.88）で多画面遷移の機構が無い。**iOS は Modal 内に兄弟 Modal を置けない**ためピッカーはシートの Modal 内側に置く必要がある（`CalendarView` で一度バグった）
- **DBスキーマ変更・新規API・新規課金は不要**。「いつもの作業」は既存 `reports` から `(crop_id, field, work_type)` の頻度上位を数えるだけ
- **アイコン**：アプリに絵文字はゼロ。Expo は `@expo/vector-icons` の **Feather**、Web は `lucide-react`。Feather に leaf/sprout/wheat/spray-can/basket/droplets が無いので、既存依存の `react-native-svg` で lucide のパスを直書きする（`ui/WorkIcon.tsx`）
- **色・角丸・影は `ui/tokens.ts` からのみ**（直書き禁止・`CLAUDE.md`）。モックのCSS変数は `tokens.ts` を写してある

## 8. 実装する場合の見積り（ユーザー承認前・着手しないこと）

| やること | 内容 |
|---|---|
| `screens/SimpleReportSheet.tsx` | 本体。現行の state・submit・useEffect をそのまま流用し描画だけ差し替え。`easy` フラグで寸法とラベルを分岐 |
| `ui/PillRow.tsx` | 横スクロール＋選択状態のピル行。作物・圃場・作業で共用 |
| `ui/WorkIcon.tsx` | `react-native-svg` で lucide パス（Feather に無い6種） |
| `ui/Stepper.tsx` | −／＋と長押し連続増減。数量・pH・散布量で共用。長押しでキーボード入力に切替 |
| `screens/SettingsScreen.tsx` | 管理タブ4つ目。`easyMode` / `voiceFirst` / `keepLastInput` の3トグル＋アカウント |
| `lib/store.tsx` | 上記3フラグを Provider に追加（AsyncStorage 永続化） |

## 9. 環境・運用の注意

- Expo 起動：`cd ~/farm-app/expo-prototype && npx expo start --tunnel --clear`（同一Wi-FiのQRが失敗する環境のため **tunnel 必須**）。このセッションでは `exp://9nvznb4-anonymous-8081.exp.direct` で起動中だった
- `react-native@0.81.4`（期待 0.81.5）の警告は無害
- パッケージ追加は必ず `expo install`。`~/.npm` の権限が壊れているので `npm_config_cache=/tmp/npm-cache-farmapp npx expo install <pkg>`
- `expo-prototype/.env` は gitignore 対象で Supabase キーが入っている。**EAS Build はクラウド実行で .env を送らない**ため `eas env:set` が必要
- 検証：`npx tsc --noEmit` と `npx expo export --platform ios`

## 10. この件と無関係だが未完の残作業（今日は触っていない）

1. **RLS適用**（公開前必須）：`scripts/migrations/2026-08-02-rls-policies.sql` + `docs/rls-rollout.md`。`device-tokens.sql` と `2026-08-05-crops-famic-crop-name.sql` も同時に流す。Auth Hook 設定 → **全員再ログイン**（飛ばすと全データ不可視）
   **⚠️ 2026-08-09 追記：これを先に流しても kishu/asuka は分離されない。** 全ユーザーの `organization_id` が同一値なので JWT クレームも同一になる。**先に 2.6章の手順1〜4（organizations の行作成・id 振り直し・work_categories の列追加）を済ませること。**
2. `public/privacy.html` の運営者名・連絡先メール記入
3. Vercel Production の `OPENAI_API_KEY` 確認
4. App Store 申請（Apple Developer 登録以降）

## 11. 入力途中の消失バグ（2026-08-10・**修正済み**）

競合レビュー調査（`docs/research/competitor-gap-analysis-2026-08.md` ②A）で挙がった
「作業記録入力中、他アプリに移動すると入力中の記録が失われる」への対応。

### 原因（**最初の見立ては誤りだった**）

当初「`ui/BottomSheet.tsx:39` の `if (!visible) return null` でシートを閉じると state が消える」と書いたが、**これは誤り**。
`QuickReportSheet` は `App.tsx:244` で**無条件にマウントされている**ため、21個の `useState` はコンポーネント側にあり、`BottomSheet` が返す JSX がアンマウントされても state は保持される。

**実際の経路はツリー全体のアンマウント**：

1. `supabase` の `autoRefreshToken` がトークンを更新すると `onAuthStateChange` が発火
2. `lib/store.tsx` が毎回 `setAuthSession(session)` していたため**オブジェクト同一性が変わる**
3. `useEffect(..., [authSession, fetchAll])` が再実行され `setLoading(true)`
4. `App.tsx:134` の `if (loading) return <ActivityIndicator/>` で**ツリーごとアンマウント** → 21 state 全消失

**トークン更新はアプリのフォアグラウンド復帰時に走る**＝写真選択（`expo-image-picker`）から戻った瞬間がまさにこの経路。競合レビューの報告と症状が一致する。

### 修正（2箇所）

1. **根本原因を塞ぐ**（`lib/store.tsx` の `onAuthStateChange`）
   同一ユーザーのトークン更新では `authSession` を差し替えない（`prev?.user?.id === session?.user?.id` なら `prev` を返す）。ログイン・ログアウト・ユーザー変更のときだけ差し替える。
   → 再ロードもアンマウントも起きなくなる。`authSession` は `session.user.id` の参照と null チェックにしか使われておらず、**アクセストークンを直接読んでいる箇所は無い**（トークンは supabase クライアントが内部で管理）ので、古いオブジェクトを保持しても安全。

2. **保険として下書きを永続化**（`lib/reportDraft.ts` 新規 ＋ `QuickReportSheet.tsx`）
   OS にプロセスを落とされた場合は state 保持では救えないため、入力を AsyncStorage に保存する。
   - **入力が変わるたびに保存**（閉じたときだけではない）＋ `AppState` が `active` を離れる瞬間にも保存
   - **既定値のままなら保存しない**（`hasDraftContent`）。復元バナーが無意味に出るのを防ぐ
   - **ユーザーIDごとにキーを分ける**（端末共有で他人の書きかけが出ない）
   - **7日で失効**（古い日付の下書きを持ち越して誤登録するのを防ぐ）
   - 壊れたJSON・形違い・不正な `savedAt` は黙って `null`（入力を妨げない）
   - 復元時は**バナーで明示し「破棄」も置く**。黙って値が入っていると理由が分からなくなる
   - 登録成功時（`resetForm`）に下書きを削除
   - `store` の `quickReportDraft`（コピー作成・タイマー終了）が来ているときは**そちらを優先**し下書きは復元しない

`periodWeather` は保存しない（開始・終了時刻から自動で再取得される）。`submitting` / `pickerFor` / `dtPicker` も一時的なUI状態なので保存対象外。

### 検証

```
cd ~/farm-app/expo-prototype
node scripts/test-report-draft.mjs   # 21 passed（保存/復元・期限・端末共有・異常系）
npx tsc --noEmit
npx expo export --platform ios
```

テストは RN 専用の AsyncStorage を Node の loader hook でメモリ実装に差し替え、**`lib/reportDraft.ts` の実物**を読み込んで検証している（ロジックのコピーではない）。

### 残っている確認（実機）

- 写真選択から戻ったときに実際に消えないか。**修正1でトークン更新経由は塞げたが、iOS がプロセス自体を落とした場合は修正2の復元動作になる**。どちらの経路を通ったかは実機でしか確認できない
- 復元バナーの文言・「破棄」の位置が現場で分かるか

## 12. 作物ごとの相談（農業エージェント）（2026-08-10・**実装済み・PR #17 未マージ・マイグレーション未適用・未実機検証**）

> **次のセッションはここだけ読めば再開できる（要約）**
>
> コードは完成していてテストも通っている。**動かないのは3つが未実行だから**で、いずれも私（AI）が
> 実行できない種類のもの。順番に依存関係がある。
>
> | # | やること | 誰が | なぜ AI ができないか |
> |---|---|---|---|
> | 1 | `2026-08-10-organizations-check.sql` を SQL Editor で実行 | ユーザー | anon key しか無く DDL/RLS 越えの select が打てない |
> | 2 | `2026-08-10-crop-advisor.sql` を SQL Editor で実行 | ユーザー | 同上。**これをやるまで会話が保存されない** |
> | 3 | **PR #17 を main にマージ** → Vercel が `api/advise.ts` をデプロイ | ユーザーの承認 → AI が実行可 | 本番デプロイなので承認が必要（分類器にも止められた） |
> | 4 | `link-famic-crop-names.mjs --apply`（層2が空のままなので） | ユーザーの承認 → AI が実行可 | 本番データ更新 |
>
> PR: https://github.com/TokiyaYoshino/farm-app/pull/17（ブランチ `feat/crop-advisor`・コミット `93d8272`）
> Web アプリ側（`src/` `public/` `vercel.json`）に差分は無く、追加は新規エンドポイント1本のみ。
>
> **`/api/advise` が 405 を返すのは「未デプロイ」の根拠にならない。** `vercel.json` の catch-all
> rewrite により存在しないパスも 405 になる。稼働確認は POST してレスポンス本文を見る。

11章の消失バグに続く2件目。「次にやる作業やデータを迷わない（農業相談者・農業エージェント）」への対応。
**設計判断の全体は `docs/decisions/20260810-next-action-advice.md`**（ここは差分と残作業だけ）。

### 何を作ったか

**作付けごとの相談スレッド。** 「キャベツこれどうしたらいい？」と聞くと LLM が答え、
やりとりが**その作付けに溜まり**、助言した作業は**作業記録と照合される**。

> **経緯**: 最初は「ボタンを押すと助言カードが1枚出る」一発物として作ったが、それでは
> エージェントにならない（会話にならず、作物ごとに溜まらず、言ったことの実施を追えない）。
> **蓄積と、言ったことの実施を追えること**がエージェントの核なので、作り直した。

`api/advise.ts` を新設した。既存 `api/search-chat.ts` は改造していない
（あちらは「記録のみを根拠に・推測するな」の検索専用で、**実データ n=18 では「記録からは分かりません」しか返せない**。
必要なのは記録の検索ではなく**知識の補填**だった）。

情報源を3層に分けて混ぜないのが要点：

1. 作物名・作付けからの経過日数・地域 …… 呼び出し側が渡す事実
2. **希釈倍数・使用時期・使用回数 …… FAMIC 登録適用部の原文**。LLM に生成させず、
   レスポンスでも `registrationFacts` として別に返して画面はそちらを表示する
   （AI の文章に混ざった数字を信じさせないため）
3. 作業の段取り・時期 …… LLM の一般知識。「目安」と明示する

出典（`sources`）と限界（`limits`）は **LLM に書かせずサーバー側の固定文言**で毎回返す。

### 記録との照合（ここが要点）

助言の会話文のままでは記録と突き合わせられないので、LLM に**やること**を構造化させて
`crop_advice_actions` に切り出す。`work_type` が作業記録と突き合わせるキー。

**最も注意した点：「未実施」と「照合できない」を混ぜないこと。**

- `work_type` は**作業記録の語彙（`WORK_TEMPLATES` + `work_categories`）に完全一致するものだけ**を通す。
  API 側で語彙外の値は `null` に落とす。近いものを当てはめると**「やっていないのに実施済み」**になる
- `work_type` が `null` の助言は `unmatchable`（「記録と照合できません」）で、**`pending`（未実施）ではない**。
  混ぜると「やったのに未実施と言われる」か「できていないのに見逃す」のどちらかが起きる。
  画面でも警告色を使わず、注記も添える
- **照合結果は保存しない。** 作業記録は後から追加・修正されるので、`lib/adviceMatch.ts` で毎回計算する
  （`lib/pesticideUsage.ts` / `lib/metrics.ts` と同じ方針）
- 画面には**照合の根拠**（見た期間・該当した記録の日付）を必ず併記する。書かないと利用者が結果を検証できない

### 前提（列追加は完了・紐付けが未実施）

**`crops.famic_crop_name` 列は 2026-08-10 に本番へ適用済み**（`2026-08-05-crops-famic-crop-name.sql`。
実測で `select famic_crop_name` が 200 を返すことを確認）。**ただし7件すべて `null`＝未紐付け。**

紐付けが済むまで、**層2（農薬の注意事項）は常に空**になる。層1・層3は動くので機能は成立し、
`limits` に「紐付いていないため薬剤の使用可否は判断していない」と出る。**壊れるのではなく判定不可に縮退する。**

同じ理由で、**既存の農薬使用回数チェック（`PesticideUsageCard`）も紐付けが済むまで全件「判定不可」**。
`competitor-gap-analysis-2026-08.md` ① でこれを farm-app の強みとして挙げたが、**列を入れただけでは未稼働**
（同ドキュメントに訂正を追記済み）。

#### 紐付けの表（FAMIC 登録適用部を実際に引いて確認した表記）

自動文字列マッチングはしない方針（`docs/decisions/20260805-pesticide-precheck.md`。
「南高梅」≠「うめ」の誤判定が使用者を法令違反に導くため）。下表は**推測ではなく、
`api/pesticide-registration` で登録番号ごとに引いて表記を確認した結果**。

| `crops.name` | FAMIC 原文 | 確認に使った登録 |
|---|---|---|
| ほうれん草 | `ほうれんそう` | ｱﾃﾞｨｵﾝ乳剤 / 日本化薬ﾀﾞｲｱｼﾞﾉﾝ水和剤34 |
| にんにく | `にんにく` | 16823 ﾀﾞｺﾆｰﾙ1000 |
| たまねぎ | `たまねぎ` | 16823 ﾀﾞｺﾆｰﾙ1000 |
| ぶどう（×2） | `ぶどう` | 22345 ｼﾞﾏﾝﾀﾞｲｾﾝ水和剤 |
| キャベツ（×2） | `ｷｬﾍﾞﾂ` | 16823 / 22345（**半角カナ**） |

7件すべて品種名を含まない一般名なので、南高梅型の曖昧さは無い。FAMIC が半角カナで持つ
`ｷｬﾍﾞﾂ` は、突き合わせ側が NFKC で正規化するため全角入力でも一致するが、
**この列は「FAMIC 登録適用部の作物名」なので原文の表記を入れる**（画面で FAMIC 側の表記だと分かるように）。

`expo-prototype/scripts/link-famic-crop-names.mjs` にこの表を書き写してある。
既に値が入っている行は上書きしない（人が意図して入れた可能性があるため）。

```
cd ~/farm-app/expo-prototype
node scripts/link-famic-crop-names.mjs           # 確認のみ
node scripts/link-famic-crop-names.mjs --apply   # 更新（本番データ更新なので要承認）
```

**紐付け後は画面で1件確認すること。** ぶどう（asuka）は ｼﾞﾏﾝﾀﾞｲｾﾝ水和剤 で
「希釈1000倍 / 収穫45日前まで / 本剤2回以内 / 総2回以内」が出るはず。

### 検証

```
cd ~/farm-app && node scripts/test-advise.mjs                # 77 passed
npx tsc --noEmit
cd expo-prototype && node scripts/test-advice-match.mjs       # 29 passed
npx tsc --noEmit && npx expo export --platform ios            # 3.57 MB
```

`test-advise.mjs` は OpenAI を差し替えて、**サーバー側で固定している契約**を検証している
（FAMIC の `-` を「制限なし」に倒さない／出典・限界が必ず付く／未紐付けなら薬剤に触れない／
**語彙外の `work_type` を通さない**／適用行と会話の打ち切りを黙って行わない）。
`test-advice-match.mjs` の主眼は**「未実施」と「照合できない」を混ぜていないこと**。
LLM の出力品質は検証対象にしていない。

### 残っている作業

**依存関係**: 1 → 2 は順序必須（参照先が無いと insert が落ちる）。3 は独立だが、
**3 をやらないとアプリから API を呼べない**ので機能自体が動かない。4 は無くても縮退動作する。

1. **`organizations` の実在確認（マイグレーションの前に流す）**

   ```
   scripts/migrations/2026-08-10-organizations-check.sql   # Supabase SQL Editor で実行
   ```

   `crop_advice_messages` / `crop_advice_actions` は
   `organization_id uuid not null references organizations(id)` を持つため、参照先の行が無いと
   **アプリからの insert が必ず FK 違反で落ちる**。読み取りが主で、欠けていた場合だけ補填する
   （何度流しても安全）。**新しい UUID を振らず既存の `organization_id` を使う**のが要点
   ―― 新規に振ると既存データが指す id と一致せず孤児が残る。
   期待値は「kishu の行は既にあるので補填0行」（理由は 2.6章の訂正）

2. **マイグレーションの適用（これをやるまで溜まらない）**

   ```
   scripts/migrations/2026-08-10-crop-advisor.sql   # Supabase SQL Editor で実行
   ```

   未適用のあいだは保存が全て失敗し、回答は表示されるが「保存できませんでした」と出る。
   `crop_advice_messages` / `crop_advice_actions`。テナント列は `organization_id` のみ
   （レガシーの `org` は新規テーブルに持ち込まない）。RLS は `allow_all` で、
   実ポリシー化は `2026-08-02-rls-policies.sql` の一斉適用で行う

3. **PR #17 を main にマージする（`api/advise.ts` のデプロイ）**

   https://github.com/TokiyaYoshino/farm-app/pull/17 ・ブランチ `feat/crop-advisor` ・コミット `93d8272`

   `api/advise.ts` は `main` に無いので**まだデプロイされていない＝アプリから呼べない**。
   Vercel は git push で反映される。Web アプリ側に差分は無く追加は新規エンドポイント1本のみなので
   既存の挙動は変わらないが、**本番デプロイなので承認が必要**（承認があれば AI が実行できる）

4. `famic_crop_name` の手動紐付け（上記の表・**本番データ更新なので要承認**）

   `node scripts/link-famic-crop-names.mjs --apply`。dry-run 済みで7件すべて紐付け可能。
   ただし**ほうれん草・にんにく・たまねぎは適用のある農薬が1件も無い**ため、紐付けても判定不可のまま
   （農薬マスタが3件しか無い）

### 残っている確認

- **実 OpenAI キーでの出力品質**。ローカルに `OPENAI_API_KEY` が無いためスタブ検証のみ。
  **Vercel Production の `OPENAI_API_KEY` は 2026-08-10 に設定済みと確認**（本番 `/api/search-chat` を
  叩いて `answer` と `usage` が返った。10章3. は解消）
- **`work_type` が語彙にどれだけ当たるか**は実測していない。当たらなければ `unmatchable` が増える
  （安全側に倒れるが、照合の価値は下がる）。実キーで数回試して当たり方を見る必要がある
- 実機での導線と動作。ホームの「今日の予定」直後（予定が空のときに詰まるのが本来の課題のため）と、
  管理タブの作物の行から入れる。スレッドの読み込み・保存・「これはやらない」が実機で動くか
