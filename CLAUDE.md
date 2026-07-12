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
TickTick 的なシンプルさ。色は **`src/ui/tokens.ts` の `C` に集約**（他ファイルで色を直書きしない）。

### カラー（緑基調＋セマンティック）
緑をブランド／状態色として整理して使う（2026-07 決定。旧・紫アクセント案は不採用）。
- ブランド緑 `primary #2d6a2d` = 主要CTA・アクティブ・保存。淡色は `primary3/4`
- セマンティック: `danger #c0392b`（削除）/ `warning #f57f17`（未報告・未設定）/ `info #1976d2`（中立の強調）
- 分野色: 農薬 `pesticide #7b1fa2` / 天気 `temp #e07020`・`rain #0288d1`
- ニュートラル: 文字 `text #1a2e1a` / `textSub` / `textMuted`、背景 `bg #f4f7f2`、面 `card #fff`、線 `border #dde8dd`

### ボタン階層（`src/ui/styles.ts` の `btn(variant,size)`）
- **Primary**（塗り緑）= 画面の主操作。1画面に1つに絞る
- **Secondary**（枠線＋緑文字）= 副操作 / **Tertiary**（文字のみ）= 補助
- **danger**（塗り赤）= 破壊的操作の確定。削除は確認モーダルを挟む
- サイズは lg / md / sm の3段階

### その他
- System フォント、ウェイトは 700/600/400 の3段階。数値は太字・大きめ
- 角丸 8px 基準。影は最小限、線とコントラストで構造化。入力欄は下線スタイル
- アニメーションは最小限
