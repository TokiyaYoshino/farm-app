// ─── 型定義（src/App.tsx の interface 群と同一）────────────────────────
export type Role = "admin" | "worker" | "viewer";

export interface User {
  id: number; name: string; role: Role;
  login_id?: string; auth_id?: string; email?: string;
  org?: string; organization_id?: string;
}
export interface Crop {
  id: number; name: string; start_date: string;
  last_work_date?: string; target_yield?: number;
}
export interface Field { id: number; name: string; lat: number | null; lng: number | null }
export interface AppSettings { id: number; location_name: string; lat: number; lng: number }
export interface WorkCategory { id: number; name: string; unit: string | null }
export interface Pesticide {
  id: string; name: string; type: string | null;
  dilution_rate?: string | null; notes?: string | null;
}
export interface Report {
  id: number; user_id: number; crop_id: number; field: string; date: string;
  work_type: string; quantity: string; work_time: string; note: string;
  image_url: string; weather: string; weather_icon: string; temp: string;
  humidity: string; rain: string;
  pesticide_id?: string; pesticide_amount?: string;
  pesticides_used?: { id: string; amount: string | null }[];
  soil_ph?: number | null;
  work_start?: string | null;
  work_end?: string | null;
  work_category_id?: number | null;
  quantity_value?: number | null;
  quantity_unit?: string | null;
  work_minutes?: number | null;
}
export interface Schedule {
  id: string; user_id: number; assigned_user_id?: number;
  work_type?: string; title: string; date: string; note?: string;
  crop?: string; field?: string; created_at: string;
}
export interface Comment {
  id: string; target_type: string; target_id: string;
  user_id: number; message: string; created_at: string;
}
export interface Project {
  id: string; org?: string; name: string;
  crop_id?: number; field?: string;
  start_date?: string; end_date?: string;
  status: "active" | "completed" | "archived";
  created_by?: number; created_at: string; color?: string;
}

export const WORK_TEMPLATES = ["収穫", "施肥", "防除", "播種", "灌水", "草刈り", "剪定", "その他"];

// 農薬散布系の作業区分か（Web版と同一の判定）
export const isPesticideWorkType = (workType: string) =>
  workType === "農薬散布" || workType === "防除";

export const calcWorkMinutes = (start: string | null | undefined, end: string | null | undefined): number | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
};
