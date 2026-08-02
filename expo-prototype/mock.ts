// ─── モックデータ(Supabase接続なし)────────────────────────────────
// 実データの形は src/App.tsx の型定義に合わせる。
// 分析画面の前年比較・グラフが成立するよう2025/2026の2年分の報告を持つ。

export interface Crop { id: number; name: string; start_date: string; target_yield?: number }
export interface Field { id: number; name: string; lat: number | null; lng: number | null }
export interface User { id: number; name: string; role: "admin" | "worker" | "viewer" }
export interface Report {
  id: number; user_id: number; crop_id: number; date: string;
  work_type: string; quantity: string; quantity_unit?: string | null;
  work_time?: string; note: string;
  field: string; weather?: string; temp?: string; humidity?: string; rain?: string;
  work_start?: string | null; work_end?: string | null;
  work_minutes?: number | null; pesticide_id?: string; image_url?: string;
}
export interface Schedule {
  id: string; user_id: number; assigned_user_id?: number;
  work_type?: string; title: string; date: string; note?: string;
  crop?: string; field?: string; created_at: string;
}
export interface CommentRow {
  id: string; target_type: string; target_id: string;
  user_id: number; message: string; created_at: string;
}
export interface Pesticide {
  id: string; name: string; type: string | null; dilution_rate?: string | null;
}
export interface Project {
  id: string; name: string; crop_id?: number; field?: string;
  start_date?: string; end_date?: string;
  status: "active" | "completed" | "archived"; created_at: string; color?: string;
}

export const TODAY = "2026-08-02";

export const crops: Crop[] = [
  { id: 1, name: "みかん", start_date: "2026-03-10", target_yield: 1200 },
  { id: 2, name: "梅", start_date: "2026-02-20", target_yield: 800 },
  { id: 3, name: "キャベツ", start_date: "2026-07-05" },
];

export const fields: Field[] = [
  { id: 1, name: "A圃場", lat: 34.2532, lng: 135.3141 },
  { id: 2, name: "B圃場", lat: 34.2541, lng: 135.3178 },
  { id: 3, name: "山側圃場", lat: null, lng: null },
];

export const users: User[] = [
  { id: 1, name: "吉野", role: "admin" },
  { id: 2, name: "田中", role: "worker" },
  { id: 3, name: "佐藤", role: "worker" },
];

export const pesticides: Pesticide[] = [
  { id: "p1", name: "マシン油乳剤", type: "殺虫剤", dilution_rate: "95倍" },
  { id: "p2", name: "ICボルドー", type: "殺菌剤", dilution_rate: "50倍" },
  { id: "p3", name: "スミチオン乳剤", type: "殺虫剤", dilution_rate: "1000倍" },
];

