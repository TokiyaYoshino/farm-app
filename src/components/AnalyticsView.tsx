import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, ScatterChart, Scatter, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { BarChart2, Leaf, Thermometer, CloudRain, Clock, FlaskConical, Bug, Sparkles, ChevronDown, Target } from "lucide-react";
import { C, SHADOW, RADIUS } from "../ui/tokens";
import type { MetricReport } from "../lib/metrics";
import { harvestQty, isCountableHarvest, excludedHarvestCount, workMinutes, toHours, pctDiff } from "../lib/metrics";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const CHART_COLORS = [C.ink,"#1976d2","#e07020","#9c27b0","#00838f","#c62828","#558b2f","#4527a0"];

/**
 * 分析に必要なぶんだけを要求する構造的な型。App.tsx の Report がそのまま渡る。
 * 収穫量・作業時間の算出ルールは lib/metrics に集約してあり、ここでは再実装しない。
 */
export interface AnalyticsReport extends MetricReport {
  id: number;
  user_id: number;
  crop_id: number;
  field: string;
  date: string;
  temp: string;
  rain: string;
  pesticide_id?: string;
}

interface DiagnosisJson {
  inconclusive: boolean;
  possibilities: { name: string; confidence: "高" | "中" | "低"; reason: string }[];
  note: string;
}

interface AiOutputRow {
  id: string;
  kind: "diagnosis" | "pest_advice" | "daily_report" | "voice_structure";
  created_at: string;
  target_date: string | null;
  field: string | null;
  output_json: DiagnosisJson | null;
  output_text: string | null;
}

interface DailyWeatherRow {
  date: string;
  gdd: number | null;
}

interface Props {
  // ai_outputs / daily_weather は organization_id 基準。作業記録などレガシーの org 文字列
  // 基準のデータは App.tsx 側で取得済みのものを props で受け取るため、ここでは扱わない。
  organizationId: string | null;
  lat: number | null;
  lng: number | null;
  reports: AnalyticsReport[];
  crops: { id: number; name: string; target_yield?: number }[];
  pesticides: { id: string; name: string }[];
  users: { id: number; name: string }[];
  cropId: number | "all";
  onCropChange: (id: number | "all") => void;
}

// 有効積算温度(GDD)の基準温度。暫定で10℃固定。
// 梅・みかんそれぞれの適正値は daily_weather に実績が溜まってから見直す。
const GDD_BASE_TEMP = 10;

const KIND_LABEL: Record<AiOutputRow["kind"], string> = {
  diagnosis:       "画像診断",
  pest_advice:     "防除助言",
  daily_report:    "日報",
  voice_structure: "音声整理",
};

/**
 * daily_weather の同期。分析タブを開いたときに、未取得の日付ぶんだけ Open-Meteo の
 * アーカイブ（無料・キー不要）から取得して upsert する。Cron は立てない。
 * アーカイブが前日ぶんまで返すことは確認済み（docs/decision-log.md 2026-07-31）。
 */
async function syncDailyWeather(organizationId: string, lat: number, lng: number): Promise<void> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { data: latest } = await supabase
    .from("daily_weather").select("date")
    .eq("organization_id", organizationId)
    .order("date", { ascending: false }).limit(1);

  // 続きから取る。初回は1年分さかのぼる
  const from = latest?.[0]?.date
    ? new Date(new Date(latest[0].date).getTime() + 86400000).toISOString().slice(0, 10)
    : new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  if (from > yesterday) return; // 最新まで揃っている

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    // wind_max は m/s で保存する（Open-Meteo の既定は km/h）
    `&wind_speed_unit=ms&start_date=${from}&end_date=${yesterday}&timezone=Asia%2FTokyo`;
  const res = await fetch(url);
  if (!res.ok) return;
  const d = await res.json();
  const days: string[] = d.daily?.time ?? [];
  if (days.length === 0) return;

  const rows = days.map((date, i) => {
    const tmax: number | null = d.daily.temperature_2m_max?.[i] ?? null;
    const tmin: number | null = d.daily.temperature_2m_min?.[i] ?? null;
    return {
      organization_id: organizationId,
      date,
      temp_max: tmax,
      temp_min: tmin,
      rain_sum: d.daily.precipitation_sum?.[i] ?? null,
      wind_max: d.daily.wind_speed_10m_max?.[i] ?? null,
      gdd: tmax != null && tmin != null ? Math.max(0, (tmax + tmin) / 2 - GDD_BASE_TEMP) : null,
    };
  });
  const { error } = await supabase
    .from("daily_weather").upsert(rows, { onConflict: "organization_id,date" });
  if (error) console.error("syncDailyWeather failed:", error);
}

const cardStyle = {
  background: C.card,
  borderRadius: RADIUS.card,
  padding: "16px",
  marginBottom: 12,
  boxShadow: SHADOW.card,
};

const secStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: C.textSub,
  marginBottom: 10,
  marginTop: 16,
  display: "flex",
  alignItems: "center",
  gap: 6,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
};

