# 農場管理アプリ（farm-app）

React + TypeScript + Supabase の農場作業記録アプリ。本番: https://kishu-farm.vercel.app（kishufarm.com）

## 構成
- `src/App.tsx` にほぼ全機能（タブ state 切替、ページルーターなし）
- `src/components/` CalendarView.tsx, DatePicker.tsx
- スタイリングはインラインスタイル（Tailwind未使用）、カラー定数 `C`
- デプロイ: git push で Vercel 自動デプロイ

## 参照ドキュメント（必要な時に読む）
- DBスキーマ全表: `docs/db-schema.md`
- Supabase運用手順: `docs/supabase-ops.md`
- 機能一覧・ロードマップ: `docs/roadmap.md`

## 規約
- TypeScript の型を明示する
- Supabase テーブル変更時は RLS ポリシーも確認
- 新機能追加時に既存機能を削除しない（ナビから外しても tab コンテンツは残す）
- **サンプルデータに「梅」「南高梅」「紀州」「和歌山」など特定の地域・品目を使わない。**
  モック・ドキュメント・画面のダミーデータの作物例は汎用のもの（トマト・きゅうりなど）、
  地名は「現在地」等にする。何度も指摘されている。
  例外は、機能の説明上その語でないと成立しない箇所だけ
  （FAMIC 作物名の紐付け例「南高梅 → うめ」など、実装の意味が変わるもの）

### UI文言の語形（2026-09-09 決定 / `docs/decisions/20260909-ai-wording-and-icons.md`）
国内の指針は割れている（SmartHR は「ボタン＝動詞の終止形」、Mozilla日本語版は「ボタン＝体言止め」）。
farm-app は次で統一する。両者が一致する「画面タイトル・項目名＝名詞」は必ず守る。
- 押すと処理が走るボタン → **動詞**（日報にまとめる／写真で調べる／話して記録）
- 画面名・タブ名・カード見出し・シート見出し → **体言止め**（次の散布時期／ふりかえり）
- 別画面へ移動するだけの行 → **体言止め**（帳票出力／圃場マップ）
- **問いかけ形は使わない**（✗「次の散布はいつ？」）。国内主要25機能で0件
- カタカナ語より漢字語を優先（利用者に高齢層が多い）

### AI機能の見せ方
- **入口（ボタン・見出し）に「AI」の語を出さない。** 動作か成果で書く
- **分析タブのAI出力履歴と、農薬・診断の注意書きでは明示する。** 誰が書いたかを全部隠すと不誠実になる
- **✨Sparkles（きらめき）をAIの記号に使わない。** 機能の実体を指すアイコンにする
  （日報=FileText / 音声=Mic / 履歴=History / 病害虫=Bug / 農薬=FlaskConical）
- **同じアイコンを別の意味に使わない**（過去に FlaskConical が診断と農薬で衝突していた）

## デザイントークン（要点）
**Soft Widget スタイル**（Notion Calendar / Family 系。2026-07 決定）。
色・影・角丸は **`src/ui/tokens.ts` に集約**（他ファイルで直書き禁止）。詳細は `docs/design-brief-widget.md`。

原則：**構造は無彩色・アクセントは明るい緑1色を塗りで・border ではなく影と面の色差で階層化・深い角丸・完全ピルのボタン・ラベル小/値大**。

### カラー（`C`）
- サーフェス3層: `bg #F5F5F6`（背景）> `card #FFFFFF`（浮き面）> `well #EFEFF1`（受け皿の凹み）。入れ子＝白→灰→白
- ブランド緑（インク）: `ink #2E7D32` = CTA・アクティブ・選択・保存。`inkPress` / `inkSoft`（淡塗り）
- セマンティック: `danger`（削除）/ `warning`（未報告）/ `info`（中立強調）。分野色 `pesticide` / `temp` / `rain`
- ニュートラル: `text #1A1C1E`（墨・緑みなし）/ `textSub` / `textMuted` / `hairline #EBEBED`（区切り線）
- 影 `SHADOW.card/float/pill`、角丸 `RADIUS.card20/well18/row14/pill999`
- ※旧 `primary/border/blue*` は互換エイリアス（ink/hairline/info にマップ）。新規は canonical 名を使う

### ボタン（`src/ui/styles.ts` の `btn(variant,size)`、完全ピル）
- **primary**（ink塗り）= 主操作、1画面1個 / **soft**（緑淡）= 準主操作
- **secondary**（白＋hairline枠）= 副操作 / **tertiary**（文字のみ）= 補助
- **danger**（赤塗り）= 破壊的操作の確定（確認モーダルを挟む）
- サイズ lg / md / sm

### レイアウト規則
- グループ入力: 灰 well に白 row を積む（`S.wellBox` / `S.wrow` / `S.lbl2` / `S.fieldSelect`）
- リスト: 個別カードでなく1枚のカードに hairline 区切りの行、が理想（移行中は個別ソフトカードも可）
- モーダルは `src/ui/BottomSheet`、削除メニューは `src/ui/RowMenu`
- カードは影で描き border は使わない。入力欄は下線 or well 行。アニメーションは最小限
- System フォント、ウェイト 700/600/400。数値は太字・大きめ