// 2026年(今年)の報告 — 直近はカレンダー・記録一覧用に密に、
// それ以前は月次グラフ用に月1〜3件
export const reports: Report[] = [
  { id: 130, user_id: 2, crop_id: 1, date: "2026-08-01", work_type: "防除", quantity: "", note: "カイガラムシ向け。風が弱い朝のうちに散布。", field: "A圃場", weather: "晴れ", temp: "31.2", humidity: "68", rain: "0.0", work_start: "06:30", work_end: "08:00", pesticide_id: "p1" },
  { id: 129, user_id: 1, crop_id: 3, date: "2026-07-31", work_type: "灌水", quantity: "", work_time: "1", note: "", field: "B圃場", weather: "快晴", temp: "33.8", humidity: "55", rain: "0.0", work_start: "17:00", work_end: "18:00" },
  { id: 128, user_id: 3, crop_id: 1, date: "2026-07-30", work_type: "草刈り", quantity: "", work_time: "3", note: "園地下段まで完了。次回は山側。", field: "A圃場", weather: "曇り", temp: "29.5", humidity: "74", rain: "0.0" },
  { id: 127, user_id: 2, crop_id: 2, date: "2026-07-28", work_type: "収穫", quantity: "42", note: "完熟落果分を回収。", field: "山側圃場", weather: "晴れ", temp: "32.0", humidity: "60", rain: "0.0", work_start: "07:00", work_end: "10:30" },
  { id: 126, user_id: 1, crop_id: 3, date: "2026-07-27", work_type: "施肥", quantity: "", work_time: "2", note: "追肥1回目。", field: "B圃場", weather: "一部曇り", temp: "30.1", humidity: "65", rain: "0.0" },
  { id: 125, user_id: 3, crop_id: 2, date: "2026-07-15", work_type: "収穫", quantity: "120", note: "", field: "山側圃場", weather: "晴れ", temp: "31.0", rain: "0.0", work_start: "06:30", work_end: "11:00" },
  { id: 124, user_id: 2, crop_id: 2, date: "2026-07-02", work_type: "収穫", quantity: "180", note: "南高梅、豊作。", field: "山側圃場", weather: "曇り", temp: "28.4", rain: "0.0", work_start: "06:00", work_end: "12:00" },
  { id: 123, user_id: 2, crop_id: 2, date: "2026-06-20", work_type: "収穫", quantity: "150", note: "", field: "山側圃場", weather: "雨", temp: "25.0", rain: "4.5", work_time: "5" },
  { id: 122, user_id: 1, crop_id: 1, date: "2026-06-10", work_type: "防除", quantity: "", note: "黒点病予防。", field: "A圃場", weather: "曇り", temp: "26.2", rain: "0.0", work_start: "07:00", work_end: "09:30", pesticide_id: "p2" },
  { id: 121, user_id: 3, crop_id: 1, date: "2026-05-25", work_type: "草刈り", quantity: "", work_time: "4", note: "", field: "A圃場", weather: "晴れ", temp: "24.8", rain: "0.0" },
  { id: 120, user_id: 2, crop_id: 1, date: "2026-05-12", work_type: "防除", quantity: "", note: "開花期前の防除。", field: "B圃場", weather: "晴れ", temp: "22.1", rain: "0.0", work_start: "08:00", work_end: "10:00", pesticide_id: "p3" },
  { id: 119, user_id: 1, crop_id: 2, date: "2026-04-18", work_type: "施肥", quantity: "", work_time: "3", note: "春肥。", field: "山側圃場", weather: "晴れ", temp: "18.5", rain: "0.0" },
  { id: 118, user_id: 2, crop_id: 1, date: "2026-03-20", work_type: "剪定", quantity: "", work_time: "6", note: "", field: "A圃場", weather: "曇り", temp: "14.0", rain: "0.0" },
  { id: 117, user_id: 3, crop_id: 1, date: "2026-02-15", work_type: "剪定", quantity: "", work_time: "5", note: "", field: "B圃場", weather: "晴れ", temp: "9.2", rain: "0.0" },
  { id: 116, user_id: 1, crop_id: 1, date: "2026-01-20", work_type: "収穫", quantity: "95", note: "貯蔵みかん出荷分。", field: "A圃場", weather: "晴れ", temp: "8.1", rain: "0.0", work_time: "4" },
  // 単位がkg以外の収穫(分析の除外注記の確認用)
  { id: 115, user_id: 2, crop_id: 3, date: "2026-07-29", work_type: "収穫", quantity: "12", quantity_unit: "箱", note: "出荷用に箱詰め。", field: "B圃場", weather: "晴れ", temp: "31.5", rain: "0.0", work_time: "2" },

  // 2025年(前年) — 前年比較用
  { id: 30, user_id: 2, crop_id: 2, date: "2025-07-20", work_type: "収穫", quantity: "90", note: "", field: "山側圃場", work_time: "4" },
  { id: 29, user_id: 3, crop_id: 2, date: "2025-07-05", work_type: "収穫", quantity: "160", note: "", field: "山側圃場", work_start: "06:00", work_end: "11:30" },
  { id: 28, user_id: 2, crop_id: 2, date: "2025-06-25", work_type: "収穫", quantity: "130", note: "", field: "山側圃場", work_time: "5" },
  { id: 27, user_id: 1, crop_id: 1, date: "2025-06-12", work_type: "防除", quantity: "", note: "", field: "A圃場", work_start: "07:00", work_end: "09:00", pesticide_id: "p2" },
  { id: 26, user_id: 3, crop_id: 1, date: "2025-05-28", work_type: "草刈り", quantity: "", work_time: "5", note: "", field: "A圃場" },
  { id: 25, user_id: 2, crop_id: 1, date: "2025-05-10", work_type: "防除", quantity: "", note: "", field: "B圃場", work_start: "08:00", work_end: "10:30", pesticide_id: "p3" },
  { id: 24, user_id: 1, crop_id: 2, date: "2025-04-15", work_type: "施肥", quantity: "", work_time: "3", note: "", field: "山側圃場" },
  { id: 23, user_id: 2, crop_id: 1, date: "2025-03-18", work_type: "剪定", quantity: "", work_time: "7", note: "", field: "A圃場" },
  { id: 22, user_id: 1, crop_id: 1, date: "2025-01-25", work_type: "収穫", quantity: "110", note: "", field: "A圃場", work_time: "5" },
  { id: 21, user_id: 3, crop_id: 1, date: "2025-11-30", work_type: "収穫", quantity: "220", note: "", field: "A圃場", work_start: "07:00", work_end: "14:00" },
  { id: 20, user_id: 2, crop_id: 1, date: "2025-12-10", work_type: "収穫", quantity: "180", note: "", field: "B圃場", work_time: "6" },
];

