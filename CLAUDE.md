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
TickTick 的なシンプルさ。緑一色の農業テンプレ感を出さない。
- 背景 `#F7F5F1` / 文字 `#1F1B19` / アクセント `#6B2D5C`（主要CTAのみ）/ 補助 `#8A8378` / 線 `#E5E0D8`
- 緑 `#2E7D32` は「状態」を表す時だけ。装飾に使わない
- System フォント、ウェイトは 700/600/400 の3段階。数値は太字・大きめ
- 角丸 8px 基準。影で囲まず線とコントラストで構造化。入力欄は下線スタイル
- アニメーションは最小限
