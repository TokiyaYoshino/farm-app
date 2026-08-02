# Expo ネイティブ移植（farm-app モバイル）

`docs/decisions/20260801-verify-expo-dashboard-report-prototype.md` の検証として開始し、全画面へ拡張済み。
**リデザインではなく移植** — 現行Web版（`src/App.tsx`）の Soft Widget スタイルをそのまま踏襲する。

## 画面構成

| タブ | ファイル | 内容 |
|---|---|---|
| ホーム | `screens/HomeScreen.tsx` | 天気・統計・今日の予定・新着コメント・導線 |
| 記録 | `screens/ReportScreen.tsx` + `CalendarView.tsx` + `ReportDetailSheet.tsx` | カレンダー（月週・日別シート・詳細・予定CRUD）／記録一覧（検索・フィルタ・詳細） |
| 分析 | `screens/AnalyticsScreen.tsx`（レポート）+ `GanttScreen.tsx`（計画） | KPI・収穫グラフ・作業時間内訳・GDD・散布図／3ヶ月ガント |
| 管理 | `screens/ManageScreen.tsx` | 作物・圃場・農薬の3サブタブ |
| 共通 | `screens/QuickReportSheet.tsx`, `ui/` | FAB記録フォーム、Btn/BottomSheet/RowMenu/CommentThread/charts |

- デザイントークン: `ui/tokens.ts`（Web版から数値無変更。影のみ RN 形式に分解）
- 集計ロジック: `lib/metrics.ts`（Web版 `src/lib/metrics.ts` と同一）
- データ: `mock.ts`（Supabase 接続なし。2025/2026 の2年分）
- グラフ: `ui/charts.tsx`（react-native-svg による recharts 代替）

## 実行

```bash
cd expo-prototype
npm install
npx expo start            # 同一Wi-Fi
npx expo start --tunnel   # Wi-Fiで繋がらない場合（AP分離等）
```

Expo Go（SDK 54）で QR 読み取り、または `i` で iOS シミュレータ。

## Web版との既知の差分

検証ドキュメントの「結果と判断」欄に集約（影の単一化・select代替・datetimepicker・アイコン・グラフ自作・和文字間）。