export const schedules: Schedule[] = [
  { id: "s1", user_id: 1, assigned_user_id: 2, work_type: "防除", title: "", date: "2026-08-02", crop: "みかん", field: "A圃場", created_at: "2026-07-30" },
  { id: "s2", user_id: 1, assigned_user_id: 3, work_type: "灌水", title: "夕方でOK", date: "2026-08-02", crop: "キャベツ", field: "B圃場", created_at: "2026-07-30" },
  { id: "s3", user_id: 1, assigned_user_id: 3, work_type: "草刈り", title: "", date: "2026-07-29", crop: "みかん", field: "A圃場", created_at: "2026-07-25" },
  { id: "s4", user_id: 1, assigned_user_id: 2, work_type: "収穫", title: "", date: "2026-08-05", crop: "梅", field: "山側圃場", created_at: "2026-07-31" },
  { id: "s5", user_id: 1, assigned_user_id: 1, work_type: "施肥", title: "秋肥の準備", date: "2026-08-10", crop: "みかん", field: "B圃場", created_at: "2026-08-01" },
];

export const comments: CommentRow[] = [
  { id: "c1", target_type: "report", target_id: "130", user_id: 1, message: "散布量も記録に残しておいて", created_at: "2026-08-01T09:15:00" },
  { id: "c2", target_type: "schedule", target_id: "s2", user_id: 3, message: "了解です、17時から入ります", created_at: "2026-08-01T12:30:00" },
  { id: "c3", target_type: "report", target_id: "127", user_id: 2, message: "@吉野 山側の落果が多め、次回確認お願いします", created_at: "2026-07-28T15:00:00" },
];

export const projects: Project[] = [
  { id: "pj1", name: "梅の収穫", crop_id: 2, field: "山側圃場", start_date: "2026-06-15", end_date: "2026-08-05", status: "active", created_at: "2026-06-01", color: "#C98A2E" },
  { id: "pj2", name: "みかん防除(夏期)", crop_id: 1, field: "A圃場", start_date: "2026-07-01", end_date: "2026-08-31", status: "active", created_at: "2026-06-20", color: "#2E7D32" },
  { id: "pj3", name: "キャベツ定植", crop_id: 3, field: "B圃場", start_date: "2026-08-20", end_date: "2026-09-10", status: "active", created_at: "2026-07-25", color: "#3773E1" },
];

// 積算温度(GDD)モック: 2025/2026の月次合計(℃・日)。今年が少し早いペース
export const gddMonthly: Record<string, number[]> = {
  "2025": [15, 22, 68, 145, 230, 310, 390, 405, 320, 210, 95, 30],
  "2026": [20, 30, 85, 160, 250, 330, 410, 15, 0, 0, 0, 0], // 8月は月初まで
};

export const weatherNow = { label: "晴れ", temp: "31.4", humidity: 66, rain: 0.0, place: "紀の川市" };

export const WORK_TEMPLATES = ["収穫", "施肥", "防除", "播種", "灌水", "草刈り", "剪定", "その他"];

export const cropName = (id: number) => crops.find(c => c.id === id)?.name ?? "不明";
export const userName = (id: number) => users.find(u => u.id === id)?.name ?? "不明";
export const commentCountOf = (targetType: string, targetId: string | number) =>
  comments.filter(c => c.target_type === targetType && c.target_id === String(targetId)).length;
export const scheduleTitle = (s: Schedule) => s.title || "";
