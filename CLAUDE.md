# 農場管理アプリ — プロジェクト概要

## 基本情報
- **URL**: https://kishu-farm.vercel.app
- **リポジトリ**: Vercelデプロイ済み（React + TypeScript + Supabase）
- **ドメイン**: kishufarm.com

## 技術スタック
- フロントエンド: React + TypeScript（単一ファイル構成 src/App.tsx）
- コンポーネント: src/components/CalendarView.tsx, DatePicker.tsx
- バックエンド/DB: Supabase（PostgreSQL + Storage + Auth）
- デプロイ: Vercel（git push で自動デプロイ）
- 気象データ: Open-Meteo API（GPS位置 or 設定座標）
- スタイリング: インラインスタイル（Tailwind未使用）、カラーパレットは定数 `C`

## ファイル構成
```
src/
  App.tsx               # メインアプリ（全タブ・状態管理）
  components/
    CalendarView.tsx    # カレンダー・詳細・コメント機能
    DatePicker.tsx      # 日付選択ピッカー
```

## ナビゲーション構成
- ボトムナビ3タブ: ホーム / マップ / レポート（BarChart2）
- ホーム管理カード: 作物・圃場（crops タブ）/ 農薬管理（pesticides タブ）
- ユーザーピッカー（右上 UserCircle）: ユーザー切り替え / 管理画面（admin のみ）/ ログアウト
- ヘッダー「+ 作業記録」ボタン → レポートタブに遷移

## Supabase テーブル一覧
| テーブル | 主なカラム |
|---------|-----------|
| users | id, name, role, org, login_id, auth_id, email |
| crops | id, name, org, start_date, last_work_date, target_yield |
| fields | id, name, org, lat, lng |
| reports | id, user_id, crop_id, field, date, work_type, quantity, work_time, note, image_url, weather, temp, humidity, rain, pesticide_id, pesticide_amount, pesticides_used(jsonb), soil_ph, org |
| schedules | id, user_id, assigned_user_id, work_type, title, date, note, crop |
| pesticides | id, name, type, dilution_rate, notes, org, created_at |
| comments | id, target_type('report'/'schedule'), target_id, user_id, message, created_at |
| sessions | id, user_id, field_id, started_at, ended_at, duration_minutes, voice_memo |
| settings | id, org, location_name, lat, lng |
| projects | id(uuid), org, name, crop_id, field, start_date, end_date, status, created_by, created_at |
| tickets | id(uuid), project_id(→projects), org, title, work_type, assigned_user_id, due_date, status('open'/'done'), report_id, note, created_at |

## 主な機能
- ダッシュボード（天気・収穫量・作業統計）
- カレンダー（作業報告・予定の表示、フィルター・ソート対応）
- 詳細ビュー（写真・農薬・天気表示）+ コメント機能（吹き出し形式、自分のみ編集可）
- 作業報告の登録（農薬複数選択・散布量・土壌pH・写真・音声メモ対応）
- 作業コピー機能（既存報告をベースに新規作成）
- 作物管理（作付け日・最終作業日・目標収穫量、実績vs目標収穫グラフ）
- 圃場管理（GPS位置、作付け履歴表示）
- 農薬管理（種別・希釈倍数・備考）
- 担当者進捗ビュー（週次テーブル、予定×実績自動マッチング、管理者のみ操作可）
- 計画管理（projects/ticketsテーブル、チケット自動クローズ）
- ユーザー管理・アカウント作成（管理者のみ）
- 作業セッションタイマー
- マップ（圃場位置、GPS対応）
- LINE 通知（報告登録時）

## Supabase 管理メモ
- 管理者アカウント追加: Supabaseダッシュボード → Table Editor → users → Insert row → name, role: admin, org: kishu を入力
- RLS は全テーブルで有効（allow_all ポリシー）
- 画像は Storage の report-images バケット

## コーディング規約・注意点
- TypeScript 型定義を明示する
- ページルーターなし（tab state で切り替え）
- Supabase テーブル変更時は RLS ポリシーも確認
- 新機能を追加するとき既存機能を削除しない（ナビから見えなくしても tab コンテンツは残す）
- Vercel デプロイはコミット後に自動実行

## 開発ロードマップ（2026-06 更新）

### 完了済み
- 作業コピー機能（handleCopyReport）
- 作付け履歴（圃場カードにgetFieldCropHistory表示）
- 収穫グラフ実績vs目標（ComposedChart）
- 目標収穫量インライン編集・年ナビゲーション
- 担当者進捗ビュー（週次テーブル、自動マッチング）
- 計画管理（projects/ticketsテーブル、自動マッチング）

### 進行中
- マルチテナント化（最優先・外部展開の前提）

### フェーズ設計
- 短期：マルチテナント化・入力UX改善
- 中期：作業時間集計・リマインダー・写真ギャラリー・モバイル化
- 長期：データ分析・AI予測・データ販売

### 方針
- 入力データ蓄積 → 外部展開 → データ価値化の順序を守る
- 「使い続けてもらえるアプリ」が短期の最優先
- モバイルアプリ化は React Native/Expo 方向で検討中

## オーナー情報
- 担当: 吉野（個人プロジェクト）
- 用途: 農業作業の記録・管理（紀州農場）
