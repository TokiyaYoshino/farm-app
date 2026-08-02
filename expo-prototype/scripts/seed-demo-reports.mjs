// 過去の作業記録デモデータ投入スクリプト
// 分析タブの前年比較・月次グラフ・作業時間内訳など「データが無いと出ない表示」の確認用。
// 実在の作物・圃場・ユーザーを参照して整合するデータを作る。note に [demo] を含めるので
// あとで一括削除できる（削除: node scripts/seed-demo-reports.mjs --delete）
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env"), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// ログインして RLS を通す（第1・第2引数: ログインID / パスワード）
const [loginId, password, flag] = process.argv.slice(2);
const isDelete = loginId === "--delete" || flag === "--delete";

async function main() {
  const realLoginId = isDelete && loginId === "--delete" ? password : loginId;
  const realPassword = isDelete && loginId === "--delete" ? flag : password;
  if (!realLoginId || !realPassword) {
    console.error("使い方: node scripts/seed-demo-reports.mjs <ログインID> <パスワード> [--delete]");
    process.exit(1);
  }

  const { data: ud } = await supabase.from("users").select("email").eq("login_id", realLoginId).maybeSingle();
  if (!ud?.email) { console.error("ユーザーIDが見つかりません"); process.exit(1); }
  const { error: ae } = await supabase.auth.signInWithPassword({ email: ud.email, password: realPassword });
  if (ae) { console.error("ログイン失敗:", ae.message); process.exit(1); }

  const { data: me } = await supabase.from("users").select("*").eq("login_id", realLoginId).maybeSingle();
  const org = me?.org ?? "kishu";
  const organizationId = me?.organization_id ?? null;

  if (isDelete) {
    const { error, count } = await supabase.from("reports")
      .delete({ count: "exact" }).eq("org", org).like("note", "%[demo]%");
    if (error) { console.error("削除失敗:", error.message); process.exit(1); }
    console.log(`デモ記録 ${count ?? "?"} 件を削除しました`);
    return;
  }

  const [{ data: crops }, { data: fields }, { data: users }, { data: pesticides }] = await Promise.all([
    supabase.from("crops").select("id,name").eq("org", org).order("id"),
    supabase.from("fields").select("id,name").eq("org", org).order("id"),
    supabase.from("users").select("id,name,role").eq("organization_id", organizationId).order("id"),
    supabase.from("pesticides").select("id,name").eq("org", org).order("name"),
  ]);
  if (!crops?.length || !fields?.length) {
    console.error("作物または圃場が未登録です。先に管理タブから登録してください。");
    process.exit(1);
  }
  const workers = (users ?? []).filter(u => u.role !== "viewer");
  const crop = i => crops[i % crops.length];
  const field = i => fields[i % fields.length];
  const worker = i => workers[i % Math.max(1, workers.length)];
  const pest = i => pesticides?.length ? pesticides[i % pesticides.length] : null;

  const y = new Date().getFullYear();
  // 今年8件 + 前年7件 = 15件。収穫(kg・箱)・防除(農薬つき)・施肥(pH)・時刻あり/なしを混ぜて
  // KPI前年比・月次グラフ・作業時間内訳・除外注記・散布図が全部描画されるようにする
  const rows = [
    // ── 今年 ──
    { date: `${y}-07-28`, work_type: "収穫", quantity: "42", ci: 1, fi: 2, ui: 1, work_start: "07:00", work_end: "10:30", weather: "晴れ", temp: "32.0", humidity: "60", rain: "0.0", note: "完熟分を回収 [demo]" },
    { date: `${y}-07-15`, work_type: "収穫", quantity: "120", ci: 1, fi: 2, ui: 2, work_start: "06:30", work_end: "11:00", weather: "晴れ", temp: "31.0", rain: "0.0", note: "[demo]" },
    { date: `${y}-07-02`, work_type: "収穫", quantity: "180", ci: 1, fi: 2, ui: 0, work_start: "06:00", work_end: "12:00", weather: "曇り", temp: "28.4", rain: "0.0", note: "豊作 [demo]" },
    { date: `${y}-07-29`, work_type: "収穫", quantity: "12", quantity_unit: "箱", ci: 2, fi: 1, ui: 1, work_time: "2", weather: "晴れ", temp: "31.5", rain: "0.0", note: "出荷用に箱詰め [demo]" },
    { date: `${y}-06-10`, work_type: "防除", quantity: "", ci: 0, fi: 0, ui: 0, work_start: "07:00", work_end: "09:30", weather: "曇り", temp: "26.2", rain: "0.0", usePest: true, note: "黒点病予防 [demo]" },
    { date: `${y}-05-25`, work_type: "草刈り", quantity: "", ci: 0, fi: 0, ui: 2, work_time: "4", weather: "晴れ", temp: "24.8", rain: "0.0", note: "[demo]" },
    { date: `${y}-04-18`, work_type: "施肥", quantity: "", ci: 1, fi: 2, ui: 0, work_time: "3", soil_ph: 6.2, weather: "晴れ", temp: "18.5", rain: "0.0", note: "春肥 [demo]" },
    { date: `${y}-01-20`, work_type: "収穫", quantity: "95", ci: 0, fi: 0, ui: 0, work_time: "4", weather: "晴れ", temp: "8.1", rain: "0.0", note: "貯蔵分出荷 [demo]" },
    // ── 前年（前年同時期比・前年線用） ──
    { date: `${y - 1}-07-20`, work_type: "収穫", quantity: "90", ci: 1, fi: 2, ui: 1, work_time: "4", weather: "晴れ", temp: "30.5", rain: "0.0", note: "[demo]" },
    { date: `${y - 1}-07-05`, work_type: "収穫", quantity: "160", ci: 1, fi: 2, ui: 2, work_start: "06:00", work_end: "11:30", weather: "曇り", temp: "29.0", rain: "0.0", note: "[demo]" },
    { date: `${y - 1}-06-25`, work_type: "収穫", quantity: "130", ci: 1, fi: 2, ui: 1, work_time: "5", weather: "雨", temp: "25.0", rain: "4.5", note: "[demo]" },
    { date: `${y - 1}-06-12`, work_type: "防除", quantity: "", ci: 0, fi: 0, ui: 0, work_start: "07:00", work_end: "09:00", weather: "晴れ", temp: "27.0", rain: "0.0", usePest: true, note: "[demo]" },
    { date: `${y - 1}-05-28`, work_type: "草刈り", quantity: "", ci: 0, fi: 0, ui: 2, work_time: "5", weather: "晴れ", temp: "25.5", rain: "0.0", note: "[demo]" },
    { date: `${y - 1}-04-15`, work_type: "施肥", quantity: "", ci: 1, fi: 2, ui: 0, work_time: "3", soil_ph: 6.0, weather: "曇り", temp: "17.0", rain: "0.0", note: "[demo]" },
    { date: `${y - 1}-01-25`, work_type: "収穫", quantity: "110", ci: 0, fi: 0, ui: 0, work_time: "5", weather: "晴れ", temp: "7.5", rain: "0.0", note: "[demo]" },
  ];

  const calcMin = (s, e) => {
    if (!s || !e) return null;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    const d = (eh * 60 + em) - (sh * 60 + sm);
    return d > 0 ? d : null;
  };

  const payload = rows.map((r, i) => ({
    org, organization_id: organizationId,
    user_id: worker(r.ui)?.id ?? me.id,
    crop_id: crop(r.ci).id,
    field: field(r.fi).name,
    date: r.date,
    work_type: r.work_type,
    quantity: r.quantity,
    quantity_value: r.quantity ? parseFloat(r.quantity) : null,
    quantity_unit: r.quantity_unit ?? null,
    work_time: r.work_time ?? "",
    work_start: r.work_start ?? null,
    work_end: r.work_end ?? null,
    work_minutes: calcMin(r.work_start, r.work_end),
    note: r.note,
    image_url: "", weather: r.weather ?? "", weather_icon: "",
    temp: r.temp ?? "", humidity: r.humidity ?? "", rain: r.rain ?? "",
    pesticide_id: r.usePest ? (pest(i)?.id ?? null) : null,
    pesticides_used: r.usePest && pest(i) ? [{ id: pest(i).id, amount: "100L" }] : null,
    soil_ph: r.soil_ph ?? null,
  }));

  const { data, error } = await supabase.from("reports").insert(payload).select("id");
  if (error) { console.error("投入失敗:", error.message); process.exit(1); }
  console.log(`デモ記録 ${data.length} 件を投入しました（今年${rows.filter(r => r.date.startsWith(String(y))).length}件・前年${rows.filter(r => r.date.startsWith(String(y - 1))).length}件）`);
  console.log("削除するには: node scripts/seed-demo-reports.mjs <ID> <パスワード> --delete");
}

main();
