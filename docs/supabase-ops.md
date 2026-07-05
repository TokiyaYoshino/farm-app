# Supabase 運用手順

## 管理者アカウント追加
Supabaseダッシュボード → Table Editor → users → Insert row → name, role: admin, org: kishu を入力

## ストレージ
- 画像は Storage の `report-images` バケット

## セキュリティ
- RLS は全テーブルで有効（allow_all ポリシー）
- API キー・URL は `.env` / `.env.local` のみに置く。設定ファイルやドキュメントに平文で書かない
