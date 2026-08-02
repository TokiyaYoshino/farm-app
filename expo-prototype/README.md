# farm-app モバイル（Expo / React Native）

Web版（`src/`）と同じ Supabase に接続する本実装。デザインは Soft Widget を数値無変更で移植。

## セットアップ

```bash
cd expo-prototype
npm install
cp .env.example .env   # Supabase URL / anon key を設定（Web版と同じ値）
npx expo start         # つながらない場合 --tunnel
```

Expo Go（SDK 54）で QR 読み取り。ログインは Web 版と同じユーザーID・パスワード。

## 画面構成

| タブ | ファイル | 内容 |
|---|---|---|
| ログイン | `screens/LoginScreen.tsx` | login_id → email 解決 → Supabase Auth（Web版と同一フロー） |
| ホーム | `screens/HomeScreen.tsx` | 天気（Open-Meteo）・統計・今日の予定・新着コメント |
| 記録 | `screens/ReportScreen.tsx` + `CalendarView.tsx` + `ReportDetailSheet.tsx` | カレンダー（予定CRUD・詳細・コメント）／記録一覧（検索・フィルタ・削除） |
| 分析 | `screens/AnalyticsScreen.tsx` + `GanttScreen.tsx` | KPI・収穫/作業時間グラフ・散布図（実データ）／計画ガント（閲覧） |
| 管理 | `screens/ManageScreen.tsx` | 作物・圃場（GPS位置設定）・農薬の追加/削除 |
| 記録フォーム | `screens/QuickReportSheet.tsx` | 写真添付（Storage）・時間帯天気自動取得・農薬複数選択・土壌pH |

## アーキテクチャ

- `lib/supabase.ts` — クライアント（AsyncStorage セッション永続化・URLポリフィル）
- `lib/store.tsx` — StoreProvider。認証監視 → org/organization_id で全テーブル取得、CRUD＋楽観更新（Web版 `src/App.tsx` のデータ層と同一クエリ）
- `lib/types.ts` — 型定義（Web版 interface 群と同一）
- `lib/metrics.ts` — 収穫量・作業時間の集計（Web版 `src/lib/metrics.ts` と同一）
- `lib/weather.ts` — Open-Meteo（現在天気・時間帯実績）
- `ui/` — tokens（数値無変更）・Btn・BottomSheet・Picker（select代替）・RowMenu・CommentThread・charts（recharts代替）

## Web版との機能差（フェーズ2以降で対応）

- AI機能（日報生成・画像診断・検索チャット・防除助言）— `api/*.ts` が Vercel 依存のため
- GDD・病害虫傾向・AI出力履歴（daily_weather / ai_outputs）
- 計画（プロジェクト）の追加・編集、担当者進捗ビュー、ユーザー管理、LINE通知
- 音声メモ（Web Speech API 相当は expo-speech-recognition の導入が必要）
- IAP（ストア内課金）— マルチテナント化・Stripe連携後