const selectStyle = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "none",
  fontSize: 16,
  background: C.well,
  color: C.text,
  marginRight: 8,
  marginBottom: 8,
};

const emptyStyle = {
  textAlign: "center" as const,
  color: C.textMuted,
  fontSize: 13,
  padding: "24px 0",
};

const noteStyle = {
  fontSize: 11,
  color: C.textMuted,
  marginTop: 6,
};

/** 年をまたいだ日付の前後を月日だけで比べるための通日。うるう年で最大1日ずれる。 */
const dayOfYear = (date: string): number =>
  Math.round((Date.parse(date) - Date.parse(`${date.slice(0, 4)}-01-01`)) / 86400000);

/** ラベル小・値大のKPIタイル。CLAUDE.md のデザイントークンに従い白 row を灰 well に積む。 */
function KpiTile({ label, value, unit, sub, subTone }: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  subTone?: "up" | "down" | "flat";
}) {
  const subColor = subTone === "up" ? C.ink : subTone === "down" ? C.danger : C.textMuted;
  return (
    <div style={{ background: C.card, borderRadius: RADIUS.row, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2, color: C.textMuted }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11, color: subColor, marginTop: 4, minHeight: 14 }}>{sub ?? ""}</div>
    </div>
  );
}

export default function AnalyticsView({
  organizationId, lat, lng, reports, crops, pesticides, users, cropId, onCropChange,
}: Props) {
  const [aiOutputs, setAiOutputs] = useState<AiOutputRow[]>([]);
  const [dailyWeather, setDailyWeather] = useState<DailyWeatherRow[]>([]);
  const [s5Field, setS5Field] = useState("all");
  const [s7Kind, setS7Kind] = useState<"all" | AiOutputRow["kind"]>("all");
  // 履歴は既定で3行に切る。開いた1件だけ全文にする
  const [openAiOutputId, setOpenAiOutputId] = useState<string | null>(null);
  const [showDeep, setShowDeep] = useState(false);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  // AI出力と日次気象は organization_id 基準で取得する。
  // 気象は未取得ぶんを Open-Meteo から埋めてから読み直す。
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    async function fetchAiAndWeather(orgId: string) {
      if (lat != null && lng != null) {
        await syncDailyWeather(orgId, lat, lng);
      }
      const [ai, dw] = await Promise.all([
        supabase.from("ai_outputs")
          .select("id,kind,created_at,target_date,field,output_json,output_text")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("daily_weather")
          .select("date,gdd")
          .eq("organization_id", orgId)
          .order("date"),
      ]);
      if (cancelled) return;
      setAiOutputs(ai.data ?? []);
      setDailyWeather(dw.data ?? []);
    }
    fetchAiAndWeather(organizationId);
    return () => { cancelled = true; };
  }, [organizationId, lat, lng]);

  const userName = (id: number) => users.find(u => u.id === id)?.name ?? "未設定";

  // ── 対象年と比較期間 ────────────────────────────────────────────
  const dataYears = Array.from(new Set(reports.map(r => Number(r.date.slice(0, 4)))))
    .filter(y => Number.isFinite(y))
    .sort((a, b) => b - a);
  const yearOptions = dataYears.includes(currentYear) ? dataYears : [currentYear, ...dataYears];
  const safeYear = yearOptions.includes(year) ? year : yearOptions[0];

  // 今年を見ているときは前年も「同じ月日まで」で切る。年の途中に開いても比較が成り立つ。
  const todayMmdd = new Date().toISOString().slice(5, 10);
  const truncate = safeYear === currentYear;
  const inCrop = (r: AnalyticsReport) => cropId === "all" || r.crop_id === cropId;
  const inYear = (r: AnalyticsReport, y: number) =>
    r.date.startsWith(String(y)) && (!truncate || r.date.slice(5) <= todayMmdd);

  const cur  = reports.filter(r => inCrop(r) && inYear(r, safeYear));
  const prev = reports.filter(r => inCrop(r) && inYear(r, safeYear - 1));

  // ── KPI ────────────────────────────────────────────────────────
  const sum = (rs: AnalyticsReport[]) => rs.reduce((s, r) => s + harvestQty(r), 0);
  const curHarvest  = sum(cur);
  const prevHarvest = sum(prev);
  const skipped     = excludedHarvestCount(cur);

  const targetCrops = crops.filter(c => cropId === "all" || c.id === cropId);
  const targetYield = targetCrops.reduce((s, c) => s + (c.target_yield ?? 0), 0);
  const achieved    = targetYield > 0 ? Math.round((curHarvest / targetYield) * 100) : null;

  const curHours  = toHours(cur.reduce((s, r) => s + workMinutes(r), 0));
  const prevHours = toHours(prev.reduce((s, r) => s + workMinutes(r), 0));

  const curSpray  = cur.filter(r => r.work_type === "防除").length;
  const prevSpray = prev.filter(r => r.work_type === "防除").length;

  const pctLabel = (v: number | null) =>
    v === null ? "前年データなし" : `前年${truncate ? "同時期" : ""}比 ${v >= 0 ? "+" : ""}${v}%`;
  const tone = (v: number | null): "up" | "down" | "flat" =>
    v === null ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat";

  // ── 収穫量：今年 vs 前年 vs 目標（月別）────────────────────────
  const monthlySum = (y: number) => {
    const m = Array<number>(12).fill(0);
    reports
      .filter(r => inCrop(r) && r.date.startsWith(String(y)))
      .forEach(r => { m[Number(r.date.slice(5, 7)) - 1] += harvestQty(r); });
    return m;
  };
  const curMonths  = monthlySum(safeYear);
  const prevMonths = monthlySum(safeYear - 1);
  const monthTarget = targetYield > 0 ? Math.round((targetYield / 12) * 10) / 10 : null;
  const harvestChart = curMonths.map((v, i) => ({
    month: `${i + 1}月`,
    cy: v,
    py: prevMonths[i],
    ...(monthTarget != null ? { tg: monthTarget } : {}),
  }));
  const hasHarvestData = curMonths.some(v => v > 0) || prevMonths.some(v => v > 0);

  // ── 作業時間の内訳 ─────────────────────────────────────────────
  const groupHours = (rs: AnalyticsReport[], key: (r: AnalyticsReport) => string) => {
    const m: Record<string, number> = {};
    rs.forEach(r => {
      const min = workMinutes(r);
      if (min <= 0) return;
      const k = key(r);
      m[k] = (m[k] ?? 0) + min;
    });
    return m;
  };
  const buildBars = (key: (r: AnalyticsReport) => string) => {
    const c = groupHours(cur, key);
    const p = groupHours(prev, key);
    return Object.keys(c)
      .sort((a, b) => c[b] - c[a])
      .slice(0, 8)
      .map(name => ({ name, cy: toHours(c[name]), py: toHours(p[name] ?? 0) }));
  };
  const hoursByType = buildBars(r => r.work_type || "未設定");
  const hoursByUser = buildBars(r => userName(r.user_id));

  // ── 病害虫診断の発生傾向 ───────────────────────────────────────
  // AIの推定であって確定診断ではないため、確信度「高」かつ inconclusive でないものだけ数える。
  // 「中」「低」まで数えると発生傾向が実態より大きく出て、防除判断を誤らせる。
  const s5Rows = aiOutputs.flatMap(o => {
    if (o.kind !== "diagnosis" || !o.output_json) return [];
    const j = o.output_json;
    if (j.inconclusive) return [];
    const top = j.possibilities?.find(p => p.confidence === "高");
    if (!top?.name) return [];
    return [{ month: (o.target_date ?? o.created_at).slice(0, 7), field: o.field ?? "不明", name: top.name }];
  });
  const s5Fields = Array.from(new Set(s5Rows.map(r => r.field)));
  const s5Filtered = s5Rows.filter(r => s5Field === "all" || r.field === s5Field);
  const s5MonthName: Record<string, Record<string, number>> = {};
  s5Filtered.forEach(r => {
    if (!s5MonthName[r.month]) s5MonthName[r.month] = {};
    s5MonthName[r.month][r.name] = (s5MonthName[r.month][r.name] ?? 0) + 1;
  });
  const s5Names = Array.from(new Set(s5Filtered.map(r => r.name)));
  const s5Data = Object.keys(s5MonthName).sort().map(m => {
    const row: Record<string, string | number> = { month: m };
    s5Names.forEach(n => { row[n] = s5MonthName[m]?.[n] ?? 0; });
    return row;
  });

  // ── 積算温度(GDD) ──────────────────────────────────────────────
  // 年初からの累積を月末時点で見る。年ごとに線を引くと「今年は暖かく進んでいる」が読める。
  // 果樹は多年生で作付けの入れ替わりが少ないぶん、年次比較の価値が高い。
  const gddYearMonth: Record<string, Record<string, number>> = {};
  dailyWeather.forEach(w => {
    if (w.gdd == null) return;
    const y = w.date.slice(0, 4);
    const mo = w.date.slice(5, 7);
    if (!gddYearMonth[y]) gddYearMonth[y] = {};
    gddYearMonth[y][mo] = (gddYearMonth[y][mo] ?? 0) + w.gdd;
  });
  const gddYears = Object.keys(gddYearMonth).sort();
  const gddChart = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(mo => {
    const row: Record<string, string | number> = { month: `${Number(mo)}月` };
    gddYears.forEach(y => {
      let s = 0;
      let has = false;
      for (let m = 1; m <= Number(mo); m++) {
        const v = gddYearMonth[y][String(m).padStart(2, "0")];
        if (v != null) { s += v; has = true; }
      }
      if (has) row[y] = Math.round(s);
    });
    return row;
  });

  // 日ごとの累積を作り、今年の現在値に前年が到達した日と比べて「◯日早い/遅い」を出す。
  // グラフを読まなくても進み具合が一文でわかるようにする。
  const gddLead = (() => {
    const byYear: Record<string, { date: string; cum: number }[]> = {};
    dailyWeather.forEach(w => {
      if (w.gdd == null) return;
      const y = w.date.slice(0, 4);
      if (!byYear[y]) byYear[y] = [];
      const arr = byYear[y];
      arr.push({ date: w.date, cum: (arr.length ? arr[arr.length - 1].cum : 0) + w.gdd });
    });
    const curSeries  = byYear[String(safeYear)] ?? [];
    const prevSeries = byYear[String(safeYear - 1)] ?? [];
    const latest = curSeries[curSeries.length - 1];
    if (!latest || prevSeries.length === 0) return null;
    const hit = prevSeries.find(p => p.cum >= latest.cum);
    return {
      date: latest.date,
      cum: Math.round(latest.cum),
      prevYear: safeYear - 1,
      hitDate: hit?.date ?? null,
      diffDays: hit ? dayOfYear(hit.date) - dayOfYear(latest.date) : null,
    };
  })();

  // ── AI出力の履歴 ───────────────────────────────────────────────
  const s7Rows = aiOutputs.filter(o => s7Kind === "all" || o.kind === s7Kind).slice(0, 50);
  /** 履歴に出す1行。
   *
   *  以前は最後に JSON.stringify(output_json) を返しており、**生のJSONが
   *  そのまま画面に出ていた**（`{"advice":{"reply":"にんにくの農薬を…` のような塊）。
   *  一覧は「いつ・何を聞いて・どうだったか」が分かればよく、中身の全文は要らない。 */
  const summarize = (o: AiOutputRow): string => {
    if (o.kind === "diagnosis" && o.output_json) {
      const j = o.output_json;
      if (j.inconclusive) return "判断できず";
      const names = (j.possibilities ?? []).map(p => `${p.name}(${p.confidence})`).join("、");
      return names || j.note || "—";
    }
    if (o.output_text) return o.output_text;
    // JSON で保存されている種類（相談など）は、読める場所だけを拾う。
    // 拾えなければ「—」にする。生のJSONは出さない
    if (o.output_json) {
      const j = o.output_json as unknown as Record<string, unknown>;
      const advice = j.advice as { reply?: unknown } | undefined;
      if (advice && typeof advice.reply === "string") return advice.reply;
      if (typeof j.reply === "string") return j.reply;
      if (typeof j.headline === "string") return j.headline;
      if (typeof j.summary === "string") return j.summary;
      return "—";
    }
    return "—";
  };

  return (
    <div style={{ padding:"16px 16px 0" }}>
      {/* ── 対象年・作物の切り替え（以下すべてがこれに従う） ── */}
      <div style={{ display:"flex", flexWrap:"wrap" as const, marginBottom:4 }}>
        <select style={selectStyle} value={safeYear} onChange={e => setYear(Number(e.target.value))}>
          {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select
          style={selectStyle}
          value={cropId === "all" ? "all" : String(cropId)}
          onChange={e => onCropChange(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">すべての作物</option>
          {crops.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
      </div>

      {/* ── KPI ── */}
      <div style={{ background:C.well, borderRadius:RADIUS.well, padding:8, marginBottom:12 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <KpiTile
            label={`${safeYear}年の収穫量`}
            value={curHarvest > 0 ? String(Math.round(curHarvest * 10) / 10) : "—"}
            unit={curHarvest > 0 ? "kg" : undefined}
            sub={pctLabel(pctDiff(curHarvest, prevHarvest))}
            subTone={tone(pctDiff(curHarvest, prevHarvest))}
          />
          <KpiTile
            label="目標達成率"
            value={achieved != null ? String(achieved) : "—"}
            unit={achieved != null ? "%" : undefined}
            sub={targetYield > 0 ? `年間目標 ${targetYield}kg` : "目標が未設定です"}
          />
          <KpiTile
            label="総作業時間"
            value={curHours > 0 ? String(curHours) : "—"}
            unit={curHours > 0 ? "h" : undefined}
            sub={pctLabel(pctDiff(curHours, prevHours))}
            subTone={tone(pctDiff(curHours, prevHours))}
          />
          <KpiTile
            label="防除回数"
            value={String(curSpray)}
            unit="回"
            sub={prevSpray > 0 ? `前年${truncate ? "同時期" : ""} ${prevSpray}回` : "前年データなし"}
          />
        </div>
        {skipped > 0 && (
          <div style={{ ...noteStyle, padding:"0 6px" }}>
            単位がkg以外の収穫記録{skipped}件を収穫量から除外しています
          </div>
        )}
      </div>

      {/* ── 収穫量：今年 vs 前年 vs 目標 ── */}
      <div style={secStyle}>
        <Target size={14} strokeWidth={2} />収穫量 {safeYear}年 vs {safeYear - 1}年
      </div>
      <div style={cardStyle}>
        {!hasHarvestData ? (
          <div style={emptyStyle}><Leaf size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />収穫の記録がまだありません</div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={harvestChart} margin={{ top:4, right:8, left:-16, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
              <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis tick={{ fontSize:11, fill:C.textMuted }} unit="kg" />
              <Tooltip formatter={(v, n) => [`${v}kg`, n]} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="cy" name={`${safeYear}年`} fill={C.ink} radius={[4,4,0,0]} />
              <Line type="monotone" dataKey="py" name={`${safeYear - 1}年`} stroke={C.info} strokeWidth={2} dot={{ r:2 }} />
              {monthTarget != null && (
                <Line type="monotone" dataKey="tg" name="月別目標" stroke={C.textMuted} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 作業時間の内訳 ── */}
      <div style={secStyle}>
        <Clock size={14} strokeWidth={2} />作業時間の内訳
      </div>
      <div style={cardStyle}>
        {hoursByType.length === 0 ? (
          <div style={emptyStyle}><Clock size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />作業時間の記録がまだありません</div>
        ) : (
          <>
            <div style={{ fontSize:12, fontWeight:600, color:C.textSub, marginBottom:6 }}>作業種別ごと</div>
            <ResponsiveContainer width="100%" height={Math.max(120, hoursByType.length * 34 + 40)}>
              <BarChart data={hoursByType} layout="vertical" margin={{ top:0, right:12, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} horizontal={false} />
                <XAxis type="number" tick={{ fontSize:11, fill:C.textMuted }} unit="h" />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize:11, fill:C.textSub }} />
                <Tooltip formatter={(v, n) => [`${v}h`, n]} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Bar dataKey="cy" name={`${safeYear}年`} fill={C.ink} radius={[0,4,4,0]} />
                <Bar dataKey="py" name={`${safeYear - 1}年`} fill={C.inkSoft} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>

            {hoursByUser.length > 1 && (
              <>
                <div style={{ fontSize:12, fontWeight:600, color:C.textSub, margin:"14px 0 6px" }}>担当者ごと</div>
                <ResponsiveContainer width="100%" height={Math.max(120, hoursByUser.length * 34 + 40)}>
                  <BarChart data={hoursByUser} layout="vertical" margin={{ top:0, right:12, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize:11, fill:C.textMuted }} unit="h" />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize:11, fill:C.textSub }} />
                    <Tooltip formatter={(v, n) => [`${v}h`, n]} />
                    <Legend wrapperStyle={{ fontSize:11 }} />
                    <Bar dataKey="cy" name={`${safeYear}年`} fill={C.ink} radius={[0,4,4,0]} />
                    <Bar dataKey="py" name={`${safeYear - 1}年`} fill={C.inkSoft} radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
            <div style={noteStyle}>
              作業時間は、記録した開始・終了時刻（無い場合は手入力の作業時間）から算出しています。
            </div>
          </>
        )}
      </div>

      {/* ── 積算温度 ── */}
      <div style={secStyle}>
        <Thermometer size={14} strokeWidth={2} />積算温度（GDD）の年次比較
      </div>
      <div style={cardStyle}>
        {gddLead && (
          <div style={{ background:C.well, borderRadius:RADIUS.row, padding:"10px 12px", marginBottom:10, fontSize:13, color:C.textSub, lineHeight:1.6 }}>
            {gddLead.diffDays == null ? (
              <>
                {gddLead.date.slice(5).replace("-", "/")} 時点の積算温度は <strong style={{ color:C.text }}>{gddLead.cum.toLocaleString()}℃・日</strong>。
                {gddLead.prevYear}年はこの値に達していないため、<strong style={{ color:C.ink }}>今年のほうが進んでいます</strong>。
              </>
            ) : (
              <>
                {gddLead.date.slice(5).replace("-", "/")} 時点の積算温度は <strong style={{ color:C.text }}>{gddLead.cum.toLocaleString()}℃・日</strong>。
                {gddLead.prevYear}年が同じ値に達したのは {gddLead.hitDate?.slice(5).replace("-", "/")} で、
                {gddLead.diffDays === 0 ? (
                  <strong style={{ color:C.text }}>ほぼ同じ進み方</strong>
                ) : (
                  <strong style={{ color: gddLead.diffDays > 0 ? C.ink : C.info }}>
                    今年は{Math.abs(gddLead.diffDays)}日{gddLead.diffDays > 0 ? "早い" : "遅い"}
                  </strong>
                )}
                ペースです。
              </>
            )}
          </div>
        )}
        <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.6, marginBottom:10 }}>
          日平均気温から基準温度{GDD_BASE_TEMP}℃を引いた有効積算温度の、年初からの累積です。
          年ごとに比べると生育の進み方の早い・遅いが読めます（基準温度は暫定値）。
        </div>
        {gddYears.length === 0 ? (
          <div style={emptyStyle}><Thermometer size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />気象データを取得中です</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={gddChart} margin={{ top:4, right:8, left:-8, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
              <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis tick={{ fontSize:11, fill:C.textMuted }} unit="℃" />
              <Tooltip formatter={(v, n) => [`${v}℃・日`, `${n}年`]} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              {gddYears.map((y, i) => (
                <Line key={y} type="monotone" dataKey={y} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 病害虫診断の発生傾向 ── */}
      <div style={secStyle}>
        <Bug size={14} strokeWidth={2} />病害虫診断の発生傾向
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.6, marginBottom:10 }}>
          AI画像診断の結果のうち、確信度が「高」のものだけを集計しています。
          <strong style={{ color:C.textSub }}>AIの推定であり確定診断ではありません。</strong>
          防除の判断は現物の確認と指導機関の情報にもとづいて行ってください。
        </div>
        {s5Fields.length > 1 && (
          <div style={{ display:"flex", flexWrap:"wrap" as const, marginBottom:8 }}>
            <select style={selectStyle} value={s5Field} onChange={e => setS5Field(e.target.value)}>
              <option value="all">すべての圃場</option>
              {s5Fields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
        {s5Data.length === 0 ? (
          <div style={emptyStyle}><Bug size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />確信度「高」の診断結果がまだありません</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={s5Data} margin={{ top:4, right:8, left:-16, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
              <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis allowDecimals={false} tick={{ fontSize:11, fill:C.textMuted }} unit="件" />
              <Tooltip formatter={(v, n) => [`${v}件`, n]} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              {s5Names.map((n, i) => (
                <Bar key={n} dataKey={n} stackId="pest" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── さらに掘る（探索用。相関を探す図なので既定では畳んでおく） ── */}
      <div style={secStyle}>
        <BarChart2 size={14} strokeWidth={2} />さらに掘る
      </div>
      <div style={{ ...cardStyle, padding: showDeep ? 16 : "4px 16px" }}>
        <button
          onClick={() => setShowDeep(v => !v)}
          style={{
            display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%",
            background:"none", border:"none", padding:"12px 0", cursor:"pointer",
            fontSize:13, fontWeight:600, color:C.textSub,
          }}
        >
          <span>相関を探す（気象・作業時間・防除タイミング）</span>
          <ChevronDown size={16} strokeWidth={2.5} style={{ transform: showDeep ? "rotate(180deg)" : "none", transition:"transform .15s" }} />
        </button>
        {showDeep && (
          <DeepDive reports={reports} crops={crops} pesticides={pesticides} />
        )}
      </div>

      {/* ── AI出力の履歴 ── */}
      <div style={secStyle}>
        <Sparkles size={14} strokeWidth={2} />AIの出力履歴
      </div>
      <div style={{ ...cardStyle, marginBottom: 32, padding: "16px 0 4px" }}>
        <div style={{ display:"flex", flexWrap:"wrap" as const, padding:"0 16px" }}>
          <select style={selectStyle} value={s7Kind} onChange={e => setS7Kind(e.target.value as typeof s7Kind)}>
            <option value="all">すべての種類</option>
            {(Object.keys(KIND_LABEL) as AiOutputRow["kind"][]).map(k => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        {s7Rows.length === 0 ? (
          <div style={{ ...emptyStyle, paddingBottom:24 }}>
            <Sparkles size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />AIの出力がまだありません
          </div>
        ) : (
          s7Rows.map((o, i) => (
            <div
              key={o.id}
              style={{
                padding:"12px 16px",
                borderTop: i === 0 ? "none" : `1px solid ${C.hairline}`,
              }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.ink, background:C.inkSoft, borderRadius:999, padding:"2px 8px" }}>
                  {KIND_LABEL[o.kind]}
                </span>
                <span style={{ fontSize:12, color:C.textMuted }}>
                  {(o.target_date ?? o.created_at).slice(0, 10)}
                </span>
                {o.field && <span style={{ fontSize:12, color:C.textMuted }}>· {o.field}</span>}
              </div>
              {/* 一覧なので3行で切る。全文が要るときだけ開く。
                  日報も相談も本文は数百字あり、50件ぶん全文を流すと履歴が読めなくなる */}
              <div
                style={{
                  fontSize:13, color:C.textSub, lineHeight:1.7, whiteSpace:"pre-wrap" as const,
                  ...(openAiOutputId === o.id ? {} : {
                    display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical" as const, overflow:"hidden",
                  }),
                }}
              >
                {summarize(o)}
              </div>
              {summarize(o).length > 60 && (
                <button
                  onClick={() => setOpenAiOutputId(openAiOutputId === o.id ? null : o.id)}
                  style={{ background:"none", border:"none", padding:0, marginTop:4, cursor:"pointer", color:C.ink, fontSize:12, fontWeight:600 }}
                >
                  {openAiOutputId === o.id ? "閉じる" : "全文を見る"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 探索用の散布図群。相関の有無を「探す」ための図であって答えを出す図ではないため、
 * 既定では畳んでおき、開いたときだけ計算する（④は防除×収穫の総当たりで重い）。
 */
function DeepDive({ reports, crops, pesticides }: {
  reports: AnalyticsReport[];
  crops: { id: number; name: string }[];
  pesticides: { id: string; name: string }[];
}) {
  const [d1Field, setD1Field] = useState("all");
  const [d1Crop, setD1Crop] = useState("all");
  const [d2Axis, setD2Axis] = useState<"temp" | "rain">("temp");
  const [d3WorkType, setD3WorkType] = useState("all");

  const harvestRows = reports.filter(isCountableHarvest);
  const sprayRows   = reports.filter(r => r.work_type === "防除");

  // ① 圃場×作物別 収穫量推移
  const allFields  = Array.from(new Set(harvestRows.map(r => r.field).filter(Boolean)));
  const allCropIds = Array.from(new Set(harvestRows.map(r => r.crop_id)));
  const d1Filtered = harvestRows.filter(r => {
    if (d1Field !== "all" && r.field !== d1Field) return false;
    if (d1Crop !== "all" && String(r.crop_id) !== d1Crop) return false;
    return true;
  });
  const d1MonthField: Record<string, Record<string, number>> = {};
  d1Filtered.forEach(r => {
    const month = r.date.slice(0, 7);
    const q = harvestQty(r);
    if (q <= 0) return;
    if (!d1MonthField[month]) d1MonthField[month] = {};
    const f = r.field || "不明";
    d1MonthField[month][f] = (d1MonthField[month][f] ?? 0) + q;
  });
  const d1Lines = Array.from(new Set(d1Filtered.map(r => r.field || "不明")));
  const d1Data = Object.keys(d1MonthField).sort().map(m => {
    const row: Record<string, string | number> = { month: m };
    d1Lines.forEach(f => { row[f] = d1MonthField[m]?.[f] ?? 0; });
    return row;
  });

  // ② 気象×収穫
  const d2Data = harvestRows.flatMap(r => {
    const q = harvestQty(r);
    const x = parseFloat(d2Axis === "temp" ? r.temp : r.rain);
    if (q <= 0 || isNaN(x)) return [];
    return [{ x, y: q, date: r.date, field: r.field, crop: crops.find(c => c.id === r.crop_id)?.name ?? "" }];
  });

  // ③ 作業時間×収穫量
  const d3WorkTypes = Array.from(new Set(reports.map(r => r.work_type).filter(Boolean)));
  const d3Data = reports.flatMap(r => {
    if (d3WorkType !== "all" && r.work_type !== d3WorkType) return [];
    const min = workMinutes(r);
    const q = harvestQty(r);
    if (min <= 0 || q <= 0) return [];
    return [{ x: toHours(min), y: q, date: r.date, field: r.field, work_type: r.work_type }];
  });

  // ④ 防除〜収穫
  // 同一圃場の防除1件に対して以降の収穫を総当たりで組むため、点数は記録数の積で増える。
  // 統計的な厳密さは無いので、傾向を眺める用途にとどめる。
  const d4Data: { x: number; y: number; date: string; field: string; pesticide: string }[] = [];
  sprayRows.forEach(pr => {
    const prTime = Date.parse(pr.date);
    harvestRows
      .filter(hr => hr.field === pr.field && Date.parse(hr.date) > prTime)
      .forEach(hr => {
        const days = Math.round((Date.parse(hr.date) - prTime) / 86400000);
        const q = harvestQty(hr);
        if (q <= 0 || days <= 0 || days > 365) return;
        const ps = pesticides.find(p => p.id === pr.pesticide_id);
        d4Data.push({ x: days, y: q, date: hr.date, field: hr.field, pesticide: ps?.name ?? "不明" });
      });
  });

  const subStyle = { fontSize:12, fontWeight:600, color:C.textSub, margin:"16px 0 8px" };

  return (
    <div style={{ borderTop:`1px solid ${C.hairline}`, paddingTop:4 }}>
      {/* ① */}
      <div style={subStyle}>圃場×作物別 収穫量推移</div>
      <div style={{ display:"flex", flexWrap:"wrap" as const, marginBottom:8 }}>
        <select style={selectStyle} value={d1Field} onChange={e => setD1Field(e.target.value)}>
          <option value="all">すべての圃場</option>
          {allFields.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select style={selectStyle} value={d1Crop} onChange={e => setD1Crop(e.target.value)}>
          <option value="all">すべての作物</option>
          {allCropIds.map(id => (
            <option key={id} value={String(id)}>{crops.find(c => c.id === id)?.name ?? `作物${id}`}</option>
          ))}
        </select>
      </div>
      {d1Data.length === 0 ? (
        <div style={emptyStyle}><Leaf size={24} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={d1Data} margin={{ top:4, right:8, left:-16, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
            <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} />
            <YAxis tick={{ fontSize:11, fill:C.textMuted }} unit="kg" />
            <Tooltip formatter={(v) => [`${v}kg`, ""]} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            {d1Lines.map((f, i) => (
              <Line key={f} type="monotone" dataKey={f} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r:3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* ② */}
      <div style={subStyle}><Thermometer size={12} strokeWidth={2} style={{ verticalAlign:"middle", marginRight:4 }} />気象条件と収穫量の相関</div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <button
          onClick={() => setD2Axis("temp")}
          style={{ padding:"7px 15px", borderRadius:999, border:"none", background: d2Axis==="temp" ? C.inkSoft : C.well, color: d2Axis==="temp" ? C.ink : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}
        >
          <Thermometer size={12} style={{ verticalAlign:"middle", marginRight:4 }} />気温
        </button>
        <button
          onClick={() => setD2Axis("rain")}
          style={{ padding:"7px 15px", borderRadius:999, border:"none", background: d2Axis==="rain" ? C.inkSoft : C.well, color: d2Axis==="rain" ? C.ink : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}
        >
          <CloudRain size={12} style={{ verticalAlign:"middle", marginRight:4 }} />雨量
        </button>
      </div>
      {d2Data.length === 0 ? (
        <div style={emptyStyle}><CloudRain size={24} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{ top:4, right:8, left:-16, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
            <XAxis dataKey="x" type="number" name={d2Axis === "temp" ? "気温" : "雨量"} unit={d2Axis === "temp" ? "°C" : "mm"} tick={{ fontSize:11, fill:C.textMuted }} />
            <YAxis dataKey="y" type="number" name="収穫量" unit="kg" tick={{ fontSize:11, fill:C.textMuted }} />
            <Tooltip
              cursor={{ strokeDasharray:"3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                    <div style={{ fontWeight:700, color:C.text }}>{d.date}</div>
                    <div style={{ color:C.textSub }}>{d.field} · {d.crop}</div>
                    <div>{d2Axis === "temp" ? "気温" : "雨量"}：{d.x}{d2Axis === "temp" ? "°C" : "mm"}</div>
                    <div>収穫量：{d.y}kg</div>
                  </div>
                );
              }}
            />
            <Scatter data={d2Data} fill={C.ink} opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* ③ */}
      <div style={subStyle}><Clock size={12} strokeWidth={2} style={{ verticalAlign:"middle", marginRight:4 }} />作業時間と収穫量の関係</div>
      <div style={{ marginBottom:12 }}>
        <select style={selectStyle} value={d3WorkType} onChange={e => setD3WorkType(e.target.value)}>
          <option value="all">すべての作業種別</option>
          {d3WorkTypes.map(wt => <option key={wt} value={wt}>{wt}</option>)}
        </select>
      </div>
      {d3Data.length === 0 ? (
        <div style={emptyStyle}><Clock size={24} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{ top:4, right:8, left:-16, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
            <XAxis dataKey="x" type="number" name="作業時間" unit="h" tick={{ fontSize:11, fill:C.textMuted }} />
            <YAxis dataKey="y" type="number" name="収穫量" unit="kg" tick={{ fontSize:11, fill:C.textMuted }} />
            <Tooltip
              cursor={{ strokeDasharray:"3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                    <div style={{ fontWeight:700, color:C.text }}>{d.date}</div>
                    <div style={{ color:C.textSub }}>{d.field} · {d.work_type}</div>
                    <div>作業時間：{d.x}h</div>
                    <div>収穫量：{d.y}kg</div>
                  </div>
                );
              }}
            />
            <Scatter data={d3Data} fill={C.info} opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* ④ */}
      <div style={subStyle}><FlaskConical size={12} strokeWidth={2} style={{ verticalAlign:"middle", marginRight:4 }} />農薬散布から収穫までの日数と収量</div>
      <div style={{ ...noteStyle, marginTop:0, marginBottom:8 }}>
        同じ圃場の防除1件に対し、それ以降の収穫すべてを組み合わせて点にしています。統計的な因果関係を示すものではありません。
      </div>
      {d4Data.length === 0 ? (
        <div style={emptyStyle}><FlaskConical size={24} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{ top:4, right:8, left:-16, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
            <XAxis dataKey="x" type="number" name="防除〜収穫" unit="日" tick={{ fontSize:11, fill:C.textMuted }} />
            <YAxis dataKey="y" type="number" name="収穫量" unit="kg" tick={{ fontSize:11, fill:C.textMuted }} />
            <Tooltip
              cursor={{ strokeDasharray:"3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                    <div style={{ fontWeight:700, color:C.text }}>{d.date}</div>
                    <div style={{ color:C.textSub }}>{d.field}</div>
                    <div>農薬：{d.pesticide}</div>
                    <div>散布〜収穫：{d.x}日</div>
                    <div>収穫量：{d.y}kg</div>
                  </div>
                );
              }}
            />
            <Scatter data={d4Data} fill={C.temp} opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
