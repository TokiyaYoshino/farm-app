# ADR-001: マルチテナント化とAI機能・プラン課金の設計

- ステータス: 提案（Proposed）
- 日付: 2026-07-19
- 文脈: farm-appを自社利用から外部公開（複数組織への提供）へ展開する方針決定に伴い、必要な前提工事とAI機能・課金の設計を定める。

> ⚠️ 戦略との整合性: `~/Projects/kishufarm/strategy/03-agritech.md` では農業アプリを「長期資産・種まきのみ／90日間は外部提供に本格着手しない」と位置づけている。外部公開へ進む場合はこの戦略を更新し、判断理由をdecision-logに残すこと。

---

## 1. 外部公開の絶対条件（これがないと公開してはいけない）

現状、DBレベルのテナント分離が存在せず、複数組織が乗ると**他社データが露出する**。公開前に必ず塞ぐ。

### 現状の穴
| # | 問題 | 影響 |
|---|---|---|
| A | RLSが全テーブル`allow_all`ポリシー | DB側で分離ゼロ。Supabase URL + anon keyがあれば誰でも全件取得可能 |
| B | `users`を`org`条件なしで全件取得しクライアント側フィルタ | 全組織のユーザー情報（名前・role・login_id・email）が露出 |
| C | `comments`に`org`列がなく全件取得 | 全組織のコメントが露出 |
| D | `schedules`に`org`列がない（user_id経由の間接絞り込み） | 分離がクライアントロジック依存 |
| E | ユーザー作成時に`@kishu-farm.system`ドメインと`org ?? "kishu"`がハードコード（api/set-user-auth.ts） | 単一組織前提の名残 |
| F | LINE通知先が環境変数1組（全組織が同一グループに送信） | 他組織の作業報告が混ざる |

### 是正方針
1. **`organizations`テーブルを新設**（id, name, plan, status, created_at, line_channel_token, line_group_id など）。`org`自由文字列を`organization_id`（FK）へ段階移行
2. **RLSを実ポリシー化**: Supabase AuthのJWTカスタムクレームに`organization_id`を載せ、各テーブルに `organization_id = auth.jwt() ->> 'organization_id'` のRLSポリシーを適用。`allow_all`を撤廃
3. **`comments`・`schedules`に`organization_id`列を追加**し、クエリを`.eq()`で絞る
4. **クライアント側の全件取得（users/comments）を組織スコープ付きクエリに変更**（RLSと二重防御）
5. **ユーザー作成のドメイン・デフォルトorgを組織パラメータ化**（api/set-user-auth.ts）
6. **LINE通知先を`organizations`テーブルから取得**（api/notify-line.tsを組織ID受け取りに変更）

### 改修箇所の実測（コード調査、2026-07-19）

`src/App.tsx`・`api/`を実際に調査した結果、org非スコープのクエリ／ハードコードは以下の箇所に存在する。

| ファイル:行 | 内容 | 対応 |
|---|---|---|
| `src/App.tsx:395` | `users`全件取得（起動時） | ✅ 自分の行をauth_idで先に特定→`organization_id`（無ければ`org`）でフィルタして取得に変更 |
| `src/App.tsx:554` | `login_id`でのユーザー検索（ログイン時） | 対応不要と判断（`login_id`をorg横断一意にしたため現状のままでよい。下記「新たに見つかった論点」参照） |
| `src/App.tsx:578` | ユーザー招待後の`users`再取得 | ✅ 同上のフォールバック付きフィルタ |
| `src/App.tsx:938` | `users`削除 | ✅ `org`（＋`organization_id`があれば併用）一致を削除条件に追加。列がすでにあるorgでの即時対応 |
| `src/App.tsx:416` | `comments`一覧取得 | ✅ `organization_id`列があればサーバー側フィルタ、無ければ既存の報告/予定ID突合フィルタを維持 |
| `src/App.tsx:1152` `1159` `1168` | `comments`取得・追加・更新 | ✅ 同上のフォールバック実装 |
| `src/App.tsx:410` | `schedules`取得（`orgUserIds`経由の間接絞り込み） | ✅ `organization_id`列があれば直接フィルタ、無ければ既存の`orgUserIds`絞り込みを維持 |
| `src/App.tsx:1132` | `schedules`追加 | ✅ `organization_id`があれば付与 |
| `api/set-user-auth.ts` | `@kishu-farm.system`ドメイン・`org ?? "kishu"`のハードコード | ✅ `organization`/`organization_id`パラメータ化（未指定時は従来通り`kishu`にフォールバック） |
| `api/notify-line.ts` | `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_GROUP_ID`が環境変数1組固定 | ✅ `organization_id`が渡された場合`organizations`テーブルの値を優先し、無ければ環境変数にフォールバック |

**規模感**: `App.tsx`単体で最低9箇所のクエリ修正、APIエンドポイント2本の書き換え。「数週間規模」という見積りは妥当だが、内訳としてはクエリ修正自体は数日、残りは下記の設計課題の解決とRLSポリシーの段階適用・越境検証に費やす時間が大きい。

**2026-07-28更新**: 上記のクエリ修正・APIパラメータ化に着手（`claude/multitenancy-rls`ブランチ）。詳細と実装方針は`docs/multitenancy-progress.md`参照。

**新たに見つかった論点 → 2026-07-28 決定**: ログインは`login_id`のみで行われており（org選択UIがない）、`login_id`を全org横断でユニークにするか、ログイン画面にorg選択／サブドメインを追加するかの設計判断がまだなかった。

→ **`login_id`を全org横断で一意にする方針に決定。ログイン画面へのorg選択UIは追加しない**（`docs/db/2026-07-28-01-organizations-and-login-id.sql`でDB制約化）。

