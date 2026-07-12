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
