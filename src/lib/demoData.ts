// ─── デモモード ──────────────────────────────────────────────
// 目的: 認証と本番DBを介さずに実画面を描画し、スクリーンショットで確認できるようにする。
//       （本番は Supabase 認証が要り、開発環境からはログインできないため）
//
// 安全策:
//   1. VITE_DEMO_MODE=1 のときだけ有効。既定 off なので Vercel では死にコード
//   2. DEMO 時は Supabase クライアントを必ずダミーURLにする（本番キーが置かれていても書き込めない）
//   3. 画面上に「デモデータ」バッジを出す（本番に紛れ込んだら一目で分かる）
//
// 起動: npm run demo
// 経緯: docs/decisions/20260909-demo-mode.md
//
// 作物名・地名は CLAUDE.md の規約に従い、特定の地域・品目を使わない。

import type { Schedule, Comment } from "../components/CalendarView";

export const DEMO: boolean = import.meta.env.VITE_DEMO_MODE === "1";

// DEMO 時に createClient へ渡す値。実URLを渡さないことで本番DBへの書き込みを構造的に防ぐ
export const DEMO_SUPABASE_URL = "https://demo.invalid";
export const DEMO_SUPABASE_KEY = "demo-anon-key";

// ─── 日付ヘルパー（相対日付にして、いつ起動しても「今日の記録」が成立するようにする）
const iso = (offsetDays: number): string =>
  new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);

export const DEMO_TODAY: string = iso(0);

// ─── 型（App.tsx の interface と同じ形。App.tsx 側は非 export のため構造だけ合わせる）
export interface DemoUser {
  id: number; name: string; role: "admin" | "worker" | "viewer";
  login_id?: string; auth_id?: string; email?: string; org?: string; organization_id?: string;
}
export interface DemoCrop {
  id: number; name: string; start_date: string; last_work_date?: string;
  target_yield?: number; famic_crop_name?: string | null;
}
export interface DemoField { id: number; name: string; lat: number | null; lng: number | null; }
export interface DemoWorkCategory { id: number; name: string; unit: string | null; }
export interface DemoPesticide {
  id: string; org: string; name: string; type: string;
  dilution_rate: string; notes: string; created_at: string;
  master_id?: string; registration_no?: string | null; active_ingredient?: string;
  pre_harvest_interval?: string; usage_method?: string;
}
export interface DemoReport {
  id: number; user_id: number; crop_id: number; field: string; date: string;
  work_type: string; quantity: string; work_time: string; note: string;
  image_url: string; weather: string; weather_icon: string; temp: string;
  humidity: string; rain: string;
  pesticide_id?: string; pesticide_amount?: string;
  pesticides_used?: { id: string; amount: string | null }[];
  soil_ph?: number | null; work_start?: string | null; work_end?: string | null;
  work_category_id?: number | null; quantity_value?: number | null;
  quantity_unit?: string | null; work_minutes?: number | null;
}

const ORG_ID = "00000000-0000-0000-0000-000000000001";

export const demoUsers: DemoUser[] = [
  { id: 1, name: "田中", role: "admin",  org: "demo", organization_id: ORG_ID },
  { id: 2, name: "佐藤", role: "worker", org: "demo", organization_id: ORG_ID },
  { id: 3, name: "鈴木", role: "viewer", org: "demo", organization_id: ORG_ID },
];

export const demoCurrentUser: DemoUser = demoUsers[0];

export const demoCrops: DemoCrop[] = [
  { id: 1, name: "トマト",   start_date: iso(142), last_work_date: iso(0), target_yield: 1200, famic_crop_name: "トマト" },
  { id: 2, name: "きゅうり", start_date: iso(88),  last_work_date: iso(2), target_yield: 800,  famic_crop_name: "きゅうり" },
];

export const demoFields: DemoField[] = [
  { id: 1, name: "東の畑",   lat: 35.0167, lng: 135.5833 },
  { id: 2, name: "第1ハウス", lat: 35.0170, lng: 135.5840 },
];

export const demoWorkCategories: DemoWorkCategory[] = [
  { id: 1, name: "収穫",   unit: "kg" },
  { id: 2, name: "防除",   unit: "L" },
  { id: 3, name: "施肥",   unit: "kg" },
  { id: 4, name: "灌水",   unit: "L" },
  { id: 5, name: "草刈り", unit: null },
];