理由:
1. 現行ログインフロー（`login_id`だけで`email`を検索→認証）を変えずに済み、UI追加コストがかからない
2. 過去に同じ論点を検討した形跡（`origin/claude/multitenancy-step1`ブランチ、2026-07-22、mainには未マージ）があり、同じ結論（org横断一意・org選択UIなし）に達していた。今回はその判断を踏襲する
3. 現状1組織のみで、複数組織を跨いで同じ`login_id`を使いたいという要求も無い

詳細は`docs/decision-log.md`参照。

### 移行順序（安全にやる）
1. `organizations`テーブル作成＋既存データに「霧珠ファーム」1組織を割り当て（`org="kishu"`→organization_id紐付け）＋`login_id`一意制約。SQL: `docs/db/2026-07-28-01-organizations-and-login-id.sql`（**未実行・レビュー用に起草のみ**。適用はユーザーが手動で行う）
2. 各テーブルに`organization_id`列追加（nullable）→バックフィル→NOT NULL化。SQL: `docs/db/2026-07-28-02-organization-id-columns.sql`（**未実行**。ステップ1適用後に実行すること）。クライアントコード（`src/App.tsx`等）は列が無い状態でも今まで通り動作し、列が追加されると自動的にそちらを使うようフォールバック実装済み（`docs/multitenancy-progress.md`参照）
3. JWTクレーム設定→RLS実ポリシーを1テーブルずつ適用しながらクライアントクエリを更新
4. 全テーブル移行後に`allow_all`ポリシーを撤廃
5. 2組織目を受け入れる前に、別Supabaseユーザーで越境アクセス不可を検証（チェックリスト: `docs/multitenancy-progress.md`）

> ⚠️ **注意（2026-07-28調査で判明）**: `origin/claude/multitenancy-step1-done` / `step2-done`という未マージのリモートブランチに「上記1・2を本番Supabaseで実行完了」と記録するコミットが存在する。しかしこの作業はmainにマージされておらず、現在のmain（このADRの実装元）のコードにもドキュメントにも反映されていない。**本番DBの実際のスキーマ状態（`organizations`テーブルやorganization_id列が既に存在するか）は今回未確認**。上記SQLは未実行を前提に`IF NOT EXISTS`等で冪等に書いているため、実行済み環境に流しても壊れないが、適用前に必ずSupabaseダッシュボードで現況を確認すること。

---

## 2. AI機能の設計（日報自動生成をPoCとして実装済み）

- 実装: `api/generate-report.ts`（OpenAI `gpt-4o-mini`）＋ App.tsxレポートタブの「AI日報」ボタン
- 設計判断: API側はクライアント整形済みテキストのみ受け取る**疎結合**。reportsスキーマ変更の影響を受けず、将来のマルチテナント化とも独立
- 環境変数: `OPENAI_API_KEY`（Vercelダッシュボードで設定、リポジトリに書かない）
- 拡張候補: 生成日報のLINE通知連携（既存api/notify-line.tsを流用）、週報・月報、防除サマリー

---

## 3. AI機能の採算試算

### 前提（gpt-4o-mini 料金、2026-07時点）
- input: $0.15 / 1M tokens、output: $0.60 / 1M tokens
- 日報1回あたり: input 約600 tokens（作業記録＋プロンプト）、output 約350 tokens
- 為替: 1ドル=150円で概算

### 1回あたりコスト
- input: 600 × $0.15 / 1M = $0.00009
- output: 350 × $0.60 / 1M = $0.00021
- **合計 約$0.0003 ≒ 0.045円/回**

### 規模別の月間コスト（毎日1回生成の想定）
| 規模 | 月間生成回数 | 月間APIコスト |
|---|---|---|
| 1組織 | 30回 | 約1.4円 |
| 10組織 | 300回 | 約14円 |
| 100組織 | 3,000回 | 約135円 |

### 結論（投資家モードの締め）
- **APIコストは採算上のボトルネックにならない**（1組織あたり月数円）。「AI機能のコストを回収できるか」という問いは実質的に無意味
- 本当のボトルネックは以下の2つ。プラン課金でAI機能を上位プランに置くなら、ここを埋めないとGOにできない:

| GO条件 | 現状 | 埋め方 |
|---|---|---|
| **①有料で何組織取れるか** | ⚠️ 2026-07-19: 知人農家への実ヒアリングは待たず、**過去の市場調査（アグリノート30,000組織超・アグリハブ3万人超の競合比較、法人3.3万社という市場規模）で十分と判断し次工程へ進める**ことをユーザーが決定。[[agritech-hearing-script]]は今後実施する場合の質問集として保持するが、着手のブロッカーにはしない | — |
| **②AI機能に金を払う需要があるか** | 同上の判断により、実ヒアリングを待たず先に進める | — |
| **③マルチテナント化の開発工数** | 上記1章＋「改修箇所の実測」節で具体化済み（数週間規模） | 会員権・Web/AEO事業の稼働と競合しないタイミングを見極める（機会費用） |

- **推奨（2026-07-19更新）**: ①②の実証待ちで止めず、`docs/roadmap.md`のAI機能ロードマップ（音声メモ構造化→記録検索チャット→天気防除助言→画像診断の順）を実装優先で進める。マルチテナント化・Stripe連携は機能実装と並行してタイミングを見極める

---

## 4. App.tsx肥大化への対応（付随課題）

現状3,300行超の単一コンポーネント。組織設定・プラン管理・AI機能UIをさらに積み増す前に、機能単位（reports / pesticides / analytics / settings）でのコンポーネント分割を検討する。本ADRのスコープ外だが、マルチテナント化着手時に同時実施するのが効率的。
