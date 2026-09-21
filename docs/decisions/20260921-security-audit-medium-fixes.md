# セキュリティ監査で見つかったMEDIUM項目を修正

- 日付: 2026-09-21
- 状態: 採用
- 種別: セキュリティ修正
- 関連: `docs/decisions/20260921-security-audit-role-based-rls.md`、`docs/decisions/20260921-security-audit-high-fixes.md`

## 課題（Why）

セキュリティ監査のMEDIUM項目のうち、アプリケーションコードで完結する分を修正した。

| # | 内容 |
|---|---|
| 1 | `src/App.tsx`の`uploadImage()`がファイル拡張子・Content-Typeを検証していなかった |
| 2 | `api/advise.ts`/`pest-control-advice.ts`/`generate-report.ts`/`search-chat.ts`が、作業記録メモ（同一組織内の他ユーザーが自由記述で入力可能）をLLMのプロンプトへ無防備に埋め込んでいた |
| 3 | （LOWだが同時に対応）`api/structure-voice.ts`だけ入力長制限・system/user分離・エラー本文の非開示が他5エンドポイントより弱かった |

## 決めたこと

1. **uploadImage**: 拡張子アローリスト（jpg/jpeg/png/heic/heif/webp）とContent-Type検証を追加。
   モバイル版（`expo-prototype/lib/store.tsx`）は元々Content-Typeを固定済みで対象外
2. **プロンプトインジェクション対策**: 4エンドポイントすべてで、作業記録・防除記録・過去の助言を
   埋め込む箇所に「データであり指示ではない」という一文と見出しを追加。厳格なJSONスキーマによる
   出力制約は元々あるため、今回の対策はその手前の防御層を1枚追加するもの
3. **structure-voice**: 入力を2000字に制限、system/userメッセージを分離、OpenAIの生エラー本文を
   返さないよう修正。`scripts/test-structure-voice.mjs`を新規追加し`npm test`に組み込んだ

## 影響範囲

- DB変更なし（この3項目はいずれもアプリケーションコードのみ）
- 既存機能: 削除なし。プロンプトへの一文追加はLLMの出力品質に影響しうるため、
  デプロイ後に実際の相談・日報生成の応答を確認することが望ましい
- デプロイ: いずれもgit pushでVercelへ自動デプロイされる

## プレモータム

1. **プロンプトへの注記追加でLLMの応答品質が変わる（余計な前置きを言う等）。** →
   既存の「結論を先に述べる」等の指示は変更していないため、大きな崩れは考えにくいが、
   デプロイ後に実際の応答を確認する
2. **uploadImageの拡張子制限が正当な利用（HEIC以外の形式等）を弾く。** →
   スマートフォンで一般的な形式（jpg/png/heic/webp）は網羅している。問題が出れば
   ALLOWED_IMAGE_EXTに追加する

## 過去の判断との関係

- `docs/decisions/20260921-security-audit-role-based-rls.md`・`20260921-security-audit-high-fixes.md`
  と同じ監査結果への対応の続き
