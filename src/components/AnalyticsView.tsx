import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, ScatterChart, Scatter, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { BarChart2, Leaf, Thermometer, CloudRain, Clock, FlaskConical, Bug, Sparkles } from "lucide-react";
import { C, SHADOW, RADIUS } from "../ui/tokens";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const CHART_COLORS = [C.ink,"#1976d2","#e07020","#9c27b0","#00838f","#c62828","#558b2f","#4527a0"];

interface HarvestRow {
  date: string;
  field: string;
  quantity: string;
  temp: string;
  rain: string;
  humidity: string;
  crop_id: number;
}

interface PesticideRow {
  date: string;
  field: string;
  pesticide_id: string;
}

interface WorkTimeRow {
  date: string;
  work_type: string;
  work_start: string;
  work_end: string;
  quantity: string;
  field: string;
}

interface PesticideMaster {
  id: string;
  name: string;
}

interface Crop {
  id: number;
  name: string;
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
  currentOrg: string;
  // ai_outputs / daily_weather は organization_id 基準。
  // 既存5クエリはレガシーの org 文字列基準のままで、このコンポーネント内では2系統が混在する
  // （org → organization_id の移行はRLS作業側の責務）。
  organizationId: string | null;
  lat: number | null;
  lng: number | null;
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
  fontSize: 13,
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

function calcWorkHours(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return null;
  return Math.round((diff / 60) * 10) / 10;
}

export default function AnalyticsView({ currentOrg, organizationId, lat, lng }: Props) {
  const [harvestReports, setHarvestReports] = useState<HarvestRow[]>([]);
  const [pesticideReports, setPesticideReports] = useState<PesticideRow[]>([]);
  const [allReports, setAllReports] = useState<WorkTimeRow[]>([]);
  const [pesticides, setPesticides] = useState<PesticideMaster[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);

  // Section 1 filters
  const [s1Field, setS1Field] = useState("all");
  const [s1Crop, setS1Crop] = useState("all");

  // Section 2 axis
  const [s2Axis, setS2Axis] = useState<"temp" | "rain">("temp");

  // Section 3 filter
  const [s3WorkType, setS3WorkType] = useState("all");

  // Section 5〜7（AI出力・気象）
  const [aiOutputs, setAiOutputs] = useState<AiOutputRow[]>([]);
  const [dailyWeather, setDailyWeather] = useState<DailyWeatherRow[]>([]);
  const [s5Field, setS5Field] = useState("all");
  const [s7Kind, setS7Kind] = useState<"all" | AiOutputRow["kind"]>("all");

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const [h, p, a, ps, cr] = await Promise.all([
        supabase.from("reports").select("date,field,quantity,temp,rain,humidity,crop_id").eq("work_type","収穫").eq("org", currentOrg).order("date"),
        supabase.from("reports").select("date,field,pesticide_id").eq("work_type","防除").eq("org", currentOrg).order("date"),
        supabase.from("reports").select("date,work_type,work_start,work_end,quantity,field").not("work_start","is",null).eq("org", currentOrg).order("date"),
        supabase.from("pesticides").select("id,name").eq("org", currentOrg),
        supabase.from("crops").select("id,name").eq("org", currentOrg),
      ]);
      setHarvestReports(h.data ?? []);
      setPesticideReports(p.data ?? []);
      setAllReports(a.data ?? []);
      setPesticides(ps.data ?? []);
      setCrops(cr.data ?? []);
      setLoading(false);
    }
    fetchAll();
  }, [currentOrg]);

  // AI出力と日次気象は organization_id 基準で別途取得する。
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

  // ── Section 1: 圃場×作物別収穫量推移 ──────────────────────────
  const allFields = Array.from(new Set(harvestReports.map(r => r.field).filter(Boolean)));
  const allCropIds = Array.from(new Set(harvestReports.map(r => r.crop_id)));

  const s1Filtered = harvestReports.filter(r => {
    if (s1Field !== "all" && r.field !== s1Field) return false;
    if (s1Crop !== "all" && String(r.crop_id) !== s1Crop) return false;
    return true;
  });

  // group by month → by field
  const s1MonthField: Record<string, Record<string, number>> = {};
  s1Filtered.forEach(r => {
    const month = r.date.slice(0, 7);
    const q = parseFloat(r.quantity);
    if (isNaN(q)) return;
    if (!s1MonthField[month]) s1MonthField[month] = {};
    s1MonthField[month][r.field || "不明"] = (s1MonthField[month][r.field || "不明"] ?? 0) + q;
  });
  const s1Months = Object.keys(s1MonthField).sort();
  const s1Lines = Array.from(new Set(s1Filtered.map(r => r.field || "不明")));
  const s1Data = s1Months.map(m => {
    const row: Record<string, string | number> = { month: m };
    s1Lines.forEach(f => { row[f] = s1MonthField[m]?.[f] ?? 0; });
    return row;
  });

  // ── Section 2: 気象×収穫相関 ──────────────────────────────────
  const s2Data = harvestReports.flatMap(r => {
    const q = parseFloat(r.quantity);
    const x = parseFloat(s2Axis === "temp" ? r.temp : r.rain);
    if (isNaN(q) || isNaN(x)) return [];
    return [{ x, y: q, date: r.date, field: r.field, crop: crops.find(c => c.id === r.crop_id)?.name ?? "" }];
  });

  // ── Section 3: 作業時間×収穫量 ────────────────────────────────
  const s3WorkTypes = Array.from(new Set(allReports.map(r => r.work_type)));
  const s3Data = allReports.flatMap(r => {
    if (s3WorkType !== "all" && r.work_type !== s3WorkType) return [];
    const hours = calcWorkHours(r.work_start, r.work_end);
    const q = parseFloat(r.quantity);
    if (hours === null || isNaN(q) || q <= 0) return [];
    return [{ x: hours, y: q, date: r.date, field: r.field, work_type: r.work_type }];
  });

  // ── Section 4: 防除〜収穫の相関 ─────────────────────────────────
  const s4Data: { x: number; y: number; date: string; field: string; pesticide: string }[] = [];
  pesticideReports.forEach(pr => {
    const prDate = new Date(pr.date);
    harvestReports
      .filter(hr => hr.field === pr.field && new Date(hr.date) > prDate)
      .forEach(hr => {
        const days = Math.round((new Date(hr.date).getTime() - prDate.getTime()) / 86400000);
        const q = parseFloat(hr.quantity);
        if (isNaN(q) || days <= 0 || days > 365) return;
        const ps = pesticides.find(p => p.id === pr.pesticide_id);
        s4Data.push({ x: days, y: q, date: hr.date, field: hr.field, pesticide: ps?.name ?? "不明" });
      });
  });

  // ── Section 5: 病害虫診断の発生傾向 ───────────────────────────
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

  // ── Section 6: 積算温度(GDD)の推移 ────────────────────────────
  // 年初からの累積を月末時点で見る。年ごとに線を引くと「今年は暖かく進んでいる」が読める。
  // 果樹は多年生で作付けの入れ替わりが少ないぶん、年次比較の価値が高い。
  const s6YearMonth: Record<string, Record<string, number>> = {};
  dailyWeather.forEach(w => {
    if (w.gdd == null) return;
    const year = w.date.slice(0, 4);
    const month = w.date.slice(5, 7);
    if (!s6YearMonth[year]) s6YearMonth[year] = {};
    s6YearMonth[year][month] = (s6YearMonth[year][month] ?? 0) + w.gdd;
  });
  const s6Years = Object.keys(s6YearMonth).sort();
  const s6Data = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(month => {
    const row: Record<string, string | number> = { month: `${Number(month)}月` };
    s6Years.forEach(y => {
      // その年の1月からこの月までの累積
      let sum = 0;
      let hasData = false;
      for (let m = 1; m <= Number(month); m++) {
        const v = s6YearMonth[y][String(m).padStart(2, "0")];
        if (v != null) { sum += v; hasData = true; }
      }
      if (hasData) row[y] = Math.round(sum);
    });
    return row;
  });

  // ── Section 7: AI出力の履歴 ───────────────────────────────────
  const s7Rows = aiOutputs.filter(o => s7Kind === "all" || o.kind === s7Kind).slice(0, 50);
  const summarize = (o: AiOutputRow): string => {
    if (o.kind === "diagnosis" && o.output_json) {
      const j = o.output_json;
      if (j.inconclusive) return "判断できず";
      const names = (j.possibilities ?? []).map(p => `${p.name}(${p.confidence})`).join("、");
      return names || j.note || "—";
    }
    if (o.output_text) return o.output_text;
    if (o.output_json) return JSON.stringify(o.output_json);
    return "—";
  };

  if (loading) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:48, color: C.textMuted, fontSize:14 }}>
        データを読み込み中...
      </div>
    );
  }

  return (
    <div style={{ padding:"16px 16px 0" }}>
      {/* ── セクション①：収穫量推移 ── */}
      <div style={secStyle}>
        <BarChart2 size={14} strokeWidth={2} />圃場×作物別 収穫量推移
      </div>
      <div style={cardStyle}>
        <div style={{ display:"flex", flexWrap:"wrap" as const, marginBottom:8 }}>
          <select style={selectStyle} value={s1Field} onChange={e => setS1Field(e.target.value)}>
            <option value="all">すべての圃場</option>
            {allFields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select style={selectStyle} value={s1Crop} onChange={e => setS1Crop(e.target.value)}>
            <option value="all">すべての作物</option>
            {allCropIds.map(id => {
              const c = crops.find(c => c.id === id);
              return <option key={id} value={String(id)}>{c?.name ?? `作物${id}`}</option>;
            })}
          </select>
        </div>
        {s1Data.length === 0 ? (
          <div style={emptyStyle}><Leaf size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={s1Data} margin={{ top:4, right:8, left:-16, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis tick={{ fontSize:11, fill:C.textMuted }} unit="kg" />
              <Tooltip formatter={(v) => [`${v}kg`, ""]} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              {s1Lines.map((f, i) => (
                <Line key={f} type="monotone" dataKey={f} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r:3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── セクション②：気象×収穫相関 ── */}
      <div style={secStyle}>
        <Thermometer size={14} strokeWidth={2} />気象条件と収穫量の相関
      </div>
      <div style={cardStyle}>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button
            onClick={() => setS2Axis("temp")}
            style={{ padding:"7px 15px", borderRadius:999, border:"none", background: s2Axis==="temp" ? C.inkSoft : C.well, color: s2Axis==="temp" ? C.ink : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}
          >
            <Thermometer size={12} style={{ verticalAlign:"middle", marginRight:4 }} />気温
          </button>
          <button
            onClick={() => setS2Axis("rain")}
            style={{ padding:"7px 15px", borderRadius:999, border:"none", background: s2Axis==="rain" ? C.inkSoft : C.well, color: s2Axis==="rain" ? C.ink : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}
          >
            <CloudRain size={12} style={{ verticalAlign:"middle", marginRight:4 }} />雨量
          </button>
        </div>
        {s2Data.length === 0 ? (
          <div style={emptyStyle}><CloudRain size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top:4, right:8, left:-16, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="x" type="number" name={s2Axis === "temp" ? "気温" : "雨量"} unit={s2Axis === "temp" ? "°C" : "mm"} tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis dataKey="y" type="number" name="収穫量" unit="kg" tick={{ fontSize:11, fill:C.textMuted }} />
              <Tooltip
                cursor={{ strokeDasharray:"3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                      <div style={{ fontWeight:700, color:C.text }}>{d.date}</div>
                      <div style={{ color:C.textSub }}>{d.field} · {d.crop}</div>
                      <div>{s2Axis === "temp" ? "気温" : "雨量"}：{d.x}{s2Axis === "temp" ? "°C" : "mm"}</div>
                      <div>収穫量：{d.y}kg</div>
                    </div>
                  );
                }}
              />
              <Scatter data={s2Data} fill={C.primary} opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── セクション③：作業時間×収穫量 ── */}
      <div style={secStyle}>
        <Clock size={14} strokeWidth={2} />作業時間と収穫量の関係
      </div>
      <div style={cardStyle}>
        <div style={{ marginBottom:12 }}>
          <select style={selectStyle} value={s3WorkType} onChange={e => setS3WorkType(e.target.value)}>
            <option value="all">すべての作業種別</option>
            {s3WorkTypes.map(wt => <option key={wt} value={wt}>{wt}</option>)}
          </select>
        </div>
        {s3Data.length === 0 ? (
          <div style={emptyStyle}><Clock size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top:4, right:8, left:-16, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="x" type="number" name="作業時間" unit="h" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis dataKey="y" type="number" name="収穫量" unit="kg" tick={{ fontSize:11, fill:C.textMuted }} />
              <Tooltip
                cursor={{ strokeDasharray:"3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                      <div style={{ fontWeight:700, color:C.text }}>{d.date}</div>
                      <div style={{ color:C.textSub }}>{d.field} · {d.work_type}</div>
                      <div>作業時間：{d.x}h</div>
                      <div>収穫量：{d.y}kg</div>
                    </div>
                  );
                }}
              />
              <Scatter data={s3Data} fill={C.info} opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── セクション④：防除〜収穫の相関 ── */}
      <div style={secStyle}>
        <FlaskConical size={14} strokeWidth={2} />農薬散布から収穫までの日数と収量
      </div>
      <div style={{ ...cardStyle, marginBottom: 32 }}>
        {s4Data.length === 0 ? (
          <div style={emptyStyle}><FlaskConical size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />データがまだありません</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top:4, right:8, left:-16, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="x" type="number" name="防除〜収穫" unit="日" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis dataKey="y" type="number" name="収穫量" unit="kg" tick={{ fontSize:11, fill:C.textMuted }} />
              <Tooltip
                cursor={{ strokeDasharray:"3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                      <div style={{ fontWeight:700, color:C.text }}>{d.date}</div>
                      <div style={{ color:C.textSub }}>{d.field}</div>
                      <div>農薬：{d.pesticide}</div>
                      <div>散布〜収穫：{d.x}日</div>
                      <div>収穫量：{d.y}kg</div>
                    </div>
                  );
                }}
              />
              <Scatter data={s4Data} fill={C.temp} opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── セクション⑤：病害虫診断の発生傾向 ── */}
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
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
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

      {/* ── セクション⑥：積算温度の推移 ── */}
      <div style={secStyle}>
        <Thermometer size={14} strokeWidth={2} />積算温度（GDD）の年次比較
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.6, marginBottom:10 }}>
          日平均気温から基準温度{GDD_BASE_TEMP}℃を引いた有効積算温度の、年初からの累積です。
          年ごとに比べると生育の進み方の早い・遅いが読めます（基準温度は暫定値）。
        </div>
        {s6Years.length === 0 ? (
          <div style={emptyStyle}><Thermometer size={28} strokeWidth={1.5} style={{ display:"block", margin:"0 auto 8px" }} />気象データを取得中です</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={s6Data} margin={{ top:4, right:8, left:-8, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} />
              <YAxis tick={{ fontSize:11, fill:C.textMuted }} unit="℃" />
              <Tooltip formatter={(v, n) => [`${v}℃・日`, `${n}年`]} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              {s6Years.map((y, i) => (
                <Line key={y} type="monotone" dataKey={y} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── セクション⑦：AI出力の履歴 ── */}
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
              <div style={{ fontSize:13, color:C.textSub, lineHeight:1.7, whiteSpace:"pre-wrap" as const }}>
                {summarize(o)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