export const demoPesticides: DemoPesticide[] = [
  {
    id: "p1", org: "demo", name: "ダコニール1000", type: "殺菌剤",
    dilution_rate: "1000倍", notes: "", created_at: iso(200),
    registration_no: "12345", active_ingredient: "TPN",
    pre_harvest_interval: "収穫7日前まで", usage_method: "散布",
  },
  {
    id: "p2", org: "demo", name: "アファーム乳剤", type: "殺虫剤",
    dilution_rate: "2000倍", notes: "", created_at: iso(200),
    registration_no: "23456", active_ingredient: "エマメクチン安息香酸塩",
    pre_harvest_interval: "収穫前日まで", usage_method: "散布",
  },
];

// 天気は記録ごとに固定値。DEMO では外部APIに依存させない
const wx = { weather: "晴れ", weather_icon: "Sun", temp: "28", humidity: "62", rain: "0" };

// 「今日の記録3件」と「前回の散布から12日」が両方成立するように日付を置く
export const demoReports: DemoReport[] = [
  { id: 1, user_id: 1, crop_id: 1, field: "東の畑", date: iso(0), work_type: "収穫", quantity: "24kg", work_time: "2時間", note: "下段から順に。色づきは例年並み。", image_url: "", ...wx, work_category_id: 1, quantity_value: 24, quantity_unit: "kg", work_start: "07:00", work_end: "09:00", work_minutes: 120 },
  { id: 2, user_id: 2, crop_id: 2, field: "第1ハウス", date: iso(0), work_type: "灌水", quantity: "200L", work_time: "30分", note: "", image_url: "", ...wx, work_category_id: 4, quantity_value: 200, quantity_unit: "L", work_minutes: 30 },
  { id: 3, user_id: 1, crop_id: 1, field: "東の畑", date: iso(0), work_type: "草刈り", quantity: "", work_time: "1時間", note: "通路のみ。畝間は次回。", image_url: "", ...wx, work_category_id: 5, work_minutes: 60 },
  { id: 4, user_id: 2, crop_id: 2, field: "第1ハウス", date: iso(2), work_type: "収穫", quantity: "18kg", work_time: "1.5時間", note: "", image_url: "", ...wx, work_category_id: 1, quantity_value: 18, quantity_unit: "kg", work_minutes: 90 },
  { id: 5, user_id: 1, crop_id: 1, field: "東の畑", date: iso(4), work_type: "施肥", quantity: "40kg", work_time: "1時間", note: "追肥。", image_url: "", ...wx, work_category_id: 3, quantity_value: 40, quantity_unit: "kg", soil_ph: 6.5, work_minutes: 60 },
  { id: 6, user_id: 1, crop_id: 1, field: "東の畑", date: iso(6), work_type: "収穫", quantity: "21kg", work_time: "2時間", note: "", image_url: "", ...wx, work_category_id: 1, quantity_value: 21, quantity_unit: "kg", work_minutes: 120 },
  { id: 7, user_id: 2, crop_id: 2, field: "第1ハウス", date: iso(9), work_type: "収穫", quantity: "15kg", work_time: "1時間", note: "", image_url: "", ...wx, work_category_id: 1, quantity_value: 15, quantity_unit: "kg", work_minutes: 60 },
  // 直近の防除（ホーム「前回の散布から◯日」がこれを拾う）
  { id: 8, user_id: 1, crop_id: 1, field: "東の畑", date: iso(12), work_type: "防除", quantity: "200L", work_time: "1.5時間", note: "下葉に黒い斑点が少し出ていた。", image_url: "", ...wx, work_category_id: 2, quantity_value: 200, quantity_unit: "L", pesticide_id: "p1", pesticide_amount: "200", pesticides_used: [{ id: "p1", amount: "200" }], work_minutes: 90 },
  { id: 9, user_id: 2, crop_id: 2, field: "第1ハウス", date: iso(15), work_type: "灌水", quantity: "180L", work_time: "30分", note: "", image_url: "", ...wx, work_category_id: 4, quantity_value: 180, quantity_unit: "L", work_minutes: 30 },
  { id: 10, user_id: 1, crop_id: 1, field: "東の畑", date: iso(19), work_type: "収穫", quantity: "19kg", work_time: "2時間", note: "", image_url: "", ...wx, work_category_id: 1, quantity_value: 19, quantity_unit: "kg", work_minutes: 120 },
  { id: 11, user_id: 1, crop_id: 2, field: "第1ハウス", date: iso(24), work_type: "防除", quantity: "150L", work_time: "1時間", note: "", image_url: "", ...wx, work_category_id: 2, quantity_value: 150, quantity_unit: "L", pesticide_id: "p2", pesticide_amount: "150", pesticides_used: [{ id: "p2", amount: "150" }], work_minutes: 60 },
  { id: 12, user_id: 2, crop_id: 1, field: "東の畑", date: iso(30), work_type: "施肥", quantity: "35kg", work_time: "1時間", note: "", image_url: "", ...wx, work_category_id: 3, quantity_value: 35, quantity_unit: "kg", soil_ph: 6.3, work_minutes: 60 },
];

