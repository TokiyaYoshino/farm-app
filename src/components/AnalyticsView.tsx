import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { BarChart2, Leaf, Thermometer, CloudRain, Clock, FlaskConical } from "lucide-react";
import { C } from "../ui/tokens";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const CHART_COLORS = ["#2d6a2d","#1976d2","#e07020","#9c27b0","#00838f","#c62828","#558b2f","#4527a0"];

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

interface Props {
  currentOrg: string;
}

const cardStyle = {
  background: C.card,
  borderRadius: 14,
  padding: "16px",
  marginBottom: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
  border: `1px solid ${C.border}`,
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
  padding: "8px 12px",
  borderRadius: 8,
  border: `1.5px solid ${C.border}`,
  fontSize: 13,
  background: "#fafcfa",
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

export default function AnalyticsView({ currentOrg }: Props) {
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
            style={{ padding:"6px 14px", borderRadius:8, border:`1.5px solid ${s2Axis==="temp" ? C.primary : C.border}`, background: s2Axis==="temp" ? C.primary3 : "#fff", color: s2Axis==="temp" ? C.primary : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}
          >
            <Thermometer size={12} style={{ verticalAlign:"middle", marginRight:4 }} />気温
          </button>
          <button
            onClick={() => setS2Axis("rain")}
            style={{ padding:"6px 14px", borderRadius:8, border:`1.5px solid ${s2Axis==="rain" ? C.primary : C.border}`, background: s2Axis==="rain" ? C.primary3 : "#fff", color: s2Axis==="rain" ? C.primary : C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}
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
    </div>
  );
}