export const demoSchedules: Schedule[] = [
  { id: "s1", user_id: 1, assigned_user_id: 2, work_type: "防除", title: "防除", date: iso(0), crop: "トマト", field: "東の畑", note: "天気を見て判断", created_at: iso(3) },
  { id: "s2", user_id: 1, assigned_user_id: 1, work_type: "収穫", title: "収穫", date: iso(-2), crop: "きゅうり", field: "第1ハウス", created_at: iso(3) },
];

export const demoComments: Comment[] = [
  { id: "c1", target_type: "report", target_id: "1", user_id: 2, message: "下段、思ったより採れましたね", created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: "c2", target_type: "schedule", target_id: "s1", user_id: 3, message: "午後から風が強くなるようです", created_at: new Date(Date.now() - 7200000).toISOString() },
];

export const demoWeatherCoords = { lat: 35.0167, lng: 135.5833, name: "現在地" };

// ─── 相談スレッド（主題ごとの箱）
export interface DemoThread {
  id: string; title: string; crop_id: number | null; field: string | null;
  system_key?: string | null;
  created_at: string; updated_at: string;
}
export const demoThreads: DemoThread[] = [
  { id: "t1", title: "トマトの病害虫", crop_id: 1, field: null, created_at: iso(20), updated_at: iso(1) },
  { id: "t2", title: "今年の防除計画",  crop_id: null, field: null, created_at: iso(35), updated_at: iso(7) },
  { id: "t3", title: "日報", crop_id: null, field: null, system_key: "daily_report", created_at: iso(30), updated_at: iso(0) },
];

export interface DemoAdviceMessage {
  id: string; thread_id: string; crop_id: number | null;
  role: "user" | "assistant"; content: string; kind?: string | null;
  sources?: string[] | null; limits?: string[] | null; created_at: string;
}
export const demoThreadMessages: Record<string, DemoAdviceMessage[]> = {
  t1: [
    { id: "m1", thread_id: "t1", crop_id: 1, role: "user", content: "下葉に黒い斑点が出てきた。どうしたらいい？", created_at: iso(1) },
    { id: "m2", thread_id: "t1", crop_id: 1, role: "assistant",
      content: "斑点の出方から、まず疫病と輪紋病を分けて考えてください。前回の散布から12日経っていて、その間に降雨が2日あります。まず下葉を取り除いて風通しを作り、広がるようなら薬剤を検討する順番が安全です。",
      sources: ["この農場の防除記録（直近90日）", "Open-Meteo の実績7日"],
      limits: ["写真を見ていないため病名は特定していません"], created_at: iso(1) },
  ],
  t2: [
    { id: "m3", thread_id: "t2", crop_id: null, role: "user", content: "今年の防除、去年より回数を減らしたい", created_at: iso(7) },
    { id: "m4", thread_id: "t2", crop_id: null, role: "assistant",
      content: "回数を減らすなら、まず記録から「effective だった散布」と「予防的に打っていた散布」を分けるのが先です。この相談は特定の作付けに紐づいていないので、作物ごとの使用回数の上限には触れていません。",
      limits: ["作付けを選んでいないため、農薬の使用回数は判定していません"], created_at: iso(7) },
  ],
  t3: [
    { id: "m5", thread_id: "t3", crop_id: null, role: "assistant", kind: "daily_report",
      content: `${iso(2)}\n第1ハウスで収穫18kg。ほかの作業はなし。`, created_at: iso(2) },
    { id: "m6", thread_id: "t3", crop_id: null, role: "assistant", kind: "daily_report",
      content: `${iso(0)}\n本日は収穫2件と草刈り1件。\n・東の畑 収穫 24kg（07:00〜09:00）\n・第1ハウス 灌水 200L\n・東の畑 草刈り（通路のみ）\n翌日への申し送り: 畝間の草刈りが残っています。`,
      created_at: iso(0) },
  ],
};
