import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Home, PenLine, Sprout, Users, Leaf, Thermometer,
  Droplets, CloudRain, Sun, Cloud, CloudSun, CloudDrizzle,
  Snowflake, CloudLightning, MapPin, RefreshCw, AlertCircle,
  PackageCheck, CalendarDays, Clock, Wheat,
  UserCircle, Trash2, PlusCircle, ClipboardList,
  Wind, Camera, X, Navigation, Search, Save,
  Mic, MicOff, Timer,
  LogIn, LogOut, KeyRound, Eye, EyeOff,
  LeafyGreen, Grape, Apple, MoreVertical,
  ChevronLeft, ChevronRight, BarChart2, Plus, FlaskConical, Settings, Copy,
} from "lucide-react";
import { Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line } from "recharts";
import CalendarView from "./components/CalendarView";
import type { Schedule, Comment } from "./components/CalendarView";
import DatePicker from "./components/DatePicker";
import AnalyticsView from "./components/AnalyticsView";
import GanttChart from "./components/GanttChart";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

const makePin = (color: string) => L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="${color}" stroke="white" stroke-width="2.5"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -36],
});
const PIN_BLUE  = makePin("#1565c0");
const PIN_GREEN = makePin("#2d6a2d");

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

// ─── 定数 ───────────────────────────────────────────────
const WORK_TEMPLATES = ["収穫", "施肥", "防除", "播種", "灌水", "草刈り", "剪定", "その他"];

const VOICE_WORK_MAP: Record<string, string> = {
  収穫:"収穫", とれた:"収穫", 採った:"収穫", 刈り取り:"収穫",
  施肥:"施肥", 肥料:"施肥", 追肥:"施肥",
  防除:"防除", 農薬:"防除", 消毒:"防除", 散布:"防除",
  播種:"播種", 種まき:"播種", 種:"播種", まいた:"播種",
  灌水:"灌水", 水やり:"灌水", 散水:"灌水",
  草刈り:"草刈り", 除草:"草刈り", 草取り:"草刈り",
  剪定:"剪定", 枝:"剪定", 切った:"剪定",
};

const WEATHER_OPTIONS = [
  { label: "快晴",     icon: Sun },
  { label: "晴れ",     icon: Sun },
  { label: "一部曇り", icon: CloudSun },
  { label: "曇り",     icon: Cloud },
  { label: "霧雨",     icon: CloudDrizzle },
  { label: "雨",       icon: CloudRain },
  { label: "雪",       icon: Snowflake },
  { label: "雷雨",     icon: CloudLightning },
];

const WMO_MAP: Record<number, string> = {
  0:"快晴",1:"晴れ",2:"一部曇り",3:"曇り",
  45:"霧雨",48:"霧雨",51:"霧雨",53:"霧雨",55:"霧雨",
  61:"雨",63:"雨",65:"雨",71:"雪",73:"雪",75:"雪",
  80:"雨",81:"雨",82:"雷雨",95:"雷雨",99:"雷雨",
};
const wmoToLabel = (code: number): string => WMO_MAP[code] || "曇り";

const calcWorkMinutes = (start: string | null | undefined, end: string | null | undefined): number | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
};

async function fetchWeatherForPeriod(
  lat: number, lng: number, date: string, startTime: string, endTime: string
): Promise<{ temp: string; humidity: string; rain: string; weather: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const baseUrl = date < today
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = `${baseUrl}?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,weathercode` +
    `&start_date=${date}&end_date=${date}&timezone=Asia%2FTokyo`;
  const res = await fetch(url);
  const data = await res.json();
  const hours: string[]  = data.hourly?.time ?? [];
  const temps: number[]  = data.hourly?.temperature_2m ?? [];
  const hums: number[]   = data.hourly?.relative_humidity_2m ?? [];
  const rains: number[]  = data.hourly?.precipitation ?? [];
  const codes: number[]  = data.hourly?.weathercode ?? [];
  const sh = parseInt(startTime.split(":")[0]);
  const eh = parseInt(endTime.split(":")[0]);
  const idx: number[] = [];
  hours.forEach((h, i) => {
    const hr = parseInt(h.substring(11, 13));
    if (hr >= sh && hr <= eh) idx.push(i);
  });
  if (idx.length === 0) return { temp: "", humidity: "", rain: "", weather: "" };
  const avg = (arr: number[]) => (idx.reduce((s, i) => s + arr[i], 0) / idx.length).toFixed(1);
  const totalRain = idx.reduce((s, i) => s + (rains[i] ?? 0), 0).toFixed(1);
  const codeCount: Record<number, number> = {};
  idx.forEach(i => { codeCount[codes[i]] = (codeCount[codes[i]] ?? 0) + 1; });
  const dominant = parseInt(Object.entries(codeCount).sort((a, b) => b[1] - a[1])[0][0]);
  return { temp: avg(temps), humidity: avg(hums), rain: totalRain, weather: wmoToLabel(dominant) };
}

// 作物別アイコン設定
type CropIconDef = { Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; color: string; bg: string; };
const CROP_ICON_MAP: Record<string, CropIconDef> = {
  "ほうれん草": { Icon: LeafyGreen, color: "#2d6a2d", bg: "#e8f5e9" },
  "にんにく":   { Icon: Sprout,     color: "#8d6e2e", bg: "#fff8e1" },
  "たまねぎ":   { Icon: Apple,      color: "#c0392b", bg: "#fdecea" },
  "ぶどう":     { Icon: Grape,      color: "#7b1fa2", bg: "#f3e5f5" },
};
const getCropIcon = (name: string): CropIconDef =>
  CROP_ICON_MAP[name] ?? { Icon: Leaf, color: "#2d6a2d", bg: "#e8f5e9" };



// ─── 型 ─────────────────────────────────────────────────
type Role = "admin" | "worker" | "viewer";
interface User   { id: number; name: string; role: Role; login_id?: string; auth_id?: string; email?: string; org?: string; }
interface Crop   { id: number; name: string; start_date: string; last_work_date?: string; target_yield?: number; }
interface Field  { id: number; name: string; lat: number | null; lng: number | null; }
interface AppSettings { id: number; location_name: string; lat: number; lng: number; }
interface Session { id: number; user_id: number; field_id: number | null; started_at: string; voice_memo: string; }
interface PesticideMaster {
  id: string; reg_no: string; name: string; type: string | null;
  company: string | null; dilution_rate: string | null;
  target_crop: string | null; target_pest: string | null; is_active: boolean;
}
interface Pesticide {
  id: string; org: string; name: string; type: string;
  dilution_rate: string; notes: string; created_at: string;
  master_id?: string;
}
interface WorkCategory { id: number; name: string; unit: string | null; }
interface Report {
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
interface WeatherInfo {
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  temp: number | string;
  humidity?: number;
  rain?: number;
}
interface Project {
  id: string;
  org?: string;
  name: string;
  crop_id?: number;
  field?: string;
  start_date?: string;
  end_date?: string;
  status: "active" | "completed" | "archived";
  created_by?: number;
  created_at: string;
  color?: string;
}
interface Ticket {
  id: string;
  project_id: string;
  org?: string;
  title: string;
  work_type?: string;
  assigned_user_id?: number;
  due_date?: string;
  status: "open" | "done";
  report_id?: number;
  note?: string;
  created_at: string;
}

// ─── カラーパレット ──────────────────────────────────────
const C = {
  primary:   "#2d6a2d",
  primary2:  "#3a8a3a",
  primary3:  "#e8f5e9",
  primary4:  "#c8e6c9",
  accent:    "#f9a825",
  danger:    "#c0392b",
  dangerBg:  "#fdecea",
  text:      "#1a2e1a",
  textSub:   "#4a6a4a",
  textMuted: "#8aaa8a",
  bg:        "#f3f4f6",
  card:      "#ffffff",
  border:    "#dde8dd",
  navBg:     "#ffffff",
};

const roleLabel: Record<Role, string> = { admin:"管理者", worker:"作業者", viewer:"閲覧者" };
const roleColor: Record<Role, string> = { admin:C.danger, worker:C.primary, viewer:"#1976d2" };

// ─── グローバルスタイル注入 ───────────────────────────────
const globalStyle = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; font-family: -apple-system, 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  input, select, button { font-family: inherit; }
  input:focus, select:focus { outline: 2px solid ${C.primary}; outline-offset: -1px; }
  input[type="date"] { -webkit-appearance: none; appearance: none; min-width: 0; width: 100%; font-size: 13px; padding: 8px 10px; }
  @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
  @keyframes slideUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  .anim-slideDown { animation: slideDown 0.2s ease; }
  .anim-fadeIn    { animation: fadeIn 0.2s ease; }
  .anim-slideUp   { animation: slideUp 0.2s ease; }
`;

// ─── ユーティリティ ──────────────────────────────────────
const css = (o: CSSProperties): CSSProperties => o;

export default function App() {
  // ─── Auth state ──────────────────────────────────────────
  const [authSession, setAuthSession]     = useState<any>(null);
  const [authLoading, setAuthLoading]     = useState(true);
  const [loginId, setLoginId]             = useState("");
  const [loginPass, setLoginPass]         = useState("");
  const [showPass, setShowPass]           = useState(false);
  const [loginError, setLoginError]       = useState("");
  const [loginBusy, setLoginBusy]         = useState(false);

  // ─── App state ───────────────────────────────────────────
  const [tab, setTab]                     = useState("home");
  const [currentOrg, setCurrentOrg]       = useState("kishu");
  const [users, setUsers]                 = useState<User[]>([]);
  const [crops, setCrops]                 = useState<Crop[]>([]);
  const [fields, setFields]               = useState<Field[]>([]);
  const [reports, setReports]             = useState<Report[]>([]);
  const [schedules, setSchedules]          = useState<Schedule[]>([]);
  const [pesticides, setPesticides]       = useState<Pesticide[]>([]);
  const [projects, setProjects]           = useState<Project[]>([]);
  const [tickets, setTickets]             = useState<Ticket[]>([]);
  const [pForm, setPForm]                 = useState({ name:"", type:"殺虫剤", dilution_rate:"", notes:"" });
  const [pManualMode, setPManualMode]     = useState(false);
  const [prjForm, setPrjForm]             = useState({ name:"", crop_id:0, field:"", start_date:"", end_date:"" });
  const [tForm, setTForm]                 = useState({ title:"", work_type:"収穫", assigned_user_id:0, due_date:"" });
  const [addingTicketProjectId, setAddingTicketProjectId] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [masterSearch, setMasterSearch]   = useState("");
  const [masterResults, setMasterResults] = useState<PesticideMaster[]>([]);
  const [masterSearching, setMasterSearching] = useState(false);
  const [selectedMaster, setSelectedMaster]   = useState<PesticideMaster | null>(null);
  const masterTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentUser, setCurrentUser]     = useState<User | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; type: "ok"|"err" } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [wxLoading, setWxLoading]         = useState(true);
  const [wxAuto, setWxAuto]               = useState<WeatherInfo | null>(null);
  const [wxManual, setWxManual]           = useState<WeatherInfo>({ label:"晴れ", Icon:Sun, temp:"" });
  const [workCategories, setWorkCategories] = useState<WorkCategory[]>([]);
  const [rForm, setRForm]                 = useState({ user_id:0, crop_id:0, field:"", date:new Date().toISOString().slice(0,10), work_type:"収穫", work_category_id:0, quantity:"", quantity_value:"", quantity_unit:"", work_time:"", work_start:"", work_end:"", note:"", pesticide_id:"", pesticide_amount:"" });
  const [periodWeather, setPeriodWeather] = useState<{ temp:string; humidity:string; rain:string; weather:string } | null>(null);
  const [cForm, setCForm]                 = useState({ name:"", start_date:new Date().toISOString().slice(0,10), target_yield:"" });
  const [fForm, setFForm]                 = useState({ name:"" });
  const [cropListTab, setCropListTab]     = useState<"crops"|"fields">("crops");
  const [expandedCrops, setExpandedCrops] = useState<Set<number>>(new Set());
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState("");
  const [imgUploading, setImgUploading]   = useState(false);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [locInput, setLocInput]           = useState("");
  const [locSearching, setLocSearching]   = useState(false);
  const [locPreview, setLocPreview]       = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [locSaving, setLocSaving]         = useState(false);
  const [invForm, setInvForm]             = useState({ name:"", role:"worker" as Role, password:"", login_id:"" });
  const [setAuthTarget, setSetAuthTarget] = useState<User | null>(null);
  const [setAuthForm, setSetAuthFormState]= useState({ login_id:"", password:"", confirmPass:"" });
  const [setAuthBusy, setSetAuthBusy]     = useState(false);   // 作成後の仮パスワード表示用
  // GPS・マップ
  const [userPos, setUserPos]             = useState<[number, number] | null>(null);
  // 作業セッション
  const [workSession, setWorkSession]     = useState<Session | null>(null);
  const [workElapsed, setWorkElapsed]     = useState(0);
  // 音声入力
  const [isListening, setIsListening]     = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef                    = useRef<any>(null);
  const [noteListening, setNoteListening] = useState(false);
  const noteRecRef                        = useRef<any>(null);
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [quickExpanded, setQuickExpanded]     = useState(false);
  const [manageSubTab, setManageSubTab]       = useState<"crops"|"fields"|"pesticides">("crops");
  const [showCropAddForm, setShowCropAddForm] = useState(false);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"report"|"backlog">("report");
  const [showMapModal, setShowMapModal]       = useState(false);
  const [inlineOpen, setInlineOpen]           = useState(false);
  const [inlineMode, setInlineMode]           = useState<null | "schedule" | "report">(null);
  const [inlineSchedForm, setInlineSchedForm] = useState({ date: new Date().toISOString().slice(0,10), work_type:"収穫", assigned_user_id:0, crop:"", field:"", note:"" });
  const cropExpandedInit                       = useRef(false);
  const [deleteModal, setDeleteModal]     = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<number | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<{ cropId: number; field: "start_date" | "last_work_date"; value: string } | null>(null);
  const [openMenuId, setOpenMenuId]       = useState<string | null>(null);
  const [progressWeekStart, setProgressWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 月曜始まり
    return d;
  });
  const [copySource, setCopySource]       = useState<Report | null>(null);
  const [chartYear, setChartYear]         = useState(() => new Date().getFullYear());
  const [editingTargetYield, setEditingTargetYield] = useState(false);
  const [targetYieldInput, setTargetYieldInput]     = useState("");
  const [selectedPesticides, setSelectedPesticides] = useState<string[]>([]);
  const [pesticideAmounts, setPesticideAmounts]     = useState<Record<string, string>>({});
  const [soilPh, setSoilPh]                         = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  // ─── Auth セッション監視 ──────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = globalStyle;
    document.head.appendChild(styleEl);
    return () => { document.head.removeChild(styleEl); };
  }, []);

  useEffect(() => {
    if (!authSession) return;
    (async () => {
      try {
      setLoading(true);
      // 全ユーザー取得してauth_idで現在ユーザーを特定
      const { data: allUsers } = await supabase.from("users").select("*").order("id");
      const userList = (allUsers ?? []) as User[];
      const me = userList.find(x => x.auth_id === authSession.user.id) ?? null;
      const org = me?.org ?? "kishu";
      setCurrentOrg(org);
      if (me) { setCurrentUser(me); setRForm(f => ({ ...f, user_id: me.id })); }

      // org でフィルタしてデータ取得
      const orgUserIds = userList.filter(x => x.org === org).map(u => u.id);
      const [{ data: c, error: cErr }, { data: fd, error: fdErr }, { data: r, error: rErr }, { data: s }, { data: sch }, { data: ps }, { data: prj }, { data: tkt }, { data: wc }] = await Promise.all([
        supabase.from("crops").select("*").eq("org", org).order("id"),
        supabase.from("fields").select("*").eq("org", org).order("id"),
        supabase.from("reports").select("*").eq("org", org).order("date", { ascending: false }),
        supabase.from("settings").select("*").eq("org", org).maybeSingle(),
        orgUserIds.length > 0
          ? supabase.from("schedules").select("*").in("user_id", orgUserIds).order("date")
          : Promise.resolve({ data: null as any, error: null }),
        supabase.from("pesticides").select("*").eq("org", org).order("name"),
        supabase.from("projects").select("*").eq("org", org).order("created_at", { ascending: false }),
        supabase.from("tickets").select("*").eq("org", org),
        supabase.from("work_categories").select("*").order("id"),
      ]);
      if (cErr)  console.error("crops fetch error:",   cErr);
      if (fdErr) console.error("fields fetch error:",  fdErr);
      if (rErr)  console.error("reports fetch error:", rErr);
      const loc = s
        ? { lat:(s as AppSettings).lat, lng:(s as AppSettings).lng, name:(s as AppSettings).location_name }
        : { lat:35.0167, lng:135.5833, name:"京都府亀岡市" };
      setWeatherCoords(loc);
      setLocInput(loc.name);
      setUsers(userList.filter(x => x.org === org));
      if (c)  { setCrops(c as Crop[]); setRForm(f => ({ ...f, crop_id: (c[0] as Crop)?.id || 0 })); }
      if (fd) { setFields(fd as Field[]); setRForm(f => ({ ...f, field: (fd[0] as Field)?.name || "" })); }
      if (r)  setReports(r as Report[]);
      if (sch) setSchedules(sch as Schedule[]);
      if (ps) setPesticides(ps as Pesticide[]);
      if (prj) setProjects(prj as Project[]);
      if (tkt) setTickets(tkt as Ticket[]);
      if (wc) setWorkCategories(wc as WorkCategory[]);
      setLoading(false);
      } catch (e) {
        console.error("Startup error:", e);
        setLoading(false);
      }
    })();
  }, [authSession]);

  // GPS取得・天気もGPS位置で更新
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setWeatherCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: "現在地" });
      },
      () => {},
      { enableHighAccuracy: true }
    );
  }, []);

  // 作業タイマー
  useEffect(() => {
    if (!workSession) return;
    setWorkElapsed(0);
    const iv = setInterval(() => setWorkElapsed(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [workSession]);

  useEffect(() => {
    if (!weatherCoords) return;
    let cancelled = false;
    const { lat, lng } = weatherCoords;
    const tryFetch = async (attempt: number) => {
      try {
        const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&hourly=relative_humidity_2m,rain&timezone=Asia%2FTokyo&forecast_days=1`);
        const data = await res.json();
        const cur  = data.current;
        const lbl  = WMO_MAP[cur.weather_code as number] || "曇り";
        const opt  = WEATHER_OPTIONS.find(o => o.label === lbl) || WEATHER_OPTIONS[3];
        // 当日6〜18時の平均湿度・合計雨量
        const times: string[] = data.hourly?.time ?? [];
        const humList  = data.hourly?.relative_humidity_2m as number[] ?? [];
        const rainList = data.hourly?.rain as number[] ?? [];
        const today = cur.time.substring(0, 10);
        const dayIdx = times.reduce<number[]>((acc, t, i) => {
          const h = parseInt(t.substring(11, 13));
          if (t.startsWith(today) && h >= 6 && h <= 18) acc.push(i);
          return acc;
        }, []);
        const humidity = dayIdx.length > 0
          ? Math.round(dayIdx.reduce((s, i) => s + humList[i], 0) / dayIdx.length)
          : undefined;
        const rainVal = dayIdx.reduce((s, i) => s + (rainList[i] ?? 0), 0);
        if (!cancelled) setWxAuto({
          label: opt.label, Icon: opt.icon, temp: Math.round(cur.temperature_2m),
          humidity,
          rain: rainVal > 0 ? Math.round(rainVal * 10) / 10 : undefined,
        });
      } catch {
        if (attempt < 2) { setTimeout(() => { if (!cancelled) tryFetch(attempt + 1); }, 1500); return; }
        if (!cancelled) setWxAuto(null);
      }
      if (!cancelled) setWxLoading(false);
    };
    tryFetch(0);
    return () => { cancelled = true; };
  }, [weatherCoords]);



  // 作物リスト初回ロード時に最終作業日が最新の作物をデフォルト展開
  useEffect(() => {
    if (cropExpandedInit.current || crops.length === 0) return;
    cropExpandedInit.current = true;
    const best = [...crops].sort((a, b) =>
      (b.last_work_date || "").localeCompare(a.last_work_date || "")
    )[0];
    setExpandedCrops(new Set([best.id]));
  }, [crops]);

  // 作物詳細を開くたびに年・編集状態をリセット
  useEffect(() => {
    setChartYear(new Date().getFullYear());
    setEditingTargetYield(false);
    setTargetYieldInput("");
  }, [selectedCropId]);

  // 開始・終了時刻が揃ったら選択圃場（なければ設定座標）の気象を自動取得
  useEffect(() => {
    if (!rForm.work_start || !rForm.work_end || !rForm.date) { setPeriodWeather(null); return; }
    const selectedField = fields.find(f => f.name === rForm.field);
    const lat = selectedField?.lat ?? weatherCoords?.lat;
    const lng = selectedField?.lng ?? weatherCoords?.lng;
    if (!lat || !lng) return;
    fetchWeatherForPeriod(lat, lng, rForm.date, rForm.work_start, rForm.work_end)
      .then(result => setPeriodWeather(result))
      .catch(() => setPeriodWeather(null));
  }, [rForm.work_start, rForm.work_end, rForm.date, rForm.field]);

  const showToast = (msg: string, type: "ok"|"err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === "err" ? 5000 : 2500);
  };

  // ─── ログイン ────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginId.trim() || !loginPass.trim()) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const { data: ud, error: ue } = await supabase
        .from("users").select("email").eq("login_id", loginId.trim()).maybeSingle();
      if (ue || !ud?.email) { setLoginError("ユーザーIDが見つかりません"); return; }
      const { error: ae } = await supabase.auth.signInWithPassword({ email: ud.email, password: loginPass });
      if (ae) { setLoginError("パスワードが正しくありません"); return; }
    } catch { setLoginError("ログインに失敗しました"); }
    finally   { setLoginBusy(false); }
  };

  // ─── ユーザー招待（管理者のみ） ───────────────────────────
  const inviteUser = async () => {
    const { name, role, login_id, password } = invForm;
    if (!name.trim() || !login_id.trim() || !password.trim()) {
      showToast("名前・ユーザーID・パスワードを入力してください", "err"); return;
    }
    if (password.length < 6) { showToast("パスワードは6文字以上にしてください", "err"); return; }
    setSubmitting(true);
    try {
      const r = await fetch("/api/set-user-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, login_id, password, org: currentOrg }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "作成に失敗しました", "err"); return; }
      const { data: fresh } = await supabase.from("users").select("*").order("id");
      if (fresh) setUsers(fresh as User[]);
      setInvForm({ name:"", role:"worker", password:"", login_id:"" });
      showToast(`${name} のアカウントを作成しました`);
    } catch (e: unknown) { showToast((e as Error).message, "err"); }
    finally { setSubmitting(false); }
  };

  // ─── 他ユーザーのログイン設定（管理者のみ）──────────────────
  const saveUserAuth = async () => {
    if (!setAuthTarget) return;
    const { login_id, password, confirmPass } = setAuthForm;
    if (!login_id.trim() || !password.trim()) { showToast("IDとパスワードを入力してください", "err"); return; }
    if (password !== confirmPass) { showToast("パスワードが一致しません", "err"); return; }
    if (password.length < 6) { showToast("パスワードは6文字以上にしてください", "err"); return; }
    setSetAuthBusy(true);
    try {
      const r = await fetch("/api/set-user-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: setAuthTarget.id, login_id: login_id.trim(), password }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "設定に失敗しました", "err"); return; }
      setUsers(p => p.map(u => u.id === setAuthTarget.id ? { ...u, login_id: login_id.trim(), auth_id: d.auth_id } : u));
      setSetAuthTarget(null);
      setSetAuthFormState({ login_id:"", password:"", confirmPass:"" });
      showToast(`${setAuthTarget.name} のログイン情報を設定しました`);
    } finally { setSetAuthBusy(false); }
  };



  // ─── ログアウト ──────────────────────────────────────────
  const handleLogout = async () => {
    if (!window.confirm("ログアウトしますか？")) return;
    await supabase.auth.signOut();
    setAuthSession(null);
    setUsers([]); setCrops([]); setFields([]); setReports([]);
    setCurrentUser(null);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext  = file.name.split(".").pop() || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("report-images").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("report-images").getPublicUrl(path).data.publicUrl;
  };

  const addReport = async () => {
    if (!rForm.date || !rForm.work_type || !currentUser) return;
    setImgUploading(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const pw = periodWeather;
      const w = pw ? null : (wxAuto || (wxManual.temp ? wxManual : null));
      const { data, error } = await supabase.from("reports").insert([{
        ...rForm, image_url: imageUrl, org: currentOrg,
        weather:      pw?.weather  ?? w?.label    ?? "",
        weather_icon: "",
        temp:         pw?.temp     ?? (w?.temp     ? String(w.temp)     : ""),
        humidity:     pw?.humidity ?? (w?.humidity !== undefined ? String(w.humidity) : ""),
        rain:         pw?.rain     ?? (w?.rain     !== undefined ? String(w.rain)     : ""),
        pesticide_id:     rForm.pesticide_id     || null,
        pesticide_amount: rForm.pesticide_amount || null,
        pesticides_used: selectedPesticides.length > 0
          ? selectedPesticides.map(id => ({ id, amount: pesticideAmounts[id] || null }))
          : null,
        soil_ph: soilPh ? parseFloat(soilPh) : null,
        work_start: rForm.work_start || null,
        work_end:   rForm.work_end   || null,
        work_category_id: rForm.work_category_id || null,
        quantity_value:   rForm.quantity_value ? parseFloat(rForm.quantity_value) : null,
        quantity_unit:    rForm.quantity_unit || null,
        quantity:         rForm.quantity_value || rForm.quantity,
        work_minutes:     calcWorkMinutes(rForm.work_start, rForm.work_end),
      }]).select();
      if (error) { showToast(error.message || "登録に失敗しました", "err"); return; }
      const newReport = data?.[0] as Report | undefined;
      if (newReport) { setReports(p => [newReport, ...p]); await autoMatchTicket(newReport); }
      setImageFile(null);
      setImagePreview("");
      setSelectedPesticides([]);
      setPesticideAmounts({});
      setSoilPh("");
      setPeriodWeather(null);
      showToast("作業報告を登録しました");
      setTab("home");

      // LINE グループに通知（失敗しても報告登録には影響させない）
      const r = data?.[0] as Report | undefined;
      if (r) {
        const workTimeLabel = r.work_start && r.work_end
          ? `${r.work_start} 〜 ${r.work_end}`
          : r.work_time ? `${r.work_time}h` : null;
        const pesticideLines: string[] = [];
        if (r.work_type === "防除") {
          const usedList = r.pesticides_used && r.pesticides_used.length > 0
            ? r.pesticides_used
            : r.pesticide_id ? [{ id: r.pesticide_id, amount: r.pesticide_amount ?? null }] : [];
          usedList.forEach(pu => {
            const ps = pesticides.find(p => p.id === pu.id);
            if (ps) {
              pesticideLines.push(`農薬: ${ps.name}`);
              if (pu.amount) pesticideLines.push(`散布量: ${pu.amount}`);
            }
          });
        }
        const lines = [
          `【作業報告】`,
          `作業者: ${currentUser?.name}`,
          `作物: ${cropName(r.crop_id)}`,
          `圃場: ${r.field || "未設定"}`,
          `作業: ${r.work_type}`,
          ...pesticideLines,
          ...(r.quantity     ? [`収穫量: ${r.quantity}kg`] : []),
          ...(workTimeLabel  ? [`作業時間: ${workTimeLabel}`] : []),
          `日付: ${r.date}`,
          ...(r.weather ? [`天気: ${r.weather}${r.temp ? ` / ${r.temp}°C` : ""}${r.humidity ? ` / 湿度${r.humidity}%` : ""}${r.rain ? ` / 雨量${r.rain}mm` : ""}`] : []),
          ...(r.note ? [`メモ: ${r.note}`] : []),
        ];
        fetch("/api/notify-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: lines.join("\n") }),
        }).catch(e => console.error("LINE notify error:", e));
      }
    } catch (e: unknown) {
      showToast((e as Error).message || "登録に失敗しました", "err");
    } finally {
      setImgUploading(false);
    }
  };

  const fmtElapsed = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const stopWork = async () => {
    if (!workSession) return;
    const mins = Math.round(workElapsed / 60);
    const ended = new Date().toISOString();
    await supabase.from("sessions").update({ ended_at: ended, duration_minutes: mins, voice_memo: voiceTranscript }).eq("id", workSession.id);
    // recognitionRef を先に null にしてから stop（onend の再起動を防ぐ）
    const r = recognitionRef.current;
    recognitionRef.current = null;
    setIsListening(false);
    try { r?.stop(); } catch { /* ignore */ }
    setWorkSession(null);
    setRForm(f => ({ ...f, work_time: mins > 0 ? String(mins) : "", note: voiceTranscript ? (f.note ? f.note + "\n" + voiceTranscript : voiceTranscript) : f.note }));
    showToast(`作業終了 ${fmtElapsed(workElapsed)} → 報告フォームに反映しました`);
    setTab("report");
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return showToast("このブラウザは音声入力非対応です（Chrome推奨）", "err");

    // 停止
    if (isListening) {
      const r = recognitionRef.current;
      recognitionRef.current = null;
      setIsListening(false);
      try { r?.stop(); } catch { /* ignore */ }
      return;
    }

    // 開始
    const rec = new SR();
    rec.lang           = "ja-JP";
    rec.continuous     = true;
    rec.interimResults = true;
    recognitionRef.current = rec;   // start() より先にセット

    rec.onstart = () => { setIsListening(true); };

    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (!finalText) return;
      setVoiceTranscript(p => (p ? p + "　" + finalText : finalText));
      for (const [kw, wt] of Object.entries(VOICE_WORK_MAP)) {
        if (finalText.includes(kw)) { setRForm(f => ({ ...f, work_type: wt })); break; }
      }
    };

    rec.onerror = (e: any) => {
      // no-speech（無音）と aborted（手動停止）は正常動作なので無視
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.error("SpeechRecognition error:", e.error);
      const msg = e.error === "not-allowed"   ? "マイクの使用が許可されていません"
                : e.error === "audio-capture" ? "マイクが見つかりません"
                : e.error === "network"       ? "音声認識にはネットワークが必要です"
                : `音声入力エラー: ${e.error}`;
      showToast(msg, "err");
      recognitionRef.current = null;
      setIsListening(false);
    };

    rec.onend = () => {
      // recognitionRef が null（手動停止 or 致命的エラー）なら再起動しない
      if (recognitionRef.current !== rec) return;
      setTimeout(() => {
        if (recognitionRef.current !== rec) return;
        try { rec.start(); }
        catch { recognitionRef.current = null; setIsListening(false); }
      }, 300);
    };

    try {
      rec.start();
    } catch (e) {
      console.error("rec.start() failed:", e);
      showToast("音声入力を開始できませんでした", "err");
      recognitionRef.current = null;
    }
  };

  const toggleNoteVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (noteListening) {
      const r = noteRecRef.current;
      noteRecRef.current = null;
      setNoteListening(false);
      try { r?.stop(); } catch { /* ignore */ }
      return;
    }
    const rec = new SR();
    rec.lang           = "ja-JP";
    rec.continuous     = false;
    rec.interimResults = false;
    noteRecRef.current = rec;
    rec.onstart  = () => setNoteListening(true);
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join("");
      if (text) setRForm(f => ({ ...f, note: f.note ? f.note + "　" + text : text }));
    };
    rec.onerror  = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      noteRecRef.current = null;
      setNoteListening(false);
    };
    rec.onend    = () => { noteRecRef.current = null; setNoteListening(false); };
    try { rec.start(); } catch { noteRecRef.current = null; }
  };

  const hasSpeech = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const setFieldLocation = async (fieldId: number) => {
    if (!userPos) return showToast("GPS位置を取得中です", "err");
    const { error } = await supabase.from("fields").update({ lat: userPos[0], lng: userPos[1] }).eq("id", fieldId);
    if (error) return showToast(error.message, "err");
    setFields(p => p.map(f => f.id === fieldId ? { ...f, lat: userPos[0], lng: userPos[1] } : f));
    showToast("圃場の位置を現在地に設定しました");
  };


  const confirmDelete = (message: string, onConfirm: () => void) =>
    setDeleteModal({ message, onConfirm });

  const deleteReport = (id: number) =>
    confirmDelete("この作業報告を削除しますか？", async () => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) return showToast(error.message, "err");
      setReports(p => p.filter(r => r.id !== id));
      showToast("報告を削除しました");
    });

  const deleteUser = (id: number) =>
    confirmDelete("このユーザーを削除しますか？", async () => {
      const { error } = await supabase.from("users").delete().eq("id", id);
      if (error) { console.error("deleteUser error:", error); return showToast(error.message, "err"); }
      setUsers(p => p.filter(u => u.id !== id));
      showToast("ユーザーを削除しました");
    });

  const searchLocation = async () => {
    if (!locInput.trim()) return;
    setLocSearching(true);
    setLocPreview(null);
    try {
      // 国土地理院 住所検索API（日本全国対応）
      const res  = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(locInput)}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return showToast("場所が見つかりませんでした", "err");
      }
      const r   = data[0];
      const lng = r.geometry.coordinates[0] as number;
      const lat = r.geometry.coordinates[1] as number;
      const name = r.properties.title as string;
      setLocPreview({ name, lat, lng });
    } catch { showToast("検索に失敗しました", "err"); }
    finally { setLocSearching(false); }
  };

  const saveLocation = async () => {
    if (!locPreview) return;
    setLocSaving(true);
    const { error } = await supabase.from("settings").upsert({ org: currentOrg, location_name:locPreview.name, lat:locPreview.lat, lng:locPreview.lng }, { onConflict: "org" });
    setLocSaving(false);
    if (error) return showToast(error.message, "err");
    setWeatherCoords(locPreview);
    setWxLoading(true);
    setWxAuto(null);
    showToast("農場の場所を保存しました");
  };

  const addCrop = async () => {
    if (!cForm.name.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from("crops").insert([{
      name: cForm.name.trim(),
      start_date: cForm.start_date,
      target_yield: cForm.target_yield ? Number(cForm.target_yield) : null,
      org: currentOrg,
    }]).select();
    setSubmitting(false);
    if (error) { console.error("addCrop error:", error); return showToast(error.message, "err"); }
    if (data) setCrops(p => [...p, data[0] as Crop]);
    setCForm({ name:"", start_date:new Date().toISOString().slice(0,10), target_yield:"" });
    showToast("作物を追加しました");
  };

  const deleteCrop = (id: number) =>
    confirmDelete("この作物を削除しますか？", async () => {
    const { error } = await supabase.from("crops").delete().eq("id", id);
    if (error) { console.error("deleteCrop error:", error); return showToast(error.message, "err"); }
    setCrops(p => p.filter(c => c.id !== id));
    showToast("作物を削除しました");
  });

  const updateTargetYield = async (cropId: number, value: string) => {
    const num = value.trim() ? Number(value) : null;
    const { error } = await supabase.from("crops").update({ target_yield: num }).eq("id", cropId);
    if (error) return showToast(error.message, "err");
    setCrops(prev => prev.map(c => c.id === cropId ? { ...c, target_yield: num ?? undefined } : c));
    setEditingTargetYield(false);
    showToast("目標収穫量を更新しました");
  };

  const handleCopyReport = (report: Report) => {
    setCopySource(report);
    setRForm({
      user_id:          report.user_id,
      crop_id:          report.crop_id,
      field:            report.field,
      date:             new Date().toISOString().slice(0, 10),
      work_type:        report.work_type,
      work_category_id: report.work_category_id ?? 0,
      quantity:         "",
      quantity_value:   "",
      quantity_unit:    report.quantity_unit ?? "",
      work_time:        report.work_time,
      work_start:       report.work_start ?? "",
      work_end:         report.work_end   ?? "",
      note:             report.note,
      pesticide_id:     "",
      pesticide_amount: "",
    });
    if (report.pesticides_used && report.pesticides_used.length > 0) {
      setSelectedPesticides(report.pesticides_used.map(p => p.id));
      const amounts: Record<string, string> = {};
      report.pesticides_used.forEach(p => { if (p.amount) amounts[p.id] = p.amount; });
      setPesticideAmounts(amounts);
    } else {
      setSelectedPesticides([]);
      setPesticideAmounts({});
    }
    setSoilPh(report.soil_ph ? String(report.soil_ph) : "");
    setTab("report");
    setInlineOpen(true);
    setInlineMode("report");
  };

  const addField = async () => {
    if (!fForm.name.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from("fields").insert([{ ...fForm, org: currentOrg }]).select();
    setSubmitting(false);
    if (error) { console.error("addField error:", error); return showToast(error.message, "err"); }
    if (data) setFields(p => [...p, data[0] as Field]);
    setFForm({ name:"" });
    showToast("圃場を追加しました");
  };

  const deleteField = (id: number) =>
    confirmDelete("この圃場を削除しますか？", async () => {
      const { error } = await supabase.from("fields").delete().eq("id", id);
      if (error) { console.error("deleteField error:", error); return showToast(error.message, "err"); }
      setFields(p => p.filter(f => f.id !== id));
      showToast("圃場を削除しました");
    });

  const searchPesticideMaster = async (q: string) => {
    if (!q.trim()) { setMasterResults([]); setMasterSearching(false); return; }
    setMasterSearching(true);
    const { data } = await supabase.from("pesticides_master")
      .select("*").eq("is_active", true).ilike("name", `%${q}%`).limit(10);
    setMasterResults((data ?? []) as PesticideMaster[]);
    setMasterSearching(false);
  };

  const handleMasterSearchChange = (q: string) => {
    setMasterSearch(q);
    setSelectedMaster(null);
    if (masterTimerRef.current) clearTimeout(masterTimerRef.current);
    masterTimerRef.current = setTimeout(() => searchPesticideMaster(q), 300);
  };

  const selectMaster = (m: PesticideMaster) => {
    setSelectedMaster(m);
    setPForm(f => ({ ...f, name: m.name, type: m.type || "その他", dilution_rate: m.dilution_rate || "" }));
    setMasterSearch(m.name);
    setMasterResults([]);
  };

  const resetPesticideForm = () => {
    setPForm({ name:"", type:"殺虫剤", dilution_rate:"", notes:"" });
    setMasterSearch("");
    setMasterResults([]);
    setSelectedMaster(null);
  };

  const addPesticide = async () => {
    if (!pForm.name.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from("pesticides").insert([{
      ...pForm, org: currentOrg,
      master_id: selectedMaster?.id || null,
    }]).select();
    setSubmitting(false);
    if (error) { console.error("addPesticide error:", error); return showToast(error.message, "err"); }
    if (data) setPesticides(p => [...p, data[0] as Pesticide].sort((a, b) => a.name.localeCompare(b.name)));
    resetPesticideForm();
    showToast("農薬を追加しました");
  };

  const deletePesticide = (id: string) =>
    confirmDelete("この農薬を削除しますか？", async () => {
      const { error } = await supabase.from("pesticides").delete().eq("id", id);
      if (error) { console.error("deletePesticide error:", error); return showToast(error.message, "err"); }
      setPesticides(p => p.filter(x => x.id !== id));
      showToast("農薬を削除しました");
    });

  const addSchedule = async (date: string, title: string, note: string, crop: string, assignedUserId: number | null, workType: string, field?: string): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const { data, error } = await supabase.from("schedules").insert([{
        user_id: currentUser.id,
        title,
        date,
        note: note || null,
        crop: crop || null,
        field: field || null,
        assigned_user_id: assignedUserId || null,
        work_type: workType || null,
      }]).select().single();
      if (error) throw error;
      setSchedules(p => [...p, data as Schedule]);
      return true;
    } catch (e) {
      console.error("addSchedule error:", e);
      return false;
    }
  };

  const loadComments = async (targetType: string, targetId: string): Promise<Comment[]> => {
    const { data } = await supabase.from("comments")
      .select("*").eq("target_type", targetType).eq("target_id", targetId).order("created_at");
    return (data ?? []) as Comment[];
  };

  const addComment = async (targetType: string, targetId: string, message: string): Promise<boolean> => {
    if (!currentUser) return false;
    const { error } = await supabase.from("comments").insert([{
      target_type: targetType, target_id: targetId,
      user_id: currentUser.id, message,
    }]);
    return !error;
  };

  const editComment = async (id: string, message: string): Promise<boolean> => {
    const { error } = await supabase.from("comments").update({ message }).eq("id", id);
    return !error;
  };

  const addReportInline = async () => {
    if (!rForm.date || !rForm.work_type || !currentUser) return;
    setSubmitting(true);
    const pw = periodWeather;
    const w = pw ? null : (wxAuto || (wxManual.temp ? wxManual : null));
    const { data, error } = await supabase.from("reports").insert([{
      ...rForm, image_url: "", org: currentOrg,
      weather:      pw?.weather  ?? w?.label    ?? "",
      weather_icon: "",
      temp:         pw?.temp     ?? (w?.temp     ? String(w.temp)     : ""),
      humidity:     pw?.humidity ?? (w?.humidity !== undefined ? String(w.humidity) : ""),
      rain:         pw?.rain     ?? (w?.rain     !== undefined ? String(w.rain)     : ""),
      pesticide_id:     rForm.pesticide_id     || null,
      pesticide_amount: rForm.pesticide_amount || null,
      pesticides_used: selectedPesticides.length > 0
        ? selectedPesticides.map(id => ({ id, amount: pesticideAmounts[id] || null }))
        : null,
      soil_ph: soilPh ? parseFloat(soilPh) : null,
      work_start: rForm.work_start || null,
      work_end:   rForm.work_end   || null,
      work_category_id: rForm.work_category_id || null,
      quantity_value:   rForm.quantity_value ? parseFloat(rForm.quantity_value) : null,
      quantity_unit:    rForm.quantity_unit || null,
      quantity:         rForm.quantity_value || rForm.quantity,
      work_minutes:     calcWorkMinutes(rForm.work_start, rForm.work_end),
    }]).select();
    setSubmitting(false);
    if (error) return showToast(error.message || "登録に失敗しました", "err");
    const newReport = data?.[0] as Report | undefined;
    if (newReport) { setReports(p => [newReport, ...p]); await autoMatchTicket(newReport); }
    setInlineMode(null);
    setInlineOpen(false);
    setCopySource(null);
    setSelectedPesticides([]);
    setPesticideAmounts({});
    setSoilPh("");
    setPeriodWeather(null);
    showToast("作業報告を登録しました");
  };

  const addScheduleInline = async () => {
    const { date, work_type, assigned_user_id, crop, field, note } = inlineSchedForm;
    if (!date || !work_type) return;
    setSubmitting(true);
    const ok = await addSchedule(date, work_type, note, crop, assigned_user_id || null, work_type, field);
    setSubmitting(false);
    if (!ok) return showToast("登録に失敗しました", "err");
    setInlineMode(null);
    setInlineOpen(false);
    showToast("予定を登録しました");
  };

  const autoMatchTicket = async (report: Report) => {
    const matched = tickets.find(t =>
      t.assigned_user_id === report.user_id &&
      t.work_type === report.work_type &&
      t.status === "open" &&
      t.due_date !== undefined &&
      t.due_date >= report.date
    );
    if (!matched) return;
    await supabase.from("tickets").update({ status: "done", report_id: report.id }).eq("id", matched.id);
    setTickets(prev => prev.map(t => t.id === matched.id ? { ...t, status: "done" as const, report_id: report.id } : t));
  };

  const addProject = async () => {
    if (!prjForm.name.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from("projects").insert([{
      name: prjForm.name.trim(),
      crop_id: prjForm.crop_id || null,
      field: prjForm.field || null,
      start_date: prjForm.start_date || null,
      end_date: prjForm.end_date || null,
      status: "active",
      org: currentOrg,
      created_by: currentUser?.id,
    }]).select().single();
    setSubmitting(false);
    if (error) return showToast(error.message, "err");
    if (data) setProjects(prev => [data as Project, ...prev]);
    setPrjForm({ name:"", crop_id:0, field:"", start_date:"", end_date:"" });
    setShowAddProject(false);
    showToast("計画を追加しました");
  };

  const addTicket = async (projectId: string) => {
    if (!tForm.title.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from("tickets").insert([{
      project_id: projectId,
      title: tForm.title.trim(),
      work_type: tForm.work_type || null,
      assigned_user_id: tForm.assigned_user_id || null,
      due_date: tForm.due_date || null,
      org: currentOrg,
    }]).select().single();
    setSubmitting(false);
    if (error) return showToast(error.message, "err");
    if (data) setTickets(prev => [...prev, data as Ticket]);
    setTForm({ title:"", work_type:"収穫", assigned_user_id:0, due_date:"" });
    setAddingTicketProjectId(null);
    showToast("チケットを追加しました");
  };

  const toggleTicketStatus = async (ticket: Ticket) => {
    const newStatus = ticket.status === "open" ? "done" : "open";
    await supabase.from("tickets").update({ status: newStatus }).eq("id", ticket.id);
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: newStatus } : t));
  };

  const deleteTicket = (id: string) =>
    confirmDelete("このチケットを削除しますか？", async () => {
      await supabase.from("tickets").delete().eq("id", id);
      setTickets(prev => prev.filter(t => t.id !== id));
      showToast("チケットを削除しました");
    });

  const deleteProject = (id: string) =>
    confirmDelete("この計画と全チケットを削除しますか？", async () => {
      await supabase.from("projects").delete().eq("id", id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setTickets(prev => prev.filter(t => t.project_id !== id));
      showToast("計画を削除しました");
    });

  const handleProjectUpdate = (updated: Project) =>
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));

  const updateCropDate = async (cropId: number, field: "start_date" | "last_work_date", value: string) => {
    const { error } = await supabase.from("crops").update({ [field]: value || null }).eq("id", cropId);
    if (error) return showToast(error.message, "err");
    setCrops(p => p.map(c => c.id === cropId ? { ...c, [field]: value || undefined } : c));
    setDatePickerTarget(null);
    showToast("日付を更新しました");
  };

  const userName = (id: number) => users.find(u => u.id === id)?.name || "未設定";
  const cropName = (id: number) => crops.find(c => c.id === id)?.name || "未設定";

  const cropStats = crops.map(c => {
    const rs   = reports.filter(r => r.crop_id === c.id);
    const tot  = rs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const last = [...rs].sort((a, b) => b.date.localeCompare(a.date))[0];
    const growDays = c.start_date
      ? Math.floor((Date.now() - new Date(c.start_date).getTime()) / 86400000)
      : null;
    return { ...c, count:rs.length, tot, last, growDays };
  });

  // ─── ダッシュボード統計 ───────────────────────────────
  const sevenAgo      = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const weekStart     = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d.toISOString().slice(0,10); })();
  const workCount7d        = reports.filter(r => r.date >= sevenAgo).length;
  const weekHarvest        = reports.filter(r => r.date >= weekStart).reduce((s,r) => s+(Number(r.quantity)||0), 0);
  const todayStr           = new Date().toISOString().slice(0,10);
  const todayScheduleCount = schedules.filter(s => s.date === todayStr).length;

  // 作物別月次収穫チャートデータ（年指定・12ヶ月固定）
  const monthlyHarvest = (cropId: number, year: number) => {
    const prefix = String(year);
    const m: Record<string,number> = {};
    reports.filter(r => r.crop_id === cropId && r.quantity && r.date.startsWith(prefix)).forEach(r => {
      const mo = r.date.slice(5,7);
      m[mo] = (m[mo]||0) + (Number(r.quantity)||0);
    });
    return Array.from({ length:12 }, (_, i) => {
      const mo = String(i+1).padStart(2,"0");
      return { month:`${i+1}月`, total: m[mo] || 0 };
    });
  };

  // 作物のデータがある年一覧
  const cropDataYears = (cropId: number) =>
    [...new Set(reports.filter(r => r.crop_id === cropId && r.quantity).map(r => Number(r.date.slice(0,4))))].sort();

  // 圃場ごとの作付け履歴集計
  const getFieldCropHistory = (fieldName: string) => {
    const grouped = reports
      .filter(r => r.field === fieldName)
      .reduce((acc, r) => {
        if (!acc[r.crop_id]) acc[r.crop_id] = { crop_id: r.crop_id, dates: [], count: 0 };
        acc[r.crop_id].dates.push(r.date);
        acc[r.crop_id].count += 1;
        return acc;
      }, {} as Record<number, { crop_id: number; dates: string[]; count: number }>);

    return Object.values(grouped).map(g => ({
      crop_id:   g.crop_id,
      cropName:  crops.find(c => c.id === g.crop_id)?.name ?? "不明",
      firstDate: [...g.dates].sort()[0],
      lastDate:  [...g.dates].sort().slice(-1)[0],
      count:     g.count,
    })).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  };

  // 予定と実績のマッチング
  const matchReportToSchedule = (schedule: Schedule): Report | null =>
    reports.find(r =>
      r.user_id === (schedule.assigned_user_id ?? schedule.user_id) &&
      r.date === schedule.date &&
      r.work_type === schedule.work_type
    ) ?? null;

  // 週次進捗データ生成
  const getWeeklyProgress = (weekStart: Date) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
    return users.filter(u => u.role !== "viewer").map(user => ({
      user,
      days: days.map(date => {
        const daySchedules = schedules.filter(s =>
          (s.assigned_user_id ?? s.user_id) === user.id && s.date === date
        );
        const dayReports = reports.filter(r => r.user_id === user.id && r.date === date);
        return {
          date,
          schedules: daySchedules,
          reports: dayReports,
          matched: daySchedules.filter(s => matchReportToSchedule(s) !== null),
        };
      }),
    }));
  };

  // ─── スタイル ─────────────────────────────────────────
  const S = {
    wrap:    css({ minHeight:"100vh", background:C.bg, paddingBottom:80 }),
    header:  css({ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.primary2} 100%)`, color:"#fff", padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, boxShadow:"0 2px 8px rgba(45,106,45,0.25)", minHeight:0 }),
    headerTitle: css({ fontSize:14, fontWeight:700, letterSpacing:0.3, display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" as const, flex:1, minWidth:0 }),
    headerSub: css({ background:"#fff", borderBottom:`1px solid ${C.border}`, display:"flex", paddingLeft:4, paddingRight:4, gap:0 }),
    subTabBtn: (active: boolean) => ({ flex:1, padding:"10px 8px", border:"none", borderBottom: active ? `2.5px solid ${C.primary}` : "2.5px solid transparent", background:"transparent", color: active ? C.primary : C.textMuted, fontSize:13, fontWeight: active ? 700 : 600, cursor:"pointer", transition:"all 0.15s" } as const),
    page:    css({ padding:"16px 16px 0" }),
    sec:     css({ fontSize:12, fontWeight:700, color:"#6b7280", marginBottom:10, marginTop:16, display:"flex", alignItems:"center", gap:6, textTransform:"uppercase" as const, letterSpacing:0.5, whiteSpace:"nowrap" as const }),
    lbl:     css({ fontSize:12, fontWeight:600, color:C.textSub, marginBottom:5, display:"flex", alignItems:"center", gap:4 }),
    card:    css({ background:C.card, borderRadius:14, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:`1px solid ${C.border}` }),
    input:   css({ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid #e5e7eb`, fontSize:15, marginBottom:12, background:"#ffffff", color:C.text, transition:"border 0.15s", boxSizing:"border-box" as const }),
    select:  css({ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid #e5e7eb`, fontSize:15, marginBottom:12, background:"#ffffff", color:C.text }),
    btn:     css({ background:"#166534", color:"#fff", border:"none", borderRadius:12, padding:"13px 0", width:"100%", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 1px 3px rgba(0,0,0,.10), 0 4px 12px rgba(22,101,52,.25)", whiteSpace:"nowrap" as const, minHeight:52 }),
    btnSm:   css({ background:C.dangerBg, color:C.danger, border:`1.5px solid ${C.danger}22`, borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" as const, minWidth:48, flexShrink:0 }),
    row:     css({ display:"flex", justifyContent:"space-between", alignItems:"center" }),
    wxBox:   css({ background:`linear-gradient(135deg, #f0faf0 0%, #daf0da 100%)`, borderRadius:14, padding:"14px 16px", marginBottom:14, border:`1px solid ${C.primary4}` }),
    wxGrid:  css({ display:"flex", flexWrap:"nowrap" as const, gap:6, marginTop:8, overflowX:"auto" as const }),
    wxBadge: css({ background:"rgba(255,255,255,0.85)", backdropFilter:"blur(4px)", borderRadius:8, padding:"4px 7px", display:"inline-flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, color:C.text, border:`1px solid ${C.border}`, whiteSpace:"nowrap" as const, flexShrink:0 }),

    nav:     css({ position:"fixed" as const, bottom:0, left:0, right:0, background:C.navBg, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100, boxShadow:"0 -2px 12px rgba(0,0,0,0.06)" }),
    center:  css({ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", flexDirection:"column" as const, gap:12, fontSize:15, color:C.textMuted }),
    divider: css({ height:1, background:C.border, margin:"6px 0 12px" }),
  };


  const navBtn = (active: boolean): CSSProperties => ({
    flex:1, padding:"10px 0 8px", border:"none", background:"none", cursor:"pointer",
    display:"flex", flexDirection:"column", alignItems:"center", gap:3,
    color: active ? "#166534" : C.textMuted,
    fontSize:10, fontWeight: active ? 700 : 500,
    borderTop: active ? `3px solid #166534` : "3px solid transparent",
    transition:"all 0.15s",
    minHeight:48,
  });

  const tagStyle = (role: Role): CSSProperties => ({
    background: roleColor[role]+"18", color: roleColor[role],
    borderRadius:6, padding:"2px 9px", fontSize:11, fontWeight:700,
    border:`1px solid ${roleColor[role]}30`, whiteSpace:"nowrap",
  });


  // ─── 天気バッジ（1行コンパクト表示）────────────────────
  const WxBadges = ({ wx }: { wx: WeatherInfo }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, flexWrap:"nowrap" as const, overflow:"hidden" }}>
      <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, fontWeight:700, color:C.text, whiteSpace:"nowrap" as const }}>
        <wx.Icon size={14} color={C.primary} strokeWidth={2} />{wx.label}
      </span>
      <span style={{ color:C.border }}>|</span>
      <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, fontWeight:600, color:C.textSub, whiteSpace:"nowrap" as const }}>
        <Thermometer size={14} color="#e07020" strokeWidth={2} />{wx.temp}°C
      </span>
      {wx.humidity !== undefined && <>
        <span style={{ color:C.border }}>|</span>
        <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, fontWeight:600, color:C.textSub, whiteSpace:"nowrap" as const }}>
          <Droplets size={14} color="#1976d2" strokeWidth={2} />{wx.humidity}%
        </span>
      </>}
      {wx.rain !== undefined && <>
        <span style={{ color:C.border }}>|</span>
        <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, fontWeight:600, color:C.textSub, whiteSpace:"nowrap" as const }}>
          <CloudRain size={14} color="#0288d1" strokeWidth={2} />{wx.rain}mm
        </span>
      </>}
    </div>
  );

  // ─── 権限ヘルパー（取得できない場合は worker として扱う）────
  const isAdmin = (currentUser?.role ?? "worker") === "admin";

  // workerが管理タブを直接開いていたらホームへ
  if (!isAdmin && tab === "users") setTab("home");

  const navItems = [
    { key:"home",      Icon:Home,      label:"ホーム" },
    { key:"report",    Icon:PenLine,   label:"記録" },
    { key:"analytics", Icon:BarChart2, label:"分析" },
    { key:"manage",    Icon:Settings,  label:"管理" },
  ];

  // ─── Auth ゲート ─────────────────────────────────────────
  if (authLoading) return (
    <div style={S.center}>
      <Leaf size={36} color={C.primary} strokeWidth={1.5} />
      <span>認証確認中...</span>
    </div>
  );

  if (!authSession) return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg, ${C.primary} 0%, #1b4d1b 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:"32px 24px", width:"100%", maxWidth:400, boxShadow:"0 8px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ background:C.primary3, borderRadius:16, width:60, height:60, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
            <Wheat size={30} color={C.primary} strokeWidth={1.8} />
          </div>
          <div style={{ fontSize:20, fontWeight:700, color:C.text }}>農作業レポート</div>
          <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>ログインしてください</div>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:600, color:C.textSub, display:"flex", alignItems:"center", gap:4, marginBottom:6 }}>
            <KeyRound size={13} strokeWidth={2} />ユーザーID
          </label>
          <input
            style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${loginError ? "#c0392b" : C.border}`, fontSize:15, background:"#fafcfa", color:C.text, boxSizing:"border-box" }}
            placeholder="例: kishu-001"
            value={loginId}
            onChange={e => { setLoginId(e.target.value); setLoginError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:600, color:C.textSub, display:"flex", alignItems:"center", gap:4, marginBottom:6 }}>
            <KeyRound size={13} strokeWidth={2} />パスワード
          </label>
          <div style={{ position:"relative" }}>
            <input
              type={showPass ? "text" : "password"}
              style={{ width:"100%", padding:"11px 44px 11px 14px", borderRadius:10, border:`1.5px solid ${loginError ? "#c0392b" : C.border}`, fontSize:15, background:"#fafcfa", color:C.text, boxSizing:"border-box" }}
              placeholder="パスワード"
              value={loginPass}
              onChange={e => { setLoginPass(e.target.value); setLoginError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <button onClick={() => setShowPass(p => !p)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}>
              {showPass ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>

        {loginError && <div style={{ color:"#c0392b", fontSize:13, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><AlertCircle size={14} strokeWidth={2} />{loginError}</div>}

        <button
          onClick={handleLogin}
          disabled={loginBusy}
          style={{ width:"100%", padding:"13px 0", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity:loginBusy?0.7:1, boxShadow:"0 3px 10px rgba(45,106,45,0.35)" }}
        >
          {loginBusy ? <RefreshCw size={16} strokeWidth={2} /> : <LogIn size={16} strokeWidth={2} />}
          {loginBusy ? "ログイン中..." : "ログイン"}
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div style={S.center}>
      <Leaf size={36} color={C.primary} strokeWidth={1.5} />
      <span>読み込み中...</span>
    </div>
  );

  return (
    <div style={S.wrap} onClick={() => openMenuId && setOpenMenuId(null)}>
      {/* ヘッダー */}
      <div style={S.header}>
        <div style={S.headerTitle}>
          {tab === "home" ? <><Leaf size={17} strokeWidth={1.8} />農作業レポート</> :
           tab === "report" ? "記録" :
           tab === "analytics" ? "分析" :
           tab === "manage" ? "管理" : <><Leaf size={17} strokeWidth={1.8} />農作業レポート</>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:"0 0 auto", flexShrink:0 }}>
          {(tab === "home" || tab === "report") && (
            <button
              onClick={() => setShowQuickReport(true)}
              style={{ display:"flex", alignItems:"center", gap:4, background:"#fff", borderRadius:9999, padding:"8px 16px", border:"none", cursor:"pointer", color:"#166534", fontWeight:600, fontSize:13, flexShrink:0, transition:"background-color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >
              <Plus size={14} strokeWidth={2.5} />
              作業記録
            </button>
          )}
          {currentUser && (
            <button onClick={() => setShowUserPicker(true)} style={{ display:"flex", alignItems:"center", padding:"5px 7px", background:"rgba(255,255,255,0.15)", borderRadius:20, border:"none", cursor:"pointer", color:"#fff", flexShrink:0 }}>
              <UserCircle size={18} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
      {/* サブタブバー（分析・管理のみ） */}
      {tab === "analytics" && (
        <div style={S.headerSub}>
          <button style={S.subTabBtn(analyticsSubTab === "report")} onClick={() => setAnalyticsSubTab("report")}>レポート</button>
          <button style={S.subTabBtn(analyticsSubTab === "backlog")} onClick={() => setAnalyticsSubTab("backlog")}>計画</button>
        </div>
      )}
      {tab === "manage" && (
        <div style={S.headerSub}>
          <button style={S.subTabBtn(manageSubTab === "crops")} onClick={() => setManageSubTab("crops")}>作物</button>
          <button style={S.subTabBtn(manageSubTab === "fields")} onClick={() => setManageSubTab("fields")}>圃場</button>
          <button style={S.subTabBtn(manageSubTab === "pesticides")} onClick={() => setManageSubTab("pesticides")}>農薬</button>
        </div>
      )}

      {/* ───── HOME ───── */}
      {tab === "home" && (
        <div style={S.page}>
          {/* 作業セッション（作業中のみ表示） */}
          {workSession && (
            <div style={{ background:"#fff3e0", borderRadius:12, padding:"12px 14px", marginBottom:4, border:"1px solid #ffe0b2" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#e53935", animation:"pulse 1s infinite", flexShrink:0 }} />
                <span style={{ fontSize:14, fontWeight:700, color:"#e07020", flex:1 }}>作業中</span>
                <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(224,112,32,0.12)", borderRadius:8, padding:"4px 10px" }}>
                  <Timer size={13} color="#e07020" strokeWidth={2} />
                  <span style={{ fontSize:16, fontWeight:700, color:"#e07020", fontVariantNumeric:"tabular-nums" as const, letterSpacing:0.5 }}>{fmtElapsed(workElapsed)}</span>
                </div>
                <button
                  onClick={toggleVoice}
                  style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 10px", borderRadius:20, border:`1.5px solid ${isListening ? "#e53935" : "#ffe0b2"}`, background: isListening ? "#fdecea" : "#fff", color: isListening ? "#e53935" : "#e07020", fontWeight:700, fontSize:12, cursor:"pointer", flexShrink:0 }}
                >
                  {isListening ? <MicOff size={13} strokeWidth={2} /> : <Mic size={13} strokeWidth={2} />}
                  {isListening ? "停止" : "音声"}
                </button>
                <button
                  onClick={stopWork}
                  style={{ padding:"7px 14px", borderRadius:8, border:"1.5px solid #e07020", background:"#fff", color:"#e07020", fontWeight:700, fontSize:13, cursor:"pointer", flexShrink:0 }}
                >
                  終了する
                </button>
              </div>
              {voiceTranscript && (
                <div style={{ marginTop:8, background:"rgba(255,255,255,0.7)", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#7a4000", borderLeft:"3px solid #ffe0b2" }}>
                  {voiceTranscript}
                </div>
              )}
            </div>
          )}
          {/* 天気カード（全幅） */}
          {wxLoading ? (
            <div style={{ background:"#f0fdf4", borderRadius:16, padding:"16px 20px", border:`1px solid ${C.primary4}`, marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
              <RefreshCw size={18} color={C.primary} strokeWidth={1.8} />
              <div style={{ fontSize:11, color:C.textSub, fontWeight:600 }}>天気取得中...</div>
            </div>
          ) : wxAuto ? (
            <div style={{ background:"#f0fdf4", borderRadius:16, padding:"16px 20px", border:`1px solid ${C.primary4}`, marginBottom:10, display:"flex", alignItems:"center", gap:20 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                <div style={{ fontSize:11, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                  <wxAuto.Icon size={11} color={C.primary} strokeWidth={2} />今日の天気
                </div>
                <div style={{ fontSize:40, fontWeight:800, color:C.text, lineHeight:1 }}>{wxAuto.temp}°</div>
                <div style={{ fontSize:13, color:C.textSub, fontWeight:700 }}>{wxAuto.label}</div>
              </div>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                {wxAuto.humidity !== undefined && (
                  <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.7)", borderRadius:8, padding:"5px 10px" }}>
                    <Droplets size={13} color="#1976d2" strokeWidth={2}/><span style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>{wxAuto.humidity}% 湿度</span>
                  </div>
                )}
                {wxAuto.rain !== undefined && (
                  <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.7)", borderRadius:8, padding:"5px 10px" }}>
                    <CloudRain size={13} color="#0288d1" strokeWidth={2}/><span style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>{wxAuto.rain}mm 降水</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {/* 統計3枚（2カラムグリッド） */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
            <div style={{ background:C.card, borderRadius:16, padding:"16px 14px", border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:4, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <CalendarDays size={11} color={C.primary} strokeWidth={2} />直近7日
              </div>
              <div style={{ fontSize:28, fontWeight:800, color:C.text, lineHeight:1.1 }}>{workCount7d}</div>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>件の作業</div>
            </div>
            <div style={{ background:C.card, borderRadius:16, padding:"16px 14px", border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:4, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <PackageCheck size={11} color={C.primary} strokeWidth={2} />今週の収穫
              </div>
              <div style={{ fontSize:28, fontWeight:800, color:C.text, lineHeight:1.1 }}>{weekHarvest > 0 ? weekHarvest : "—"}</div>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>{weekHarvest > 0 ? "kg" : "収穫なし"}</div>
            </div>
            <div style={{ background:C.card, borderRadius:16, padding:"16px 14px", border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:4, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", gridColumn:"span 2" }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <CalendarDays size={11} color={C.primary} strokeWidth={2} />今日の予定
              </div>
              <div style={{ fontSize:28, fontWeight:800, color: todayScheduleCount > 0 ? "#166534" : C.text, lineHeight:1.1 }}>{todayScheduleCount}</div>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>{todayScheduleCount > 0 ? "件" : "予定なし"}</div>
            </div>
          </div>

          <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />作物サマリー</div>

          {cropStats.length === 0 ? (
            <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
              <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <Sprout size={22} color={C.primary} strokeWidth={1.5} />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>作物が登録されていません</div>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:14 }}>管理者に作物の登録を依頼してください</div>
            </div>
          ) : cropStats.map(c => {
            const expanded = expandedCrops.has(c.id);
            const ci = getCropIcon(c.name);
            return (
              <div key={c.id} style={S.card}>
                <button
                  onClick={() => setExpandedCrops(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
                  style={{ width:"100%", background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center", gap:10 }}
                >
                  <div style={{ background:ci.bg, borderRadius:10, padding:8, flexShrink:0 }}>
                    <ci.Icon size={18} color={ci.color} strokeWidth={1.8} />
                  </div>
                  <span style={{ fontWeight:700, fontSize:15, color:C.text, flex:1, textAlign:"left" }}>{c.name}</span>
                  {c.growDays !== null && (
                    <span style={{ fontSize:11, color:C.primary, background:C.primary3, borderRadius:6, padding:"2px 7px", fontWeight:600, whiteSpace:"nowrap" as const }}>
                      {c.growDays}日目
                    </span>
                  )}
                  <span style={{ marginLeft:4, fontSize:11, color:C.primary, background:C.primary3, borderRadius:6, padding:"3px 9px", fontWeight:700, flexShrink:0, border:`1px solid ${C.primary4}` }}>
                    {expanded ? "▲ 閉じる" : "▼ 詳細を開く"}
                  </span>
                </button>
                {expanded && (
                  <>
                    <div style={S.divider} />
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
                      <div style={{ background:C.bg, borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                        <div style={{ fontSize:26, fontWeight:800, color:C.primary, lineHeight:1 }}>{c.growDays ?? "—"}</div>
                        <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>生育日数</div>
                      </div>
                      <div style={{ background:C.bg, borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                        <div style={{ fontSize:26, fontWeight:800, color:C.primary, lineHeight:1 }}>{c.count}</div>
                        <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>作業回数</div>
                      </div>
                      <div style={{ background:C.bg, borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                        <div style={{ fontSize:c.tot > 999 ? 18 : 26, fontWeight:800, color:C.primary, lineHeight:1 }}>{c.tot > 0 ? c.tot : "—"}</div>
                        <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>{c.tot > 0 ? "kg収穫" : "収穫なし"}</div>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setTab("analytics"); }}
                      style={{ width:"100%", padding:"9px 0", borderRadius:10, border:`1.5px solid ${C.primary4}`, background:C.primary3, color:C.primary, fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
                    >
                      <BarChart2 size={14} strokeWidth={2} />分析で見る →
                    </button>
                  </>
                )}
              </div>
            );
          })}

          <div style={{ ...S.sec, justifyContent:"space-between" }}>
            <span style={{ display:"flex", alignItems:"center", gap:6 }}><ClipboardList size={14} strokeWidth={2} />最新の作業報告</span>
            {reports.length > 2 && (
              <button onClick={() => setTab("report")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.primary, fontWeight:600, flexShrink:0, whiteSpace:"nowrap" as const }}>もっと見る →</button>
            )}
          </div>

          {reports.length === 0 ? (
            <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
              <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <ClipboardList size={22} color={C.primary} strokeWidth={1.5} />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>まだ作業報告がありません</div>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:14 }}>最初の報告を登録してみましょう</div>
              <button style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", border:"none", borderRadius:10, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }} onClick={() => setTab("report")}>
                <PenLine size={14} strokeWidth={2} />報告を登録
              </button>
            </div>
          ) : reports.slice(0,2).map(r => (
            <div key={r.id} style={S.card}>
              <div style={S.row}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {(() => { const ci = getCropIcon(cropName(r.crop_id)); return <div style={{ background:ci.bg, borderRadius:7, padding:5, flexShrink:0 }}><ci.Icon size={13} color={ci.color} strokeWidth={2} /></div>; })()}
                  <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{cropName(r.crop_id)}</span>
                  <span style={{ fontSize:11, color: r.field ? C.primary : C.textMuted, background: r.field ? C.primary3 : C.bg, borderRadius:6, padding:"1px 7px", fontWeight:600 }}>{r.field || "未設定"}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={11} strokeWidth={2}/>{r.date}</span>
                  {(isAdmin || r.user_id === currentUser?.id) && (
                    <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setOpenMenuId(openMenuId === `hr${r.id}` ? null : `hr${r.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 4px", borderRadius:6, color:C.textMuted, display:"flex" }}>
                        <MoreVertical size={16} strokeWidth={2} />
                      </button>
                      {openMenuId === `hr${r.id}` && (
                        <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                          <button onClick={() => { setOpenMenuId(null); deleteReport(r.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                            <Trash2 size={13} strokeWidth={2} />削除
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={S.divider} />
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, fontSize:12 }}>
                <span style={{ color:C.textSub, fontWeight:600 }}>{r.work_type}</span>
                {r.quantity  && <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><PackageCheck size={11} strokeWidth={2}/>{r.quantity}kg</span>}
                {(r.work_start && r.work_end)
                  ? <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11} strokeWidth={2}/>{r.work_start}〜{r.work_end}</span>
                  : r.work_time ? <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11} strokeWidth={2}/>{r.work_time}h</span> : null}
                {r.pesticide_id && (() => { const ps = pesticides.find(p => p.id === r.pesticide_id); return ps ? <span style={{ color:"#7b1fa2", display:"flex", alignItems:"center", gap:3, background:"#f3e5f5", borderRadius:6, padding:"1px 7px", fontWeight:600 }}><FlaskConical size={10} strokeWidth={2}/>{ps.name}{r.pesticide_amount ? ` ${r.pesticide_amount}` : ""}</span> : null; })()}
              </div>
              <div style={{ ...S.row, marginTop:8 }}>
                <span style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><UserCircle size={11} strokeWidth={2}/>{userName(r.user_id)}</span>
                {r.weather && (
                  <span style={{ fontSize:11, color:C.textSub, display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" as const }}>
                    <span>{r.weather}{r.temp ? ` ${r.temp}°C` : ""}</span>
                    {r.humidity !== "" && r.humidity !== null && <span style={{ display:"flex", alignItems:"center", gap:2 }}><Droplets size={10} color="#1976d2" strokeWidth={2}/>{r.humidity}%</span>}
                    {r.rain     !== "" && r.rain     !== null && <span style={{ display:"flex", alignItems:"center", gap:2 }}><CloudRain size={10} color="#0288d1" strokeWidth={2}/>{r.rain}mm</span>}
                  </span>
                )}
              </div>
              {r.note && (
                <div style={{ fontSize:12, color:C.textSub, marginTop:8, padding:"7px 10px", background:C.bg, borderRadius:8, borderLeft:`3px solid ${C.primary4}` }}>
                  {r.note}
                </div>
              )}
              {r.image_url && (
                <img src={r.image_url} alt="作業写真" style={{ width:"100%", borderRadius:8, marginTop:8, maxHeight:180, objectFit:"cover", display:"block" }} />
              )}
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button
                  onClick={() => setSelectedReport(r)}
                  style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"6px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, color:C.textSub, fontSize:12, fontWeight:600, cursor:"pointer" }}
                >
                  <ClipboardList size={12} strokeWidth={2} />詳細を見る
                </button>
                <button
                  onClick={() => handleCopyReport(r)}
                  style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"6px 12px", borderRadius:8, border:`1px solid ${C.primary}`, background:"transparent", color:C.primary, fontSize:12, fontWeight:600, cursor:"pointer" }}
                >
                  <Copy size={12} strokeWidth={2} />コピーして作成
                </button>
              </div>
            </div>
          ))}
          {/* マップカード */}
          <div style={{ ...S.card, display:"flex", alignItems:"center", gap:12, marginTop:4 }}>
            <div style={{ background:C.primary3, borderRadius:10, padding:10, flexShrink:0 }}>
              <MapPin size={20} color={C.primary} strokeWidth={1.8} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:C.text }}>圃場マップ</div>
              <div style={{ fontSize:12, color:C.textMuted }}>登録圃場の場所を地図で確認</div>
            </div>
            <button onClick={() => setShowMapModal(true)} style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", border:"none", borderRadius:9, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
              マップを開く
            </button>
          </div>
        </div>
      )}

      {/* マップモーダル */}
      {showMapModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:450, display:"flex", alignItems:"flex-end" }}
          onClick={() => setShowMapModal(false)}>
          <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", height:"75vh", overflow:"hidden", display:"flex", flexDirection:"column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <span style={{ fontWeight:700, fontSize:15, color:C.text, display:"flex", alignItems:"center", gap:6 }}><MapPin size={16} color={C.primary} strokeWidth={2} />圃場マップ</span>
              <button onClick={() => setShowMapModal(false)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:13, color:C.textSub, fontWeight:600 }}>閉じる</button>
            </div>
            <div style={{ flex:1, overflow:"hidden" }}>
              <MapContainer
                center={(userPos ?? [weatherCoords?.lat ?? 35.0167, weatherCoords?.lng ?? 135.5833]) as [number,number]}
                zoom={15}
                style={{ width:"100%", height:"100%" }}
                zoomControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                {userPos && <Marker position={userPos} icon={PIN_BLUE}><Popup><b>現在地</b></Popup></Marker>}
                {fields.filter(f => f.lat && f.lng).map(f => (
                  <Marker key={f.id} position={[f.lat!, f.lng!]} icon={PIN_GREEN}><Popup><b>{f.name}</b></Popup></Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>
      )}

      {/* ───── REPORT ───── */}
      {tab === "report" && (
        <div style={S.page}>
          <CalendarView
            reports={reports}
            schedules={schedules}
            crops={crops}
            users={users}
            pesticides={pesticides}
            currentUserId={currentUser?.id ?? 0}
            onAddSchedule={addSchedule}
            onLoadComments={loadComments}
            onAddComment={addComment}
            onEditComment={editComment}
          />

          {/* ── 今日の予定 ── */}
          {(() => {
            const todayScheds = schedules.filter(s => s.date === todayStr);
            return (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                  <CalendarDays size={14} color={C.primary} strokeWidth={2} />今日の予定
                </div>
                {todayScheds.length === 0 ? (
                  <div style={{ background:C.card, borderRadius:12, padding:"12px 16px", border:`1px solid ${C.border}`, fontSize:13, color:C.textMuted, textAlign:"center" as const }}>
                    今日の予定はありません
                  </div>
                ) : todayScheds.map(s => {
                  const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                  return (
                    <div key={s.id} style={{ background:C.card, borderRadius:12, padding:"10px 14px", border:`1px solid ${C.border}`, marginBottom:6, display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{s.title}</div>
                        <div style={{ fontSize:11, color:C.textSub, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" as const }}>
                          {s.crop && <span style={{ display:"flex", alignItems:"center", gap:3 }}><Leaf size={11} strokeWidth={2} />{s.crop}</span>}
                          {s.field && <span style={{ display:"flex", alignItems:"center", gap:3 }}><MapPin size={11} strokeWidth={2} />{s.field}</span>}
                          {assignedUser && <span style={{ display:"flex", alignItems:"center", gap:3 }}><UserCircle size={11} strokeWidth={2} />{assignedUser.name}</span>}
                          {s.work_type && <span>{s.work_type}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── 未報告の作業 ── */}
          {(() => {
            const unreported = schedules.filter(s => s.date < todayStr && !matchReportToSchedule(s));
            if (unreported.length === 0) return null;
            return (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#c2410c", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                  <ClipboardList size={14} color="#c2410c" strokeWidth={2} />未報告の作業
                </div>
                {unreported.map(s => {
                  const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSchedule(s)}
                      style={{ width:"100%", background:"#fff7ed", borderRadius:12, padding:"10px 14px", border:`1px solid #fed7aa`, marginBottom:6, display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left" as const }}
                    >
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                          <span style={{ fontWeight:700, fontSize:13, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, flex:1 }}>{s.title}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:"#c2410c", background:"#fff7ed", border:`1px solid #fed7aa`, borderRadius:5, padding:"2px 7px", flexShrink:0 }}>未報告</span>
                        </div>
                        <div style={{ fontSize:11, color:C.textSub, display:"flex", gap:8, flexWrap:"wrap" as const }}>
                          <span style={{ display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={11} strokeWidth={2} />{s.date}</span>
                          {s.crop && <span style={{ display:"flex", alignItems:"center", gap:3 }}><Leaf size={11} strokeWidth={2} />{s.crop}</span>}
                          {assignedUser && <span style={{ display:"flex", alignItems:"center", gap:3 }}><UserCircle size={11} strokeWidth={2} />{assignedUser.name}</span>}
                          {s.work_type && <span>{s.work_type}</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} color={C.textMuted} strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* ── 記録を追加（削除済み：ヘッダーの＋ボタンからモーダルで追加） ── */}
          {false && (
            <div style={{ marginBottom:16 }}>
              {!inlineOpen ? (
                <button
                  onClick={() => setInlineOpen(true)}
                  style={{ width:"100%", padding:"12px 0", borderRadius:12, border:`2px dashed ${C.primary4}`, background:C.primary3, color:C.primary, fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
                >
                  <Plus size={16} strokeWidth={2.5} />記録を追加
                </button>
              ) : (
              <>
                {/* 2択セレクター */}
                {!inlineMode && (
                  <div className="anim-slideDown" style={{ background:C.card, borderRadius:14, padding:14, border:`1px solid ${C.border}`, boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span>何を追加しますか？</span>
                      <button onClick={() => setInlineOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}><X size={16} strokeWidth={2} /></button>
                    </div>
                    <div style={{ display:"flex", gap:10 }}>
                      <button
                        onClick={() => setInlineMode("schedule")}
                        style={{ flex:1, padding:"14px 8px", borderRadius:12, border:`1.5px solid ${C.primary4}`, background:C.primary3, color:C.primary, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}
                      >
                        <CalendarDays size={22} color={C.primary} strokeWidth={1.8} />
                        <span style={{ fontSize:13, fontWeight:700 }}>予定を登録</span>
                        <span style={{ fontSize:11, color:C.textSub }}>作業スケジュール</span>
                      </button>
                      <button
                        onClick={() => setInlineMode("report")}
                        style={{ flex:1, padding:"14px 8px", borderRadius:12, border:`1.5px solid ${C.primary4}`, background:"#fff", color:C.text, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}
                      >
                        <ClipboardList size={22} color={C.primary} strokeWidth={1.8} />
                        <span style={{ fontSize:13, fontWeight:700 }}>作業報告</span>
                        <span style={{ fontSize:11, color:C.textSub }}>実績を記録</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 予定フォーム */}
                {inlineMode === "schedule" && (
                  <div className="anim-slideDown" style={{ background:C.card, borderRadius:14, padding:16, border:`1px solid ${C.border}`, boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <button onClick={() => setInlineMode(null)} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}><ChevronLeft size={18} strokeWidth={2.5} /></button>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <CalendarDays size={15} color={C.primary} strokeWidth={2} />
                          <span style={{ fontWeight:700, fontSize:15, color:C.text }}>予定を登録</span>
                        </div>
                      </div>
                      <button onClick={() => { setInlineOpen(false); setInlineMode(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}><X size={16} strokeWidth={2} /></button>
                    </div>

                    <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />日付</div>
                    <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={inlineSchedForm.date} onChange={e => setInlineSchedForm(f => ({ ...f, date:e.target.value }))} />

                    <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物（任意）</div>
                    <select style={S.select} value={inlineSchedForm.crop} onChange={e => setInlineSchedForm(f => ({ ...f, crop:e.target.value }))}>
                      <option value="">未指定</option>
                      {crops.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>

                    <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場（任意）</div>
                    <select style={S.select} value={inlineSchedForm.field} onChange={e => setInlineSchedForm(f => ({ ...f, field:e.target.value }))}>
                      <option value="">未指定</option>
                      {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>

                    <div style={S.lbl}><Wheat size={13} strokeWidth={2} />作業種別</div>
                    <select style={S.select} value={inlineSchedForm.work_type} onChange={e => setInlineSchedForm(f => ({ ...f, work_type:e.target.value }))}>
                      {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />担当者</div>
                    <select style={S.select} value={inlineSchedForm.assigned_user_id} onChange={e => setInlineSchedForm(f => ({ ...f, assigned_user_id:Number(e.target.value) }))}>
                      <option value={0}>未指定</option>
                      {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>

                    <div style={S.lbl}><PenLine size={13} strokeWidth={2} />メモ</div>
                    <input style={S.input} placeholder="詳細・備考など" value={inlineSchedForm.note} onChange={e => setInlineSchedForm(f => ({ ...f, note:e.target.value }))} />

                    <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addScheduleInline} disabled={submitting}>
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />登録中...</> : <><Save size={16} strokeWidth={2} />予定を保存する</>}
                    </button>
                  </div>
                )}

                {/* 作業報告フォーム */}
                {inlineMode === "report" && (
                  <div className="anim-slideDown" style={{ background:C.card, borderRadius:14, padding:16, border:`1px solid ${C.border}`, boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <button onClick={() => { setInlineMode(null); setCopySource(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}><ChevronLeft size={18} strokeWidth={2.5} /></button>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <ClipboardList size={15} color={C.primary} strokeWidth={2} />
                          <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{copySource ? "コピーして作成" : "作業報告"}</span>
                        </div>
                      </div>
                      <button onClick={() => { setInlineOpen(false); setInlineMode(null); setCopySource(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}><X size={16} strokeWidth={2} /></button>
                    </div>

                    <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />日付</div>
                    <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={rForm.date} onChange={e => setRForm(f => ({ ...f, date:e.target.value }))} />

                    <div style={{ display:"flex", gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物</div>
                        <select style={S.select} value={rForm.crop_id} onChange={e => setRForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                          {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場</div>
                        <select style={S.select} value={rForm.field} onChange={e => setRForm(f => ({ ...f, field:e.target.value }))}>
                          {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={S.lbl}><Wheat size={13} strokeWidth={2} />作業種別</div>
                    {workCategories.length > 0 ? (
                      <select style={S.select} value={rForm.work_category_id}
                        onChange={e => {
                          const cat = workCategories.find(c => c.id === Number(e.target.value));
                          setRForm(f => ({ ...f, work_category_id: Number(e.target.value), work_type: cat?.name ?? f.work_type, quantity_unit: cat?.unit ?? f.quantity_unit }));
                        }}>
                        <option value={0}>選択してください</option>
                        {workCategories.map(c => <option key={c.id} value={c.id}>{c.name}{c.unit ? `（${c.unit}）` : ""}</option>)}
                      </select>
                    ) : (
                      <select style={S.select} value={rForm.work_type} onChange={e => setRForm(f => ({ ...f, work_type:e.target.value }))}>
                        {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}

                    <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />担当者</div>
                    <select style={S.select} value={rForm.user_id} onChange={e => setRForm(f => ({ ...f, user_id:Number(e.target.value) }))}>
                      {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>

                    <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />実績数量{rForm.quantity_unit ? `（${rForm.quantity_unit}）` : ""}</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                      <input type="number" style={{ ...S.input, marginBottom:0, flex:1 }} placeholder="例: 20" value={rForm.quantity_value} onChange={e => setRForm(f => ({ ...f, quantity_value:e.target.value, quantity:e.target.value }))} />
                      <input style={{ ...S.input, marginBottom:0, width:70, flexShrink:0, fontSize:13, padding:"11px 8px" }} placeholder="単位" value={rForm.quantity_unit} onChange={e => setRForm(f => ({ ...f, quantity_unit:e.target.value }))} />
                    </div>

                    <div style={S.lbl}><Clock size={13} strokeWidth={2} />作業時刻</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                      <input type="time" style={{ ...S.input, marginBottom:0, flex:1 }} value={rForm.work_start} onChange={e => setRForm(f => ({ ...f, work_start:e.target.value }))} />
                      <span style={{ color:C.textMuted, flexShrink:0, fontSize:13 }}>〜</span>
                      <input type="time" style={{ ...S.input, marginBottom:0, flex:1 }} value={rForm.work_end} onChange={e => setRForm(f => ({ ...f, work_end:e.target.value }))} />
                    </div>
                    {periodWeather && (
                      <div style={{ background:"#f0faf0", borderRadius:9, padding:"8px 12px", marginBottom:12, border:`1px solid ${C.primary4}`, fontSize:12, color:C.textSub, display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontWeight:700, color:C.primary }}>{periodWeather?.weather}</span>
                        {periodWeather?.temp && <span>{periodWeather?.temp}°C</span>}
                        {periodWeather?.humidity && <span>湿度{periodWeather?.humidity}%</span>}
                        {parseFloat(periodWeather?.rain ?? "0") > 0 && <span>雨量{periodWeather?.rain}mm</span>}
                        <span style={{ marginLeft:"auto", fontSize:11, color:C.textMuted }}>自動取得</span>
                      </div>
                    )}

                    <div style={S.lbl}><FlaskConical size={13} strokeWidth={2} />使用農薬（任意）</div>
                    {pesticides.length === 0 ? (
                      <div style={{ fontSize:12, color:C.textMuted, padding:"8px 12px", background:C.bg, borderRadius:8, marginBottom:12 }}>登録済みの農薬がありません</div>
                    ) : (
                      <div style={{ border:`1.5px solid ${C.border}`, borderRadius:10, padding:"4px 10px", marginBottom:12, background:"#fff" }}>
                        {pesticides.map(p => (
                          <div key={p.id} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:6, marginBottom:6 }}>
                            <label style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer" }}>
                              <input
                                type="checkbox"
                                checked={selectedPesticides.includes(p.id)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedPesticides(prev => [...prev, p.id]);
                                  } else {
                                    setSelectedPesticides(prev => prev.filter(id => id !== p.id));
                                    setPesticideAmounts(prev => { const next = { ...prev }; delete next[p.id]; return next; });
                                  }
                                }}
                                style={{ accentColor:C.primary, width:16, height:16, cursor:"pointer", flexShrink:0 }}
                              />
                              <span style={{ fontSize:13, color:C.text, fontWeight:500 }}>{p.name}</span>
                              <span style={{ fontSize:11, color:C.textMuted, background:C.bg, borderRadius:4, padding:"1px 6px", flexShrink:0 }}>{p.type}</span>
                            </label>
                            {selectedPesticides.includes(p.id) && (
                              <input
                                placeholder="散布量（例: 100ml、1L）"
                                value={pesticideAmounts[p.id] || ""}
                                onChange={e => setPesticideAmounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                                style={{ ...S.input, marginLeft:24, marginBottom:0, width:"calc(100% - 24px)", boxSizing:"border-box" as const, fontSize:13, padding:"8px 12px" }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={S.lbl}><Droplets size={13} strokeWidth={2} />土壌pH（任意）</div>
                    <input
                      type="number" placeholder="例: 6.5" min="0" max="14" step="0.1"
                      value={soilPh} onChange={e => setSoilPh(e.target.value)}
                      style={S.input}
                    />

                    <div style={S.lbl}><PenLine size={13} strokeWidth={2} />メモ</div>
                    <div style={{ position:"relative", marginBottom:12 }}>
                      <input style={{ ...S.input, marginBottom:0, paddingRight: hasSpeech ? 44 : 14 }} placeholder="気づいたことなど" value={rForm.note} onChange={e => setRForm(f => ({ ...f, note:e.target.value }))} />
                      {hasSpeech && (
                        <button onClick={toggleNoteVoice} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background: noteListening ? "#fdecea" : "transparent", border:`1.5px solid ${noteListening ? "#e53935" : C.border}`, borderRadius:6, padding:"4px 6px", cursor:"pointer", display:"flex", alignItems:"center", color: noteListening ? "#e53935" : C.textMuted, animation: noteListening ? "pulse 1s infinite" : "none" }}>
                          {noteListening ? <MicOff size={14} strokeWidth={2} /> : <Mic size={14} strokeWidth={2} />}
                        </button>
                      )}
                    </div>

                    <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addReportInline} disabled={submitting}>
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />登録中...</> : <><ClipboardList size={16} strokeWidth={2} />作業報告を保存する</>}
                    </button>
                  </div>
                )}
              </>
            )}
            </div>
          )}
        </div>
      )}

      {/* ───── PESTICIDES ───── */}
      {tab === "pesticides" && (
        <div style={S.page}>

          {isAdmin && (
            <>
              <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />農薬を追加</div>
              <div style={S.card}>
                {!pManualMode ? (
                  <>
                    {/* マスタ検索モード */}
                    <div style={S.lbl}><Search size={13} strokeWidth={2} />農薬名で検索</div>
                    <div style={{ position:"relative", marginBottom:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <input
                          style={{ ...S.input, marginBottom:0, flex:1 }}
                          placeholder="例: スミチオン、ラウンドアップ..."
                          value={masterSearch}
                          onChange={e => handleMasterSearchChange(e.target.value)}
                          autoComplete="off"
                        />
                        {masterSearching && <RefreshCw size={14} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />}
                      </div>
                      {masterResults.length > 0 && (
                        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:60, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", marginTop:4, maxHeight:220, overflowY:"auto" }}>
                          {masterResults.map(m => (
                            <button
                              key={m.id}
                              onClick={() => selectMaster(m)}
                              style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" as const, display:"flex", flexDirection:"column" as const, gap:2 }}
                            >
                              <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{m.name}</span>
                              <div style={{ display:"flex", gap:6 }}>
                                {m.type && <span style={{ fontSize:11, color:"#7b1fa2", background:"#f3e5f5", borderRadius:5, padding:"1px 6px", fontWeight:600 }}>{m.type}</span>}
                                {m.dilution_rate && <span style={{ fontSize:11, color:C.textMuted }}>{m.dilution_rate}</span>}
                                {m.company && <span style={{ fontSize:11, color:C.textMuted }}>{m.company}</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedMaster && (
                      <div style={{ background:C.primary3, borderRadius:10, padding:"10px 12px", marginBottom:12, border:`1px solid ${C.primary4}`, display:"flex", alignItems:"center", gap:8 }}>
                        <FlaskConical size={14} color={C.primary} strokeWidth={2} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{selectedMaster.name}</div>
                          <div style={{ fontSize:11, color:C.textMuted }}>{selectedMaster.type}{selectedMaster.dilution_rate ? ` / ${selectedMaster.dilution_rate}` : ""}</div>
                        </div>
                      </div>
                    )}
                    {/* 備考（マスタ選択後も入力可） */}
                    {selectedMaster && (
                      <>
                        <div style={S.lbl}><PenLine size={13} strokeWidth={2} />備考（任意）</div>
                        <input style={S.input} placeholder="使用上の注意など" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes:e.target.value }))} />
                      </>
                    )}
                    <button
                      style={{ ...S.btn, opacity:(!selectedMaster || submitting)?0.5:1 }}
                      onClick={addPesticide}
                      disabled={!selectedMaster || submitting}
                    >
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />この農薬を登録する</>}
                    </button>
                    <button
                      onClick={() => { setPManualMode(true); resetPesticideForm(); }}
                      style={{ width:"100%", padding:"8px 0", background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMuted, textDecoration:"underline", marginTop:4 }}
                    >
                      リストにない農薬を手動で追加
                    </button>
                  </>
                ) : (
                  <>
                    {/* 手動入力モード */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textSub }}>自分で入力する</div>
                      <button
                        onClick={() => { setPManualMode(false); resetPesticideForm(); }}
                        style={{ fontSize:12, color:C.primary, background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}
                      >
                        検索から選ぶ
                      </button>
                    </div>
                    <div style={S.lbl}><FlaskConical size={13} strokeWidth={2} />農薬名 *</div>
                    <input style={S.input} placeholder="例: スミチオン" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name:e.target.value }))} />
                    <div style={S.lbl}><FlaskConical size={13} strokeWidth={2} />種別</div>
                    <select style={S.select} value={pForm.type} onChange={e => setPForm(f => ({ ...f, type:e.target.value }))}>
                      {["殺虫剤","殺菌剤","除草剤","その他"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />希釈倍数</div>
                    <input style={S.input} placeholder="例: 1000倍" value={pForm.dilution_rate} onChange={e => setPForm(f => ({ ...f, dilution_rate:e.target.value }))} />
                    <div style={S.lbl}><PenLine size={13} strokeWidth={2} />備考</div>
                    <input style={S.input} placeholder="注意事項など" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes:e.target.value }))} />
                    <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addPesticide} disabled={submitting}>
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />この農薬を登録する</>}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div style={S.sec}><FlaskConical size={14} strokeWidth={2} />登録済みの農薬</div>
          {pesticides.length === 0 ? (
            <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
              <div style={{ background:"#f3e5f5", borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <FlaskConical size={22} color="#7b1fa2" strokeWidth={1.5} />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>農薬が登録されていません</div>
              <div style={{ fontSize:12, color:C.textMuted }}>上のフォームから追加できます</div>
            </div>
          ) : pesticides.map(p => (
            <div key={p.id} style={S.card}>
              <div style={S.row}>
                <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                  <div style={{ background:"#f3e5f5", borderRadius:10, padding:8, flexShrink:0 }}>
                    <FlaskConical size={18} color="#7b1fa2" strokeWidth={1.8} />
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{p.name}</span>
                    </div>
                    <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" as const }}>
                      <span style={{ fontSize:11, background:"#f3e5f5", color:"#7b1fa2", borderRadius:6, padding:"1px 7px", fontWeight:600 }}>{p.type}</span>
                      {p.dilution_rate && <span style={{ fontSize:11, color:C.textMuted }}>{p.dilution_rate}</span>}
                    </div>
                    {p.notes && <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{p.notes}</div>}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => setOpenMenuId(openMenuId === `ps${p.id}` ? null : `ps${p.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", borderRadius:8, color:C.textMuted, display:"flex" }}>
                      <MoreVertical size={18} strokeWidth={2} />
                    </button>
                    {openMenuId === `ps${p.id}` && (
                      <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                        <button onClick={() => { setOpenMenuId(null); deletePesticide(p.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                          <Trash2 size={13} strokeWidth={2} />削除
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ───── MANAGE ───── */}
      {tab === "manage" && (
        <div style={S.page}>
          {/* 作物 */}
          {manageSubTab === "crops" && <>
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowCropAddForm(p => !p)}
                  style={{ ...S.sec, background:"none", border:"none", cursor:"pointer", width:"100%", justifyContent:"space-between" }}
                >
                  <span style={{ display:"flex", alignItems:"center", gap:6 }}><PlusCircle size={14} strokeWidth={2} />作物を追加</span>
                  <span style={{ fontSize:16, color:C.primary, fontWeight:700 }}>{showCropAddForm ? "−" : "+"}</span>
                </button>
                {showCropAddForm && (
                  <div style={{ ...S.card, animation:"slideDown 0.15s ease" }}>
                    <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物名 *</div>
                    <input style={S.input} placeholder="例: キャベツ" value={cForm.name} onChange={e => setCForm(f => ({ ...f, name:e.target.value }))} />
                    <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />作付け日</div>
                    <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={cForm.start_date} onChange={e => setCForm(f => ({ ...f, start_date:e.target.value }))} />
                    <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />目標収穫量（kg/年・任意）</div>
                    <input type="number" style={S.input} placeholder="例: 500" min="0" value={cForm.target_yield} onChange={e => setCForm(f => ({ ...f, target_yield:e.target.value }))} />
                    <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addCrop} disabled={submitting}>
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />作物を追加</>}
                    </button>
                  </div>
                )}
              </>
            )}
            <div style={S.sec}><Leaf size={14} strokeWidth={2} />登録作物</div>
            {crops.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}><Leaf size={22} color={C.primary} strokeWidth={1.5} /></div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>作物が登録されていません</div>
                <div style={{ fontSize:12, color:C.textMuted }}>上のフォームから追加できます</div>
              </div>
            ) : crops.map(c => {
              const ci = getCropIcon(c.name);
              return (
                <div key={c.id} style={{ ...S.card, cursor:"pointer" }} onClick={() => setSelectedCropId(c.id)}>
                  <div style={S.row}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                      <div style={{ background:ci.bg, borderRadius:10, padding:8, flexShrink:0 }}><ci.Icon size={18} color={ci.color} strokeWidth={1.8} /></div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:C.text, whiteSpace:"nowrap" as const }}>{c.name}</div>
                        <div style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:4, marginTop:2, whiteSpace:"nowrap" as const }}><CalendarDays size={11} strokeWidth={2} />{c.start_date}</div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setOpenMenuId(openMenuId === `mc${c.id}` ? null : `mc${c.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", borderRadius:8, color:C.textMuted, display:"flex" }}>
                          <MoreVertical size={18} strokeWidth={2} />
                        </button>
                        {openMenuId === `mc${c.id}` && (
                          <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                            <button onClick={() => { setOpenMenuId(null); deleteCrop(c.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                              <Trash2 size={13} strokeWidth={2} />削除
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>}

          {/* 圃場 */}
          {manageSubTab === "fields" && <>
            {isAdmin && (
              <>
                <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />圃場を追加</div>
                <div style={S.card}>
                  <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場名 *</div>
                  <input style={S.input} placeholder="例: A圃場" value={fForm.name} onChange={e => setFForm({ name:e.target.value })} />
                  <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addField} disabled={submitting}>
                    {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />圃場を追加</>}
                  </button>
                </div>
              </>
            )}
            <div style={S.sec}><MapPin size={14} strokeWidth={2} />登録圃場</div>
            {fields.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}><MapPin size={22} color={C.primary} strokeWidth={1.5} /></div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>圃場が登録されていません</div>
                <div style={{ fontSize:12, color:C.textMuted }}>上のフォームから追加できます</div>
              </div>
            ) : fields.map(f => (
              <div key={f.id} style={S.card}>
                <div style={S.row}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                    <div style={{ background: f.lat ? C.primary3 : C.bg, borderRadius:9, padding:7, flexShrink:0 }}>
                      <MapPin size={16} color={f.lat ? C.primary : C.textMuted} strokeWidth={1.8} />
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:C.text, whiteSpace:"nowrap" as const }}>{f.name}</div>
                      <div style={{ fontSize:11, color:C.textMuted, whiteSpace:"nowrap" as const }}>{f.lat ? `${f.lat.toFixed(4)}, ${f.lng?.toFixed(4)}` : "位置未設定"}</div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                      <button style={{ ...S.btnSm, background:C.primary3, color:C.primary, border:`1.5px solid ${C.primary4}` }} onClick={() => setFieldLocation(f.id)}>
                        <Navigation size={12} strokeWidth={2} />現在地
                      </button>
                      <div style={{ position:"relative" }}>
                        <button onClick={() => setOpenMenuId(openMenuId === `mf${f.id}` ? null : `mf${f.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", borderRadius:8, color:C.textMuted, display:"flex" }}>
                          <MoreVertical size={18} strokeWidth={2} />
                        </button>
                        {openMenuId === `mf${f.id}` && (
                          <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                            <button onClick={() => { setOpenMenuId(null); deleteField(f.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                              <Trash2 size={13} strokeWidth={2} />削除
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {(() => {
                  const history = getFieldCropHistory(f.name);
                  return (
                    <div style={{ borderTop:`1px solid ${C.border}`, marginTop:10, paddingTop:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.textSub, marginBottom:6, display:"flex", alignItems:"center", gap:4 }}>
                        <Leaf size={11} strokeWidth={2} />作付け履歴
                      </div>
                      {history.length === 0 ? (
                        <div style={{ fontSize:11, color:C.textMuted }}>記録なし</div>
                      ) : (
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign:"left", color:C.textMuted, fontWeight:600, paddingBottom:4 }}>作物</th>
                              <th style={{ textAlign:"left", color:C.textMuted, fontWeight:600, paddingBottom:4 }}>最終作業</th>
                              <th style={{ textAlign:"right", color:C.textMuted, fontWeight:600, paddingBottom:4 }}>作業回数</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map(h => (
                              <tr key={h.crop_id} style={{ borderTop:`1px solid ${C.border}` }}>
                                <td style={{ padding:"4px 0", color:C.text, fontWeight:600 }}>{h.cropName}</td>
                                <td style={{ padding:"4px 0", color:C.textSub }}>{h.lastDate}</td>
                                <td style={{ padding:"4px 0", textAlign:"right", color:C.primary, fontWeight:700 }}>{h.count}回</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </>}

          {/* 農薬 */}
          {manageSubTab === "pesticides" && <>
            {isAdmin && (
              <>
                <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />農薬を追加</div>
                <div style={S.card}>
                  {!pManualMode ? (
                    <>
                      <div style={S.lbl}><Search size={13} strokeWidth={2} />農薬名で検索</div>
                      <div style={{ position:"relative", marginBottom:12 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <input style={{ ...S.input, marginBottom:0, flex:1 }} placeholder="例: スミチオン、ラウンドアップ..." value={masterSearch} onChange={e => handleMasterSearchChange(e.target.value)} autoComplete="off" />
                          {masterSearching && <RefreshCw size={14} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />}
                        </div>
                        {masterResults.length > 0 && (
                          <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:60, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", marginTop:4, maxHeight:220, overflowY:"auto" }}>
                            {masterResults.map(m => (
                              <button key={m.id} onClick={() => selectMaster(m)} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" as const, display:"flex", flexDirection:"column" as const, gap:2 }}>
                                <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{m.name}</span>
                                <div style={{ display:"flex", gap:6 }}>
                                  {m.type && <span style={{ fontSize:11, color:"#7b1fa2", background:"#f3e5f5", borderRadius:5, padding:"1px 6px", fontWeight:600 }}>{m.type}</span>}
                                  {m.dilution_rate && <span style={{ fontSize:11, color:C.textMuted }}>{m.dilution_rate}</span>}
                                  {m.company && <span style={{ fontSize:11, color:C.textMuted }}>{m.company}</span>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedMaster && (
                        <div style={{ background:C.primary3, borderRadius:10, padding:"10px 12px", marginBottom:12, border:`1px solid ${C.primary4}`, display:"flex", alignItems:"center", gap:8 }}>
                          <FlaskConical size={14} color={C.primary} strokeWidth={2} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{selectedMaster.name}</div>
                            <div style={{ fontSize:11, color:C.textMuted }}>{selectedMaster.type}{selectedMaster.dilution_rate ? ` / ${selectedMaster.dilution_rate}` : ""}</div>
                          </div>
                        </div>
                      )}
                      {selectedMaster && (
                        <>
                          <div style={S.lbl}><PenLine size={13} strokeWidth={2} />備考（任意）</div>
                          <input style={S.input} placeholder="使用上の注意など" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes:e.target.value }))} />
                        </>
                      )}
                      <button style={{ ...S.btn, opacity:(!selectedMaster || submitting)?0.5:1 }} onClick={addPesticide} disabled={!selectedMaster || submitting}>
                        {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />この農薬を登録する</>}
                      </button>
                      <button onClick={() => { setPManualMode(true); resetPesticideForm(); }} style={{ width:"100%", padding:"8px 0", background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMuted, textDecoration:"underline", marginTop:4 }}>
                        リストにない農薬を手動で追加
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.textSub }}>自分で入力する</div>
                        <button onClick={() => { setPManualMode(false); resetPesticideForm(); }} style={{ fontSize:12, color:C.primary, background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>検索から選ぶ</button>
                      </div>
                      <div style={S.lbl}><FlaskConical size={13} strokeWidth={2} />農薬名 *</div>
                      <input style={S.input} placeholder="例: スミチオン" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name:e.target.value }))} />
                      <div style={S.lbl}><FlaskConical size={13} strokeWidth={2} />種別</div>
                      <select style={S.select} value={pForm.type} onChange={e => setPForm(f => ({ ...f, type:e.target.value }))}>
                        {["殺虫剤","殺菌剤","除草剤","その他"].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />希釈倍数</div>
                      <input style={S.input} placeholder="例: 1000倍" value={pForm.dilution_rate} onChange={e => setPForm(f => ({ ...f, dilution_rate:e.target.value }))} />
                      <div style={S.lbl}><PenLine size={13} strokeWidth={2} />備考</div>
                      <input style={S.input} placeholder="注意事項など" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes:e.target.value }))} />
                      <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addPesticide} disabled={submitting}>
                        {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />この農薬を登録する</>}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            <div style={S.sec}><FlaskConical size={14} strokeWidth={2} />登録済みの農薬</div>
            {pesticides.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ background:"#f3e5f5", borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}><FlaskConical size={22} color="#7b1fa2" strokeWidth={1.5} /></div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>農薬が登録されていません</div>
                <div style={{ fontSize:12, color:C.textMuted }}>上のフォームから追加できます</div>
              </div>
            ) : pesticides.map(p => (
              <div key={p.id} style={S.card}>
                <div style={S.row}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                    <div style={{ background:"#f3e5f5", borderRadius:10, padding:8, flexShrink:0 }}><FlaskConical size={18} color="#7b1fa2" strokeWidth={1.8} /></div>
                    <div style={{ minWidth:0 }}>
                      <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{p.name}</span>
                      <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" as const }}>
                        <span style={{ fontSize:11, background:"#f3e5f5", color:"#7b1fa2", borderRadius:6, padding:"1px 7px", fontWeight:600 }}>{p.type}</span>
                        {p.dilution_rate && <span style={{ fontSize:11, color:C.textMuted }}>{p.dilution_rate}</span>}
                      </div>
                      {p.notes && <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{p.notes}</div>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setOpenMenuId(openMenuId === `mp${p.id}` ? null : `mp${p.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", borderRadius:8, color:C.textMuted, display:"flex" }}>
                        <MoreVertical size={18} strokeWidth={2} />
                      </button>
                      {openMenuId === `mp${p.id}` && (
                        <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                          <button onClick={() => { setOpenMenuId(null); deletePesticide(p.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                            <Trash2 size={13} strokeWidth={2} />削除
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>}

          {false && false && (
            <div>
              {/* 計画追加フォーム（管理者のみ） */}
              {isAdmin && (
                <>
                  {showAddProject ? (
                    <div style={S.card}>
                      <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><PlusCircle size={15} strokeWidth={2} color={C.primary} />新しい計画を登録</div>
                      <div style={S.lbl}><ClipboardList size={13} strokeWidth={2} />計画名 *</div>
                      <input style={S.input} placeholder="例: 2024年 ぶどう栽培" value={prjForm.name} onChange={e => setPrjForm(f => ({ ...f, name:e.target.value }))} />
                      <div style={{ display:"flex", gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物（任意）</div>
                          <select style={S.select} value={prjForm.crop_id} onChange={e => setPrjForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                            <option value={0}>未指定</option>
                            {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場（任意）</div>
                          <select style={S.select} value={prjForm.field} onChange={e => setPrjForm(f => ({ ...f, field:e.target.value }))}>
                            <option value="">未指定</option>
                            {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />開始日</div>
                          <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={prjForm.start_date} onChange={e => setPrjForm(f => ({ ...f, start_date:e.target.value }))} />
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />終了予定日</div>
                          <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={prjForm.end_date} onChange={e => setPrjForm(f => ({ ...f, end_date:e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button style={{ ...S.btn, flex:1, width:"auto", opacity:submitting?0.7:1 }} onClick={addProject} disabled={submitting}>
                          {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />追加する</>}
                        </button>
                        <button onClick={() => setShowAddProject(false)} style={{ flex:1, padding:"12px 0", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.bg, color:C.textSub, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddProject(true)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:13, fontWeight:700, color:C.primary, padding:"2px 0", marginBottom:10 }}>
                      <PlusCircle size={14} strokeWidth={2} />計画を追加
                    </button>
                  )}
                </>
              )}

              <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />計画一覧</div>
              {projects.length === 0 ? (
                <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                  <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}><ClipboardList size={22} color={C.primary} strokeWidth={1.5} /></div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>計画がありません</div>
                  {isAdmin && <div style={{ fontSize:12, color:C.textMuted }}>上のボタンから追加できます</div>}
                </div>
              ) : projects.map(project => {
                const projTickets = tickets.filter(t => t.project_id === project.id);
                const doneCount   = projTickets.filter(t => t.status === "done").length;
                const cropLabel   = crops.find(c => c.id === project.crop_id)?.name;
                return (
                  <div key={project.id} style={{ ...S.card, marginBottom:12 }}>
                    {/* 計画ヘッダー */}
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:3 }}>{project.name}</div>
                        <div style={{ fontSize:11, color:C.textMuted, display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                          {cropLabel && <span style={{ display:"flex", alignItems:"center", gap:3 }}><Leaf size={10} strokeWidth={2} />{cropLabel}</span>}
                          {project.field && <span style={{ display:"flex", alignItems:"center", gap:3 }}><MapPin size={10} strokeWidth={2} />{project.field}</span>}
                          {project.end_date && <span style={{ display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={10} strokeWidth={2} />〜{project.end_date}</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                        <span style={{ fontSize:11, fontWeight:700, background:doneCount === projTickets.length && projTickets.length > 0 ? C.primary3 : C.bg, color:doneCount === projTickets.length && projTickets.length > 0 ? C.primary : C.textMuted, borderRadius:8, padding:"3px 9px", border:`1px solid ${doneCount === projTickets.length && projTickets.length > 0 ? C.primary4 : C.border}` }}>
                          {doneCount}/{projTickets.length} 完了
                        </span>
                        {isAdmin && (
                          <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => setOpenMenuId(openMenuId === `prj${project.id}` ? null : `prj${project.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 4px", borderRadius:6, color:C.textMuted, display:"flex" }}>
                              <MoreVertical size={15} strokeWidth={2} />
                            </button>
                            {openMenuId === `prj${project.id}` && (
                              <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                                <button onClick={() => { setOpenMenuId(null); deleteProject(project.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                                  <Trash2 size={13} strokeWidth={2} />削除
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* チケット一覧 */}
                    {projTickets.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        {[...projTickets].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).map(ticket => (
                          <div key={ticket.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:9, background: ticket.status === "done" ? C.primary3 : C.bg, marginBottom:4 }}>
                            <button onClick={() => toggleTicketStatus(ticket)} style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", flexShrink:0 }}>
                              {ticket.status === "done"
                                ? <PackageCheck size={15} color={C.primary} strokeWidth={2} />
                                : <Clock size={15} color={C.textMuted} strokeWidth={2} />}
                            </button>
                            <span style={{ flex:1, fontSize:13, color: ticket.status === "done" ? C.textMuted : C.text, textDecoration: ticket.status === "done" ? "line-through" : "none", minWidth:0 }}>{ticket.title}</span>
                            {ticket.work_type && <span style={{ fontSize:10, color:C.primary, background:C.primary3, borderRadius:5, padding:"1px 6px", flexShrink:0 }}>{ticket.work_type}</span>}
                            <span style={{ fontSize:11, color:C.textMuted, flexShrink:0 }}>{users.find(u => u.id === ticket.assigned_user_id)?.name ?? "未割当"}</span>
                            {ticket.due_date && <span style={{ fontSize:10, color:C.textMuted, flexShrink:0 }}>{ticket.due_date}</span>}
                            {isAdmin && (
                              <button onClick={() => deleteTicket(ticket.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", flexShrink:0, color:C.textMuted }}>
                                <X size={13} strokeWidth={2} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* チケット追加フォーム */}
                    {isAdmin && (
                      addingTicketProjectId === project.id ? (
                        <div style={{ background:C.bg, borderRadius:10, padding:"10px 12px", border:`1px solid ${C.border}` }}>
                          <input style={{ ...S.input, marginBottom:8 }} placeholder="チケットのタイトル *" value={tForm.title} onChange={e => setTForm(f => ({ ...f, title:e.target.value }))} />
                          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                            <select style={{ ...S.select, marginBottom:0, flex:1 }} value={tForm.work_type} onChange={e => setTForm(f => ({ ...f, work_type:e.target.value }))}>
                              <option value="">作業種別（任意）</option>
                              {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select style={{ ...S.select, marginBottom:0, flex:1 }} value={tForm.assigned_user_id} onChange={e => setTForm(f => ({ ...f, assigned_user_id:Number(e.target.value) }))}>
                              <option value={0}>担当者（任意）</option>
                              {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div style={{ display:"flex", gap:8 }}>
                            <input type="date" style={{ ...S.input, marginBottom:0, flex:1, maxWidth:"100%" }} value={tForm.due_date} onChange={e => setTForm(f => ({ ...f, due_date:e.target.value }))} />
                            <button onClick={() => addTicket(project.id)} disabled={submitting} style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, border:"none", borderRadius:10, padding:"0 16px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", opacity:submitting?0.7:1, flexShrink:0 }}>
                              {submitting ? <RefreshCw size={14} strokeWidth={2} /> : <Save size={14} strokeWidth={2} />}
                            </button>
                            <button onClick={() => { setAddingTicketProjectId(null); setTForm({ title:"", work_type:"収穫", assigned_user_id:0, due_date:"" }); }} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"0 12px", color:C.textSub, fontSize:13, cursor:"pointer", flexShrink:0 }}>
                              <X size={14} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingTicketProjectId(project.id); setTForm({ title:"", work_type:"収穫", assigned_user_id:0, due_date:"" }); }} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:C.primary, background:"none", border:`1px solid ${C.primary4}`, borderRadius:8, padding:"5px 12px", cursor:"pointer", fontWeight:600 }}>
                          <Plus size={13} strokeWidth={2.5} />チケット追加
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {false && isAdmin && (() => {
            const weeklyProgress = getWeeklyProgress(progressWeekStart);
            const weekEnd = new Date(progressWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const weekLabel = `${progressWeekStart.getMonth()+1}/${progressWeekStart.getDate()} 〜 ${weekEnd.getMonth()+1}/${weekEnd.getDate()}`;
            const weekDays = ["月","火","水","木","金","土","日"];
            return (
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.textSub, display:"flex", alignItems:"center", gap:6 }}>
                    <Users size={14} strokeWidth={2} />担当者進捗
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <button
                      onClick={() => { const d = new Date(progressWeekStart); d.setDate(d.getDate() - 7); setProgressWeekStart(d); }}
                      style={{ background:C.primary3, border:"none", borderRadius:7, padding:"4px 8px", cursor:"pointer", color:C.primary, display:"flex", alignItems:"center" }}
                    ><ChevronLeft size={14} strokeWidth={2.5} /></button>
                    <span style={{ fontSize:12, fontWeight:600, color:C.text, minWidth:110, textAlign:"center" as const }}>{weekLabel}</span>
                    <button
                      onClick={() => { const d = new Date(progressWeekStart); d.setDate(d.getDate() + 7); setProgressWeekStart(d); }}
                      style={{ background:C.primary3, border:"none", borderRadius:7, padding:"4px 8px", cursor:"pointer", color:C.primary, display:"flex", alignItems:"center" }}
                    ><ChevronRight size={14} strokeWidth={2.5} /></button>
                  </div>
                </div>

                <div style={{ overflowX:"auto" as const, background:C.card, borderRadius:14, border:`1px solid ${C.border}`, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", marginBottom:10 }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                    <thead>
                      <tr style={{ background:C.bg }}>
                        <th style={{ textAlign:"left" as const, padding:"8px 12px", borderBottom:`1px solid ${C.border}`, color:C.textSub, fontWeight:600, whiteSpace:"nowrap" as const, minWidth:64 }}>担当者</th>
                        {weekDays.map((d, i) => (
                          <th key={d} style={{ padding:"8px 6px", borderBottom:`1px solid ${C.border}`, color: i >= 5 ? C.danger : C.textSub, fontWeight:600, textAlign:"center" as const, minWidth:40 }}>{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyProgress.map(({ user, days: userDays }) => (
                        <tr key={user.id}>
                          <td style={{ padding:"8px 12px", borderBottom:`1px solid ${C.border}`, color:C.text, fontWeight:700, whiteSpace:"nowrap" as const }}>{user.name}</td>
                          {userDays.map(({ date, schedules: ds, reports: rs, matched }) => (
                            <td key={date} style={{ padding:"6px 4px", borderBottom:`1px solid ${C.border}`, textAlign:"center" as const }}>
                              {ds.length === 0 && rs.length === 0 && (
                                <span style={{ color:C.border, fontSize:12 }}>─</span>
                              )}
                              {ds.length > 0 && matched.length === ds.length && (
                                <span title="予定あり・完了" style={{ display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                                  <PackageCheck size={15} color={C.primary} strokeWidth={2} />
                                </span>
                              )}
                              {ds.length > 0 && matched.length < ds.length && (
                                <span title={`予定${ds.length}件・完了${matched.length}件`} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:2 }}>
                                  <Clock size={13} color="#f57f17" strokeWidth={2} />
                                  <span style={{ fontSize:10, color:"#f57f17", fontWeight:700 }}>{matched.length}/{ds.length}</span>
                                </span>
                              )}
                              {ds.length === 0 && rs.length > 0 && (
                                <span title="予定外の作業あり" style={{ display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                                  <PenLine size={13} color={C.textMuted} strokeWidth={2} />
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display:"flex", gap:12, fontSize:11, color:C.textMuted, paddingLeft:2, flexWrap:"wrap" as const, alignItems:"center" }}>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><PackageCheck size={13} color={C.primary} strokeWidth={2} /> 全予定完了</span>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><Clock size={12} color="#f57f17" strokeWidth={2} /> 一部未完了</span>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><PenLine size={12} color={C.textMuted} strokeWidth={2} /> 予定外作業</span>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ color:C.border }}>─</span> なし</span>
                </div>
              </div>
            );
          })()}

          {/* マップ */}
          {false && (
            <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}`, height:"60vh", marginBottom:16 }}>
              <MapContainer
                center={userPos ?? [weatherCoords?.lat ?? 35.0167, weatherCoords?.lng ?? 135.5833]}
                zoom={15}
                style={{ width:"100%", height:"100%" }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                {userPos && (
                  <Marker position={userPos as [number,number]} icon={PIN_BLUE}>
                    <Popup><b>現在地</b></Popup>
                  </Marker>
                )}
                {fields.filter(f => f.lat && f.lng).map(f => (
                  <Marker key={f.id} position={[f.lat!, f.lng!]} icon={PIN_GREEN}>
                    <Popup><b>{f.name}</b></Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>
      )}

      {/* ───── CROPS ───── */}
      {tab === "crops" && (
        <div style={S.page}>
          {/* ⑩ 作物 / 圃場 サブタブ */}
          <div style={{ display:"flex", background:C.bg, borderRadius:10, padding:3, marginBottom:14, border:`1px solid ${C.border}` }}>
            {(["crops","fields"] as const).map(k => (
              <button key={k} onClick={() => setCropListTab(k)} style={{ flex:1, padding:"8px 0", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.15s", background: cropListTab === k ? C.card : "transparent", color: cropListTab === k ? C.primary : C.textMuted, boxShadow: cropListTab === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
                {k === "crops" ? "作物" : "圃場"}
              </button>
            ))}
          </div>

          {cropListTab === "crops" && <>
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowCropAddForm(p => !p)}
                  style={{ ...S.sec, background:"none", border:"none", cursor:"pointer", width:"100%", justifyContent:"space-between" }}
                >
                  <span style={{ display:"flex", alignItems:"center", gap:6 }}><PlusCircle size={14} strokeWidth={2} />作物を追加</span>
                  <span style={{ fontSize:16, color:C.primary, fontWeight:700 }}>{showCropAddForm ? "−" : "+"}</span>
                </button>
                {showCropAddForm && (
                  <div style={{ ...S.card, animation:"slideDown 0.15s ease" }}>
                    <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物名 *</div>
                    <input style={S.input} placeholder="例: キャベツ" value={cForm.name} onChange={e => setCForm(f => ({ ...f, name:e.target.value }))} />
                    <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />作付け日</div>
                    <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={cForm.start_date} onChange={e => setCForm(f => ({ ...f, start_date:e.target.value }))} />
                    <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />目標収穫量（kg/年・任意）</div>
                    <input type="number" style={S.input} placeholder="例: 500" min="0" value={cForm.target_yield} onChange={e => setCForm(f => ({ ...f, target_yield:e.target.value }))} />
                    <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addCrop} disabled={submitting}>
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />作物を追加</>}
                    </button>
                  </div>
                )}
              </>
            )}
            <div style={S.sec}><Leaf size={14} strokeWidth={2} />登録作物</div>
            {crops.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                  <Leaf size={22} color={C.primary} strokeWidth={1.5} />
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>作物が登録されていません</div>
                <div style={{ fontSize:12, color:C.textMuted }}>上のフォームから追加できます</div>
              </div>
            ) : crops.map(c => {
              const ci = getCropIcon(c.name);
              return (
                <div key={c.id} style={{ ...S.card, cursor:"pointer" }} onClick={() => setSelectedCropId(c.id)}>
                  <div style={S.row}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                      <div style={{ background:ci.bg, borderRadius:10, padding:8, flexShrink:0 }}><ci.Icon size={18} color={ci.color} strokeWidth={1.8} /></div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:C.text, whiteSpace:"nowrap" as const }}>{c.name}</div>
                        <div style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:4, marginTop:2, whiteSpace:"nowrap" as const }}>
                          <CalendarDays size={11} strokeWidth={2} />{c.start_date}
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setOpenMenuId(openMenuId === `c${c.id}` ? null : `c${c.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", borderRadius:8, color:C.textMuted, display:"flex" }}>
                          <MoreVertical size={18} strokeWidth={2} />
                        </button>
                        {openMenuId === `c${c.id}` && (
                          <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                            <button onClick={() => { setOpenMenuId(null); deleteCrop(c.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                              <Trash2 size={13} strokeWidth={2} />削除
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>}

          {cropListTab === "fields" && <>
            {isAdmin && (
              <>
                <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />圃場を追加</div>
                <div style={S.card}>
                  <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場名 *</div>
                  <input style={S.input} placeholder="例: A圃場" value={fForm.name} onChange={e => setFForm({ name:e.target.value })} />
                  <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addField} disabled={submitting}>
                    {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />圃場を追加</>}
                  </button>
                </div>
              </>
            )}
            <div style={S.sec}><MapPin size={14} strokeWidth={2} />登録圃場</div>
            {fields.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                  <MapPin size={22} color={C.primary} strokeWidth={1.5} />
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>圃場が登録されていません</div>
                <div style={{ fontSize:12, color:C.textMuted }}>上のフォームから追加できます</div>
              </div>
            ) : fields.map(f => (
              <div key={f.id} style={S.card}>
                <div style={S.row}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                    <div style={{ background: f.lat ? C.primary3 : C.bg, borderRadius:9, padding:7, flexShrink:0 }}>
                      <MapPin size={16} color={f.lat ? C.primary : C.textMuted} strokeWidth={1.8} />
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:C.text, whiteSpace:"nowrap" as const }}>{f.name}</div>
                      <div style={{ fontSize:11, color:C.textMuted, whiteSpace:"nowrap" as const }}>{f.lat ? `${f.lat.toFixed(4)}, ${f.lng?.toFixed(4)}` : "位置未設定"}</div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                      <button style={{ ...S.btnSm, background:C.primary3, color:C.primary, border:`1.5px solid ${C.primary4}` }} onClick={() => setFieldLocation(f.id)}>
                        <Navigation size={12} strokeWidth={2} />現在地
                      </button>
                      <div style={{ position:"relative" }}>
                        <button onClick={() => setOpenMenuId(openMenuId === `f${f.id}` ? null : `f${f.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 6px", borderRadius:8, color:C.textMuted, display:"flex" }}>
                          <MoreVertical size={18} strokeWidth={2} />
                        </button>
                        {openMenuId === `f${f.id}` && (
                          <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                            <button onClick={() => { setOpenMenuId(null); deleteField(f.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                              <Trash2 size={13} strokeWidth={2} />削除
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {(() => {
                  const history = getFieldCropHistory(f.name);
                  return (
                    <div style={{ borderTop:`1px solid ${C.border}`, marginTop:10, paddingTop:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.textSub, marginBottom:6, display:"flex", alignItems:"center", gap:4 }}>
                        <Leaf size={11} strokeWidth={2} />作付け履歴
                      </div>
                      {history.length === 0 ? (
                        <div style={{ fontSize:11, color:C.textMuted }}>記録なし</div>
                      ) : (
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign:"left", color:C.textMuted, fontWeight:600, paddingBottom:4 }}>作物</th>
                              <th style={{ textAlign:"left", color:C.textMuted, fontWeight:600, paddingBottom:4 }}>最終作業</th>
                              <th style={{ textAlign:"right", color:C.textMuted, fontWeight:600, paddingBottom:4 }}>作業回数</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map(h => (
                              <tr key={h.crop_id} style={{ borderTop:`1px solid ${C.border}` }}>
                                <td style={{ padding:"4px 0", color:C.text, fontWeight:600 }}>{h.cropName}</td>
                                <td style={{ padding:"4px 0", color:C.textSub }}>{h.lastDate}</td>
                                <td style={{ padding:"4px 0", textAlign:"right", color:C.primary, fontWeight:700 }}>{h.count}回</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </>}
        </div>
      )}

      {/* ───── USERS ───── */}
      {tab === "users" && (
        <div style={S.page}>
          <div style={S.sec}><Navigation size={14} strokeWidth={2} />農場の場所設定</div>
          <div style={S.card}>
            <div style={S.lbl}><MapPin size={13} strokeWidth={2} />場所を検索</div>
            <div style={{ display:"flex", gap:8, marginBottom:12, width:"100%" }}>
              <input
                style={{ ...S.input, marginBottom:0, flex:1, minWidth:0 }}
                placeholder="例: 京都府亀岡市"
                value={locInput}
                onChange={e => { setLocInput(e.target.value); setLocPreview(null); }}
                onKeyDown={e => e.key === "Enter" && searchLocation()}
              />
              <button
                onClick={searchLocation}
                disabled={locSearching}
                style={{ background:C.primary, color:"#fff", border:"none", borderRadius:10, padding:"0 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600, opacity:locSearching?0.7:1, flexShrink:0 }}
              >
                {locSearching ? <RefreshCw size={14} strokeWidth={2} /> : <Search size={14} strokeWidth={2} />}
                検索
              </button>
            </div>
            {locPreview && (
              <div style={{ background:C.primary3, borderRadius:10, padding:"10px 14px", marginBottom:12, border:`1px solid ${C.primary4}` }}>
                <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:4 }}>{locPreview.name}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>緯度: {locPreview.lat.toFixed(4)}　経度: {locPreview.lng.toFixed(4)}</div>
              </div>
            )}
            {!locPreview && weatherCoords && (
              <div style={{ background:C.bg, borderRadius:10, padding:"10px 14px", marginBottom:12, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:2 }}>現在の設定</div>
                <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{weatherCoords.name}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>緯度: {weatherCoords.lat.toFixed(4)}　経度: {weatherCoords.lng.toFixed(4)}</div>
              </div>
            )}
            <button
              style={{ ...S.btn, opacity:(!locPreview || locSaving) ? 0.5 : 1 }}
              disabled={!locPreview || locSaving}
              onClick={saveLocation}
            >
              {locSaving ? <><RefreshCw size={16} strokeWidth={2} />保存中...</> : <><Save size={16} strokeWidth={2} />この場所を保存</>}
            </button>
          </div>

          <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />アカウントを作成</div>
          <div style={S.card}>
            <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />名前 *</div>
            <input style={S.input} placeholder="例: 山田 三郎" value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name:e.target.value }))} />
            <div style={S.lbl}><Users size={13} strokeWidth={2} />役割</div>
            <select style={S.select} value={invForm.role} onChange={e => setInvForm(f => ({ ...f, role:e.target.value as Role }))}>
              <option value="admin">管理者</option>
              <option value="worker">作業者</option>
            </select>
            <div style={S.lbl}><KeyRound size={13} strokeWidth={2} />ユーザーID *</div>
            <input style={S.input} placeholder="例: worker-001" value={invForm.login_id} onChange={e => setInvForm(f => ({ ...f, login_id:e.target.value }))} />
            <div style={{ ...S.lbl, flexWrap:"nowrap" as const, whiteSpace:"nowrap" as const }}><KeyRound size={13} strokeWidth={2} />パスワード * <span style={{ fontWeight:400, color:C.textMuted, fontSize:11 }}>（6文字以上）</span></div>
            <input type="password" style={{ ...S.input, padding:"11px 14px" }} placeholder="パスワードを設定" value={invForm.password} onChange={e => setInvForm(f => ({ ...f, password:e.target.value }))} />
            <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={inviteUser} disabled={submitting}>
              {submitting ? <><RefreshCw size={16} strokeWidth={2} />作成中...</> : <><PlusCircle size={16} strokeWidth={2} />アカウントを作成する</>}
            </button>
          </div>

          <div style={S.sec}><Users size={14} strokeWidth={2} />登録済みユーザー</div>
          {users.map(u => (
            <div key={u.id} style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:9, padding:7, flexShrink:0 }}>
                  <UserCircle size={16} color={C.primary} strokeWidth={1.8} />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const }}>
                    <span style={{ fontWeight:700, fontSize:14, color:C.text, whiteSpace:"nowrap" as const }}>{u.name}</span>
                    <span style={tagStyle(u.role)}>{roleLabel[u.role]}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:2, whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis" }}>
                    {u.login_id ? `ID: ${u.login_id}` : <span style={{ color:"#e07020" }}>ログイン未設定</span>}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button
                  style={{ ...S.btnSm, flex:1, justifyContent:"center", background:C.primary3, color:C.primary, border:`1.5px solid ${C.primary4}` }}
                  onClick={() => { setSetAuthTarget(u); setSetAuthFormState({ login_id: u.login_id || "", password:"", confirmPass:"" }); }}
                >
                  <KeyRound size={12} strokeWidth={2} />{u.auth_id ? "変更" : "設定"}
                </button>
                <button style={{ ...S.btnSm, flex:1, justifyContent:"center" }} onClick={() => deleteUser(u.id)}>
                  <Trash2 size={12} strokeWidth={2} />削除
                </button>
              </div>
            </div>
          ))}

        </div>
      )}

      {/* ───── レポート詳細モーダル ───── */}
      {selectedReport && (() => {
        const r = selectedReport;
        const ci = getCropIcon(cropName(r.crop_id));
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", alignItems:"flex-end" }}
            onClick={() => setSelectedReport(null)}>
            <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", maxHeight:"90vh", overflowY:"auto", paddingBottom:40 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"12px auto 0" }} />
              {/* ヘッダー */}
              <div style={{ padding:"14px 16px 0", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ background:ci.bg, borderRadius:9, padding:7, flexShrink:0 }}>
                    <ci.Icon size={16} color={ci.color} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:16, color:C.text }}>{cropName(r.crop_id)}</div>
                    <div style={{ fontSize:12, color:C.textMuted, display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                      <CalendarDays size={11} strokeWidth={2} />{r.date}
                      {r.field && <><span style={{ color:C.border }}>·</span><span>{r.field}</span></>}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedReport(null)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 8px", cursor:"pointer", display:"flex", color:C.textMuted }}>
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              <div style={{ padding:"0 16px" }}>
                {/* 基本情報 */}
                <div style={{ background:C.bg, borderRadius:12, padding:"12px 14px", marginBottom:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作業種別</div>
                    <div style={{ fontWeight:700, fontSize:14, color:C.primary }}>{r.work_type}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>担当者</div>
                    <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{userName(r.user_id)}</div>
                  </div>
                  {r.quantity && (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>収穫量</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{r.quantity} kg</div>
                    </div>
                  )}
                  {(r.work_start && r.work_end) ? (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作業時刻</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{r.work_start} 〜 {r.work_end}</div>
                    </div>
                  ) : r.work_time ? (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作業時間</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{r.work_time} h</div>
                    </div>
                  ) : null}
                  {r.soil_ph != null && (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>土壌pH</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{r.soil_ph}</div>
                    </div>
                  )}
                </div>

                {/* 天気 */}
                {r.weather && (
                  <div style={{ background:"#f0faf0", borderRadius:10, padding:"10px 14px", marginBottom:12, border:`1px solid ${C.primary4}`, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const }}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weather}</span>
                    {r.temp && <span style={{ fontSize:13, color:C.textSub, display:"flex", alignItems:"center", gap:3 }}><Thermometer size={13} color="#e07020" strokeWidth={2}/>{r.temp}°C</span>}
                    {r.humidity && <span style={{ fontSize:13, color:C.textSub, display:"flex", alignItems:"center", gap:3 }}><Droplets size={13} color="#1976d2" strokeWidth={2}/>{r.humidity}%</span>}
                    {r.rain && <span style={{ fontSize:13, color:C.textSub, display:"flex", alignItems:"center", gap:3 }}><CloudRain size={13} color="#0288d1" strokeWidth={2}/>{r.rain}mm</span>}
                  </div>
                )}

                {/* 農薬 */}
                {(r.pesticides_used && r.pesticides_used.length > 0) && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.textSub, marginBottom:6, display:"flex", alignItems:"center", gap:4 }}>
                      <FlaskConical size={12} strokeWidth={2} />使用農薬
                    </div>
                    {r.pesticides_used.map(pu => {
                      const ps = pesticides.find(p => p.id === pu.id);
                      return ps ? (
                        <div key={pu.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#f3e5f5", borderRadius:8, marginBottom:4 }}>
                          <FlaskConical size={12} color="#7b1fa2" strokeWidth={2} />
                          <span style={{ fontWeight:600, fontSize:13, color:"#7b1fa2", flex:1 }}>{ps.name}</span>
                          {pu.amount && <span style={{ fontSize:12, color:C.textMuted }}>{pu.amount}</span>}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                {(!r.pesticides_used || r.pesticides_used.length === 0) && r.pesticide_id && (() => {
                  const ps = pesticides.find(p => p.id === r.pesticide_id);
                  return ps ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#f3e5f5", borderRadius:8, marginBottom:12 }}>
                      <FlaskConical size={12} color="#7b1fa2" strokeWidth={2} />
                      <span style={{ fontWeight:600, fontSize:13, color:"#7b1fa2", flex:1 }}>{ps.name}</span>
                      {r.pesticide_amount && <span style={{ fontSize:12, color:C.textMuted }}>{r.pesticide_amount}</span>}
                    </div>
                  ) : null;
                })()}

                {/* メモ */}
                {r.note && (
                  <div style={{ fontSize:13, color:C.textSub, padding:"10px 12px", background:C.bg, borderRadius:10, borderLeft:`3px solid ${C.primary4}`, marginBottom:12 }}>
                    {r.note}
                  </div>
                )}

                {/* 写真 */}
                {r.image_url && (
                  <img src={r.image_url} alt="作業写真" style={{ width:"100%", borderRadius:12, marginBottom:12, maxHeight:240, objectFit:"cover", display:"block" }} />
                )}

                {/* アクション */}
                <div style={{ display:"flex", gap:8 }}>
                  <button
                    onClick={() => { setSelectedReport(null); handleCopyReport(r); }}
                    style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"12px 0", borderRadius:10, border:`1.5px solid ${C.primary4}`, background:C.primary3, color:C.primary, fontSize:13, fontWeight:700, cursor:"pointer" }}
                  >
                    <Copy size={14} strokeWidth={2} />コピーして作成
                  </button>
                  {(isAdmin || r.user_id === currentUser?.id) && (
                    <button
                      onClick={() => { setSelectedReport(null); deleteReport(r.id); }}
                      style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"12px 16px", borderRadius:10, border:`1.5px solid ${C.danger}22`, background:C.dangerBg, color:C.danger, fontSize:13, fontWeight:700, cursor:"pointer" }}
                    >
                      <Trash2 size={14} strokeWidth={2} />削除
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ───── 予定詳細（未報告） ───── */}
      {selectedSchedule && (() => {
        const s = selectedSchedule;
        const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
        const cropObj = crops.find(c => c.name === s.crop);
        const ci = getCropIcon(s.crop ?? "");
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", alignItems:"flex-end" }}
            onClick={() => setSelectedSchedule(null)}>
            <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", maxHeight:"85vh", overflowY:"auto", paddingBottom:40 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"12px auto 0" }} />

              {/* ヘッダー */}
              <div style={{ padding:"14px 16px 0", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ background:ci.bg, borderRadius:9, padding:7, flexShrink:0 }}>
                    <ci.Icon size={16} color={ci.color} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:16, color:C.text }}>{s.title}</div>
                    <div style={{ fontSize:12, color:C.textMuted, display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                      <CalendarDays size={11} strokeWidth={2} />{s.date}
                      {s.crop && <><span style={{ color:C.border }}>·</span><span>{s.crop}</span></>}
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:"#c0392b", background:"#fdecea", borderRadius:6, padding:"3px 9px" }}>未報告</span>
                  <button onClick={() => setSelectedSchedule(null)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 8px", cursor:"pointer", display:"flex", color:C.textMuted }}>
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div style={{ padding:"0 16px" }}>
                {/* 基本情報 */}
                <div style={{ background:C.bg, borderRadius:12, padding:"12px 14px", marginBottom:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {s.work_type && (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作業種別</div>
                      <div style={{ fontWeight:700, fontSize:14, color:C.primary }}>{s.work_type}</div>
                    </div>
                  )}
                  {assignedUser && (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>担当者</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{assignedUser.name}</div>
                    </div>
                  )}
                  {s.crop && (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作物</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{s.crop}</div>
                    </div>
                  )}
                </div>

                {/* メモ */}
                {s.note && (
                  <div style={{ fontSize:13, color:C.textSub, padding:"10px 12px", background:C.bg, borderRadius:10, borderLeft:`3px solid ${C.primary4}`, marginBottom:12 }}>
                    {s.note}
                  </div>
                )}

                {/* アクション */}
                <button
                  onClick={() => {
                    setSelectedSchedule(null);
                    setCopySource(null);
                    setRForm(f => ({ ...f, user_id: s.assigned_user_id ?? s.user_id, crop_id: cropObj?.id ?? f.crop_id, date: s.date, work_type: s.work_type ?? f.work_type, note: s.note ?? "" }));
                    setShowQuickReport(true);
                  }}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px 0", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}
                >
                  <ClipboardList size={16} strokeWidth={2} />この予定の報告を入力
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ───── 作物詳細 ───── */}
      {selectedCropId !== null && (() => {
        const crop = crops.find(c => c.id === selectedCropId);
        if (!crop) return null;
        const ci = getCropIcon(crop.name);
        const cropReports = reports.filter(r => r.crop_id === selectedCropId).sort((a,b) => b.date.localeCompare(a.date));
        const cropYears  = cropDataYears(selectedCropId);
        const safeYear   = cropYears.length > 0 && !cropYears.includes(chartYear)
          ? cropYears[cropYears.length - 1]
          : chartYear;
        const chartData  = monthlyHarvest(selectedCropId, safeYear);
        const yearTotal  = chartData.reduce((s, d) => s + d.total, 0);
        const monthTarget = crop.target_yield ? Math.round(crop.target_yield / 12 * 10) / 10 : null;
        const chartDataWithTarget = monthTarget
          ? chartData.map(d => ({ ...d, target: monthTarget }))
          : chartData;
        const stat = cropStats.find(c => c.id === selectedCropId);
        return (
          <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:200, overflowY:"auto", paddingBottom:80 }} className="anim-slideUp">
            <div style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", padding:"10px 12px", display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, zIndex:10 }}>
              <button onClick={() => setSelectedCropId(null)} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:20, padding:"6px 8px", color:"#fff", cursor:"pointer", display:"flex", flexShrink:0 }}>
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <div style={{ background:ci.bg, borderRadius:8, padding:6, flexShrink:0 }}>
                <ci.Icon size={16} color={ci.color} strokeWidth={2} />
              </div>
              <span style={{ fontSize:16, fontWeight:700 }}>{crop.name}</span>
            </div>
            <div style={{ padding:"16px 16px 0" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
                {[
                  { label:"生育日数", value:stat?.growDays ?? "—" },
                  { label:"作業回数", value:stat?.count ?? 0 },
                  { label: stat?.tot ? "kg総収穫" : "収穫なし", value: stat?.tot ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background:C.card, borderRadius:14, padding:"14px 8px", textAlign:"center", boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:String(value).length > 4 ? 20 : 30, fontWeight:800, color:C.primary, lineHeight:1 }}>{value}</div>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* 日付情報 */}
              {(() => {
                const lastDate = crop.last_work_date || stat?.last?.date || null;
                const isManual = !!crop.last_work_date;
                return (
                  <div style={{ background:C.card, borderRadius:14, padding:"12px 16px", marginBottom:16, border:`1px solid ${C.border}`, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
                    {/* 作付け日 */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom:10, borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:12, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                        <CalendarDays size={12} strokeWidth={2} />作付け日
                      </span>
                      <button
                        onClick={() => setDatePickerTarget({ cropId:crop.id, field:"start_date", value:crop.start_date || "" })}
                        style={{ fontSize:13, fontWeight:700, color:C.primary, background:C.primary3, border:`1px solid ${C.primary4}`, borderRadius:8, padding:"4px 12px", cursor:"pointer" }}
                      >
                        {crop.start_date || "未設定"}
                      </button>
                    </div>
                    {/* 最終作業日 */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:10 }}>
                      <span style={{ fontSize:12, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                        <CalendarDays size={12} strokeWidth={2} />最終作業日
                      </span>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {isManual && (
                          <span style={{ fontSize:10, color:C.textMuted, background:C.bg, borderRadius:5, padding:"1px 6px", border:`1px solid ${C.border}` }}>手動</span>
                        )}
                        <button
                          onClick={() => setDatePickerTarget({ cropId:crop.id, field:"last_work_date", value:crop.last_work_date || stat?.last?.date || "" })}
                          style={{ fontSize:13, fontWeight:700, color:C.primary, background:C.primary3, border:`1px solid ${C.primary4}`, borderRadius:8, padding:"4px 12px", cursor:"pointer" }}
                        >
                          {lastDate || "未設定"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 目標収穫量 編集行 */}
              <div style={{ background:C.card, borderRadius:14, padding:"12px 16px", marginBottom:16, border:`1px solid ${C.border}`, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:12, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                    <PackageCheck size={12} strokeWidth={2} />目標収穫量（kg/年）
                  </span>
                  {editingTargetYield ? (
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input
                        type="number" min="0" placeholder="例: 500" autoFocus
                        value={targetYieldInput}
                        onChange={e => setTargetYieldInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && updateTargetYield(crop.id, targetYieldInput)}
                        style={{ width:100, padding:"5px 9px", borderRadius:8, border:`1.5px solid ${C.primary4}`, fontSize:13, background:"#fff", color:C.text, boxSizing:"border-box" as const }}
                      />
                      <button onClick={() => updateTargetYield(crop.id, targetYieldInput)} style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, border:"none", borderRadius:8, padding:"5px 11px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>保存</button>
                      <button onClick={() => setEditingTargetYield(false)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 9px", color:C.textSub, fontSize:12, cursor:"pointer" }}>×</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTargetYieldInput(crop.target_yield ? String(crop.target_yield) : ""); setEditingTargetYield(true); }}
                      style={{ fontSize:13, fontWeight:700, color:C.primary, background:C.primary3, border:`1px solid ${C.primary4}`, borderRadius:8, padding:"4px 12px", cursor:"pointer" }}
                    >
                      {crop.target_yield ? `${crop.target_yield}kg` : "未設定"}
                    </button>
                  )}
                </div>
              </div>

              {(cropYears.length > 0 || !!crop.target_yield) && (
                <>
                  <div style={{ ...S.sec, marginBottom:8 }}>
                    <BarChart2 size={14} strokeWidth={2} />月別収穫量 (kg)
                    <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
                      <button
                        onClick={() => setChartYear(y => y - 1)}
                        disabled={cropYears.length === 0 || safeYear <= cropYears[0]}
                        style={{ background:C.primary3, border:"none", borderRadius:7, padding:"3px 7px", cursor:(cropYears.length === 0 || safeYear <= cropYears[0]) ? "default":"pointer", color:(cropYears.length === 0 || safeYear <= cropYears[0]) ? C.textMuted:C.primary, display:"flex", alignItems:"center" }}
                      >
                        <ChevronLeft size={14} strokeWidth={2.5} />
                      </button>
                      <span style={{ fontSize:12, fontWeight:700, color:C.text, minWidth:40, textAlign:"center" as const }}>{safeYear}年</span>
                      <button
                        onClick={() => setChartYear(y => y + 1)}
                        disabled={cropYears.length === 0 || safeYear >= cropYears[cropYears.length-1]}
                        style={{ background:C.primary3, border:"none", borderRadius:7, padding:"3px 7px", cursor:(cropYears.length === 0 || safeYear >= cropYears[cropYears.length-1]) ? "default":"pointer", color:(cropYears.length === 0 || safeYear >= cropYears[cropYears.length-1]) ? C.textMuted:C.primary, display:"flex", alignItems:"center" }}
                      >
                        <ChevronRight size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <div style={{ background:C.card, borderRadius:14, padding:"16px 6px 8px", marginBottom:14, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:`1px solid ${C.border}` }}>
                    {yearTotal === 0 ? (
                      <div style={{ textAlign:"center" as const, padding:"32px 0", color:C.textMuted, fontSize:13 }}>{safeYear}年の収穫記録はありません</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart data={chartDataWithTarget} margin={{ top:4, right:8, bottom:0, left:-16 }}>
                          <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${C.border}`, boxShadow:"0 2px 8px rgba(0,0,0,0.1)" }}
                            formatter={(v: unknown, name: unknown) => [`${Number(v)}kg`, name === "target" ? "月別目標" : "収穫量"]}
                          />
                          <Bar dataKey="total" radius={[6,6,0,0]} maxBarSize={44}>
                            {chartDataWithTarget.map((_,i) => <Cell key={i} fill={C.primary} />)}
                          </Bar>
                          {monthTarget && (
                            <Line dataKey="target" stroke={C.accent} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {monthTarget && (
                    <div style={{ display:"flex", gap:14, fontSize:11, color:C.textMuted, marginTop:-10, marginBottom:10, paddingLeft:6 }}>
                      <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ display:"inline-block", width:12, height:3, background:C.primary, borderRadius:2 }} />実績</span>
                      <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ display:"inline-block", width:12, height:2, borderTop:`2px dashed ${C.accent}` }} />月別目標 ({monthTarget}kg)</span>
                    </div>
                  )}
                </>
              )}

              <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />作業報告</div>
              {cropReports.length === 0 ? (
                <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>まだ報告がありません</div>
                  <div style={{ fontSize:12, color:C.textMuted }}>報告タブから登録できます</div>
                </div>
              ) : cropReports.map(r => (
                <div key={r.id} style={S.card}>
                  <div style={S.row}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:C.primary }}>{r.work_type}</span>
                      {r.field && <span style={{ fontSize:11, color:C.primary, background:C.primary3, borderRadius:6, padding:"1px 7px", fontWeight:600 }}>{r.field}</span>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={11} strokeWidth={2}/>{r.date}</span>
                      {(isAdmin || r.user_id === currentUser?.id) && (
                        <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setOpenMenuId(openMenuId === `dr${r.id}` ? null : `dr${r.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 4px", borderRadius:6, color:C.textMuted, display:"flex" }}>
                            <MoreVertical size={15} strokeWidth={2} />
                          </button>
                          {openMenuId === `dr${r.id}` && (
                            <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                              <button onClick={() => { setOpenMenuId(null); deleteReport(r.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                                <Trash2 size={13} strokeWidth={2} />削除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8, fontSize:12 }}>
                    {r.quantity  && <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><PackageCheck size={11} strokeWidth={2}/>{r.quantity}kg</span>}
                    {(r.work_start && r.work_end)
                      ? <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11} strokeWidth={2}/>{r.work_start}〜{r.work_end}</span>
                      : r.work_time ? <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11} strokeWidth={2}/>{r.work_time}h</span> : null}
                    <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><UserCircle size={11} strokeWidth={2}/>{userName(r.user_id)}</span>
                  </div>
                  {r.note && (
                    <div style={{ fontSize:12, color:C.textSub, marginTop:8, padding:"7px 10px", background:C.bg, borderRadius:8, borderLeft:`3px solid ${C.primary4}` }}>
                      {r.note}
                    </div>
                  )}
                  {r.image_url && (
                    <img src={r.image_url} alt="作業写真" style={{ width:"100%", borderRadius:8, marginTop:8, maxHeight:160, objectFit:"cover", display:"block" }} />
                  )}
                  <button
                    onClick={() => { setSelectedCropId(null); handleCopyReport(r); }}
                    style={{ marginTop:10, display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:8, border:`1px solid ${C.primary4}`, background:C.primary3, color:C.primary, fontSize:12, fontWeight:600, cursor:"pointer" }}
                  >
                    <Copy size={12} strokeWidth={2} />コピーして作成
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 分析タブ ── */}
      {tab === "analytics" && (
        analyticsSubTab === "report" ? (
          <AnalyticsView currentOrg={currentOrg} />
        ) : (
          <GanttChart
            projects={projects}
            crops={crops}
            fields={fields}
            currentOrg={currentOrg}
            currentUserId={currentUser?.id}
            isAdmin={isAdmin}
            onAdd={p => setProjects(prev => [p as Project, ...prev])}
            onUpdate={handleProjectUpdate}
            onDelete={id => { setProjects(prev => prev.filter(p => p.id !== id)); setTickets(prev => prev.filter(t => t.project_id !== id)); }}
          />
        )
      )}
      {false && tab === "analytics_dead" && (
          <div style={S.page}>
            {/* 計画追加フォーム（管理者のみ） */}
            {isAdmin && (
              <>
                {showAddProject ? (
                  <div style={S.card}>
                    <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><PlusCircle size={15} strokeWidth={2} color={C.primary} />新しい計画を登録</div>
                    <div style={S.lbl}><ClipboardList size={13} strokeWidth={2} />計画名 *</div>
                    <input style={S.input} placeholder="例: 2024年 ぶどう栽培" value={prjForm.name} onChange={e => setPrjForm(f => ({ ...f, name:e.target.value }))} />
                    <div style={{ display:"flex", gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物（任意）</div>
                        <select style={S.select} value={prjForm.crop_id} onChange={e => setPrjForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                          <option value={0}>未指定</option>
                          {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場（任意）</div>
                        <select style={S.select} value={prjForm.field} onChange={e => setPrjForm(f => ({ ...f, field:e.target.value }))}>
                          <option value="">未指定</option>
                          {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />開始日</div>
                        <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={prjForm.start_date} onChange={e => setPrjForm(f => ({ ...f, start_date:e.target.value }))} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />終了予定日</div>
                        <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={prjForm.end_date} onChange={e => setPrjForm(f => ({ ...f, end_date:e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={{ ...S.btn, flex:1, width:"auto", opacity:submitting?0.7:1 }} onClick={addProject} disabled={submitting}>
                        {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />追加する</>}
                      </button>
                      <button onClick={() => setShowAddProject(false)} style={{ flex:1, padding:"12px 0", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.bg, color:C.textSub, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddProject(true)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:13, fontWeight:700, color:C.primary, padding:"2px 0", marginBottom:10 }}>
                    <PlusCircle size={14} strokeWidth={2} />計画を追加
                  </button>
                )}
              </>
            )}

            <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />計画一覧</div>
            {projects.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}><ClipboardList size={22} color={C.primary} strokeWidth={1.5} /></div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>計画がありません</div>
                {isAdmin && <div style={{ fontSize:12, color:C.textMuted }}>上のボタンから追加できます</div>}
              </div>
            ) : projects.map(project => {
              const projTickets = tickets.filter(t => t.project_id === project.id);
              const doneCount   = projTickets.filter(t => t.status === "done").length;
              const cropLabel   = crops.find(c => c.id === project.crop_id)?.name;
              return (
                <div key={project.id} style={{ ...S.card, marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:3 }}>{project.name}</div>
                      <div style={{ fontSize:11, color:C.textMuted, display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                        {cropLabel && <span style={{ display:"flex", alignItems:"center", gap:3 }}><Leaf size={10} strokeWidth={2} />{cropLabel}</span>}
                        {project.field && <span style={{ display:"flex", alignItems:"center", gap:3 }}><MapPin size={10} strokeWidth={2} />{project.field}</span>}
                        {project.end_date && <span style={{ display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={10} strokeWidth={2} />〜{project.end_date}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                      <span style={{ fontSize:11, fontWeight:700, background:doneCount === projTickets.length && projTickets.length > 0 ? C.primary3 : C.bg, color:doneCount === projTickets.length && projTickets.length > 0 ? C.primary : C.textMuted, borderRadius:8, padding:"3px 9px", border:`1px solid ${doneCount === projTickets.length && projTickets.length > 0 ? C.primary4 : C.border}` }}>
                        {doneCount}/{projTickets.length} 完了
                      </span>
                      {isAdmin && (
                        <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setOpenMenuId(openMenuId === `prj${project.id}` ? null : `prj${project.id}`)} style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 4px", borderRadius:6, color:C.textMuted, display:"flex" }}>
                            <MoreVertical size={15} strokeWidth={2} />
                          </button>
                          {openMenuId === `prj${project.id}` && (
                            <div style={{ position:"absolute", right:0, top:"100%", background:C.card, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", border:`1px solid ${C.border}`, zIndex:50, minWidth:100 }}>
                              <button onClick={() => { setOpenMenuId(null); deleteProject(project.id); }} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", cursor:"pointer", color:C.danger, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                                <Trash2 size={13} strokeWidth={2} />削除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {projTickets.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      {[...projTickets].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).map(ticket => (
                        <div key={ticket.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:9, background: ticket.status === "done" ? C.primary3 : C.bg, marginBottom:4 }}>
                          <button onClick={() => toggleTicketStatus(ticket)} style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", flexShrink:0 }}>
                            {ticket.status === "done"
                              ? <PackageCheck size={15} color={C.primary} strokeWidth={2} />
                              : <Clock size={15} color={C.textMuted} strokeWidth={2} />}
                          </button>
                          <span style={{ flex:1, fontSize:13, color: ticket.status === "done" ? C.textMuted : C.text, textDecoration: ticket.status === "done" ? "line-through" : "none", minWidth:0 }}>{ticket.title}</span>
                          {ticket.work_type && <span style={{ fontSize:10, color:C.primary, background:C.primary3, borderRadius:5, padding:"1px 6px", flexShrink:0 }}>{ticket.work_type}</span>}
                          <span style={{ fontSize:11, color:C.textMuted, flexShrink:0 }}>{users.find(u => u.id === ticket.assigned_user_id)?.name ?? "未割当"}</span>
                          {ticket.due_date && <span style={{ fontSize:10, color:C.textMuted, flexShrink:0 }}>{ticket.due_date}</span>}
                          {isAdmin && (
                            <button onClick={() => deleteTicket(ticket.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", flexShrink:0, color:C.textMuted }}>
                              <X size={13} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isAdmin && (
                    addingTicketProjectId === project.id ? (
                      <div style={{ background:C.bg, borderRadius:10, padding:"10px 12px", border:`1px solid ${C.border}` }}>
                        <input style={{ ...S.input, marginBottom:8 }} placeholder="チケットのタイトル *" value={tForm.title} onChange={e => setTForm(f => ({ ...f, title:e.target.value }))} />
                        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                          <select style={{ ...S.select, marginBottom:0, flex:1 }} value={tForm.work_type} onChange={e => setTForm(f => ({ ...f, work_type:e.target.value }))}>
                            <option value="">作業種別（任意）</option>
                            {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select style={{ ...S.select, marginBottom:0, flex:1 }} value={tForm.assigned_user_id} onChange={e => setTForm(f => ({ ...f, assigned_user_id:Number(e.target.value) }))}>
                            <option value={0}>担当者（任意）</option>
                            {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          <input type="date" style={{ ...S.input, marginBottom:0, flex:1, maxWidth:"100%" }} value={tForm.due_date} onChange={e => setTForm(f => ({ ...f, due_date:e.target.value }))} />
                          <button onClick={() => addTicket(project.id)} disabled={submitting} style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, border:"none", borderRadius:10, padding:"0 16px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", opacity:submitting?0.7:1, flexShrink:0 }}>
                            {submitting ? <RefreshCw size={14} strokeWidth={2} /> : <Save size={14} strokeWidth={2} />}
                          </button>
                          <button onClick={() => { setAddingTicketProjectId(null); setTForm({ title:"", work_type:"収穫", assigned_user_id:0, due_date:"" }); }} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"0 12px", color:C.textSub, fontSize:13, cursor:"pointer", flexShrink:0 }}>
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingTicketProjectId(project.id); setTForm({ title:"", work_type:"収穫", assigned_user_id:0, due_date:"" }); }} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:C.primary, background:"none", border:`1px solid ${C.primary4}`, borderRadius:8, padding:"5px 12px", cursor:"pointer", fontWeight:600 }}>
                        <Plus size={13} strokeWidth={2.5} />チケット追加
                      </button>
                    )
                  )}
                </div>
              );
            })}

            {/* 担当者進捗（管理者のみ） */}
            {isAdmin && (() => {
              const weeklyProgress = getWeeklyProgress(progressWeekStart);
              const weekEnd = new Date(progressWeekStart);
              weekEnd.setDate(weekEnd.getDate() + 6);
              const weekLabel = `${progressWeekStart.getMonth()+1}/${progressWeekStart.getDate()} 〜 ${weekEnd.getMonth()+1}/${weekEnd.getDate()}`;
              const weekDays = ["月","火","水","木","金","土","日"];
              return (
                <div style={{ marginTop:20 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.textSub, display:"flex", alignItems:"center", gap:6 }}>
                      <Users size={14} strokeWidth={2} />担当者進捗
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <button onClick={() => { const d = new Date(progressWeekStart); d.setDate(d.getDate() - 7); setProgressWeekStart(d); }} style={{ background:C.primary3, border:"none", borderRadius:7, padding:"4px 8px", cursor:"pointer", color:C.primary, display:"flex", alignItems:"center" }}><ChevronLeft size={14} strokeWidth={2.5} /></button>
                      <span style={{ fontSize:12, fontWeight:600, color:C.text, minWidth:110, textAlign:"center" as const }}>{weekLabel}</span>
                      <button onClick={() => { const d = new Date(progressWeekStart); d.setDate(d.getDate() + 7); setProgressWeekStart(d); }} style={{ background:C.primary3, border:"none", borderRadius:7, padding:"4px 8px", cursor:"pointer", color:C.primary, display:"flex", alignItems:"center" }}><ChevronRight size={14} strokeWidth={2.5} /></button>
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" as const, background:C.card, borderRadius:14, border:`1px solid ${C.border}`, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", marginBottom:10 }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                      <thead>
                        <tr style={{ background:C.bg }}>
                          <th style={{ textAlign:"left" as const, padding:"8px 12px", borderBottom:`1px solid ${C.border}`, color:C.textSub, fontWeight:600, whiteSpace:"nowrap" as const, minWidth:64 }}>担当者</th>
                          {weekDays.map((d, i) => (
                            <th key={d} style={{ padding:"8px 6px", borderBottom:`1px solid ${C.border}`, color: i >= 5 ? C.danger : C.textSub, fontWeight:600, textAlign:"center" as const, minWidth:40 }}>{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weeklyProgress.map(({ user, days: userDays }) => (
                          <tr key={user.id}>
                            <td style={{ padding:"8px 12px", borderBottom:`1px solid ${C.border}`, color:C.text, fontWeight:700, whiteSpace:"nowrap" as const }}>{user.name}</td>
                            {userDays.map(({ date, schedules: ds, reports: rs, matched }) => (
                              <td key={date} style={{ padding:"6px 4px", borderBottom:`1px solid ${C.border}`, textAlign:"center" as const }}>
                                {ds.length === 0 && rs.length === 0 && <span style={{ color:C.border, fontSize:12 }}>─</span>}
                                {ds.length > 0 && matched.length === ds.length && <span title="予定あり・完了" style={{ display:"inline-flex", alignItems:"center", justifyContent:"center" }}><PackageCheck size={15} color={C.primary} strokeWidth={2} /></span>}
                                {ds.length > 0 && matched.length < ds.length && <span title={`予定${ds.length}件・完了${matched.length}件`} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:2 }}><Clock size={13} color="#f57f17" strokeWidth={2} /><span style={{ fontSize:10, color:"#f57f17", fontWeight:700 }}>{matched.length}/{ds.length}</span></span>}
                                {ds.length === 0 && rs.length > 0 && <span title="予定外の作業あり" style={{ display:"inline-flex", alignItems:"center", justifyContent:"center" }}><PenLine size={13} color={C.textMuted} strokeWidth={2} /></span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display:"flex", gap:12, fontSize:11, color:C.textMuted, paddingLeft:2, flexWrap:"wrap" as const, alignItems:"center" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><PackageCheck size={13} color={C.primary} strokeWidth={2} /> 全予定完了</span>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><Clock size={12} color="#f57f17" strokeWidth={2} /> 一部未完了</span>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><PenLine size={12} color={C.textMuted} strokeWidth={2} /> 予定外作業</span>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ color:C.border }}>─</span> なし</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )
      }

      {/* ナビゲーション */}
      <nav style={S.nav}>
        {navItems.map(n => (
          <button key={n.key} style={navBtn(tab === n.key)} onClick={() => setTab(n.key)}>
            <n.Icon size={22} strokeWidth={tab === n.key ? 2.2 : 1.8} />
            {n.label}
          </button>
        ))}
      </nav>

      {/* ───── クイック作業記録モーダル ───── */}
      {showQuickReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:450, display:"flex", alignItems:"flex-end" }}
          onClick={() => { setShowQuickReport(false); setQuickExpanded(false); }}>
          <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", maxHeight:"90vh", overflowY:"auto", paddingBottom:44 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"12px auto 0" }} />

            {/* ヘッダー */}
            <div style={{ padding:"14px 16px 0", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ background:C.primary3, borderRadius:10, padding:7, flexShrink:0 }}>
                  <PenLine size={16} color={C.primary} strokeWidth={2} />
                </div>
                <span style={{ fontWeight:700, fontSize:16, color:C.text }}>作業記録</span>
              </div>
              <button onClick={() => { setShowQuickReport(false); setQuickExpanded(false); }}
                style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 8px", cursor:"pointer", display:"flex", color:C.textMuted }}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div style={{ padding:"0 16px" }}>
              {/* 天気表示 */}
              <div style={{ background:"#f0faf0", borderRadius:10, padding:"10px 12px", marginBottom:12, border:`1px solid ${C.primary4}` }}>
                <div style={{ fontSize:11, color:C.textSub, fontWeight:600, marginBottom:4, display:"flex", alignItems:"center", gap:4 }}>
                  <MapPin size={11} color={C.primary} strokeWidth={2} />{weatherCoords?.name ?? "..."} · 天気（自動入力）
                </div>
                {wxLoading
                  ? <div style={{ fontSize:12, color:C.textMuted }}>取得中...</div>
                  : wxAuto
                  ? <WxBadges wx={wxAuto} />
                  : (
                    <div style={{ display:"flex", gap:8, marginTop:4 }}>
                      <select style={{ ...S.select, marginBottom:0, flex:2, fontSize:13, padding:"7px 10px" }} value={wxManual.label}
                        onChange={e => { const o = WEATHER_OPTIONS.find(x => x.label === e.target.value) || WEATHER_OPTIONS[0]; setWxManual(f => ({ ...f, label:o.label, Icon:o.icon })); }}>
                        {WEATHER_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                      </select>
                      <input type="number" placeholder="気温°C" style={{ ...S.input, marginBottom:0, flex:1, fontSize:13, padding:"7px 10px" }}
                        value={wxManual.temp} onChange={e => setWxManual(f => ({ ...f, temp:e.target.value }))} />
                    </div>
                  )}
              </div>

              {/* 日付 */}
              <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />日付</div>
              <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={rForm.date} onChange={e => setRForm(f => ({ ...f, date:e.target.value }))} />

              {/* 作物・圃場 2カラム */}
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物</div>
                  <select style={{ ...S.select }} value={rForm.crop_id} onChange={e => setRForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                    {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場</div>
                  <select style={{ ...S.select }} value={rForm.field} onChange={e => setRForm(f => ({ ...f, field:e.target.value }))}>
                    {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 作業種別 */}
              <div style={S.lbl}><Wheat size={13} strokeWidth={2} />作業の種類</div>
              {workCategories.length > 0 ? (
                <select style={S.select} value={rForm.work_category_id}
                  onChange={e => {
                    const cat = workCategories.find(c => c.id === Number(e.target.value));
                    setRForm(f => ({ ...f, work_category_id: Number(e.target.value), work_type: cat?.name ?? f.work_type, quantity_unit: cat?.unit ?? f.quantity_unit }));
                  }}>
                  <option value={0}>選択してください</option>
                  {workCategories.map(c => <option key={c.id} value={c.id}>{c.name}{c.unit ? `（${c.unit}）` : ""}</option>)}
                </select>
              ) : (
                <select style={S.select} value={rForm.work_type} onChange={e => setRForm(f => ({ ...f, work_type:e.target.value }))}>
                  {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}

              {/* 詳細アコーディオン */}
              <button
                onClick={() => setQuickExpanded(p => !p)}
                style={{ width:"100%", padding:"14px 0", background:"none", border:"1.5px dashed #d1d5db", borderRadius:10, cursor:"pointer", fontSize:14, color:"#166534", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:4, marginBottom:quickExpanded ? 8 : 0, marginTop:4 }}
              >
                {quickExpanded ? "▲ 詳細を閉じる" : "▼ 詳細を入力"}
              </button>

              {quickExpanded && (
                <>
                  {/* 作業者 */}
                  <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />作業者</div>
                  <select style={S.select} value={rForm.user_id} onChange={e => setRForm(f => ({ ...f, user_id:Number(e.target.value) }))}>
                    {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>

                  {/* 実績数量 */}
                  <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />実績数量{rForm.quantity_unit ? `（${rForm.quantity_unit}）` : ""}</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                    <input type="number" style={{ ...S.input, marginBottom:0, flex:1 }} placeholder="例: 20" value={rForm.quantity_value} onChange={e => setRForm(f => ({ ...f, quantity_value:e.target.value, quantity:e.target.value }))} />
                    <input style={{ ...S.input, marginBottom:0, width:70, flexShrink:0, fontSize:13, padding:"11px 8px" }} placeholder="単位" value={rForm.quantity_unit} onChange={e => setRForm(f => ({ ...f, quantity_unit:e.target.value }))} />
                  </div>

                  {/* 作業時刻 */}
                  <div style={S.lbl}><Clock size={13} strokeWidth={2} />作業時刻</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                    <input type="time" style={{ ...S.input, marginBottom:0, flex:1 }} value={rForm.work_start} onChange={e => setRForm(f => ({ ...f, work_start:e.target.value }))} />
                    <span style={{ color:C.textMuted, flexShrink:0, fontSize:13 }}>〜</span>
                    <input type="time" style={{ ...S.input, marginBottom:0, flex:1 }} value={rForm.work_end} onChange={e => setRForm(f => ({ ...f, work_end:e.target.value }))} />
                  </div>
                  {periodWeather && (
                    <div style={{ background:"#f0faf0", borderRadius:9, padding:"8px 12px", marginBottom:12, border:`1px solid ${C.primary4}`, fontSize:12, color:C.textSub, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontWeight:700, color:C.primary }}>{periodWeather.weather}</span>
                      {periodWeather.temp && <span>{periodWeather.temp}°C</span>}
                      {periodWeather.humidity && <span>湿度{periodWeather.humidity}%</span>}
                      {parseFloat(periodWeather.rain) > 0 && <span>雨量{periodWeather.rain}mm</span>}
                      <span style={{ marginLeft:"auto", fontSize:11, color:C.textMuted }}>自動取得</span>
                    </div>
                  )}

                  {/* 写真 */}
                  <div style={S.lbl}><Camera size={13} strokeWidth={2} />写真</div>
                  <input type="file" id="img-input-quick" accept="image/*" style={{ display:"none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                      e.target.value = "";
                    }}
                  />
                  {imagePreview ? (
                    <div style={{ position:"relative", marginBottom:12 }}>
                      <img src={imagePreview} alt="preview" style={{ width:"100%", borderRadius:10, maxHeight:200, objectFit:"cover", display:"block" }} />
                      <button onClick={() => { setImageFile(null); setImagePreview(""); }}
                        style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.55)", border:"none", borderRadius:20, padding:"5px 10px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                        <X size={12} strokeWidth={2.5} />削除
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="img-input-quick" style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, border:`2px dashed ${C.border}`, borderRadius:10, padding:"20px 0", cursor:"pointer", marginBottom:12, color:C.textMuted, fontSize:13, background:C.bg }}>
                      <Camera size={24} color={C.textMuted} strokeWidth={1.5} />
                      <span>タップして写真を選択</span>
                    </label>
                  )}

                  {/* 農薬複数選択 */}
                  <div style={S.lbl}><FlaskConical size={13} strokeWidth={2} />使用農薬（任意）</div>
                  {pesticides.length === 0 ? (
                    <div style={{ fontSize:12, color:C.textMuted, padding:"8px 12px", background:C.bg, borderRadius:8, marginBottom:12 }}>登録済みの農薬がありません</div>
                  ) : (
                    <div style={{ border:`1.5px solid ${C.border}`, borderRadius:10, padding:"4px 10px", marginBottom:12, background:"#fff" }}>
                      {pesticides.map(p => (
                        <div key={p.id} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:6, marginBottom:6 }}>
                          <label style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer" }}>
                            <input
                              type="checkbox"
                              checked={selectedPesticides.includes(p.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedPesticides(prev => [...prev, p.id]);
                                } else {
                                  setSelectedPesticides(prev => prev.filter(id => id !== p.id));
                                  setPesticideAmounts(prev => { const next = { ...prev }; delete next[p.id]; return next; });
                                }
                              }}
                              style={{ accentColor:C.primary, width:16, height:16, cursor:"pointer", flexShrink:0 }}
                            />
                            <span style={{ fontSize:13, color:C.text, fontWeight:500 }}>{p.name}</span>
                            <span style={{ fontSize:11, color:C.textMuted, background:C.bg, borderRadius:4, padding:"1px 6px", flexShrink:0 }}>{p.type}</span>
                          </label>
                          {selectedPesticides.includes(p.id) && (
                            <input
                              placeholder="散布量（例: 100ml、1L）"
                              value={pesticideAmounts[p.id] || ""}
                              onChange={e => setPesticideAmounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                              style={{ ...S.input, marginLeft:24, marginBottom:0, width:"calc(100% - 24px)", boxSizing:"border-box" as const, fontSize:13, padding:"8px 12px" }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 土壌pH */}
                  <div style={S.lbl}><Droplets size={13} strokeWidth={2} />土壌pH（任意）</div>
                  <input
                    type="number" placeholder="例: 6.5" min="0" max="14" step="0.1"
                    value={soilPh} onChange={e => setSoilPh(e.target.value)}
                    style={S.input}
                  />

                  {/* メモ */}
                  <div style={S.lbl}><PenLine size={13} strokeWidth={2} />メモ</div>
                  <div style={{ position:"relative", marginBottom:12 }}>
                    <input style={{ ...S.input, marginBottom:0, paddingRight: hasSpeech ? 44 : 14 }} placeholder="気づいたことなど" value={rForm.note} onChange={e => setRForm(f => ({ ...f, note:e.target.value }))} />
                    {hasSpeech && (
                      <button onClick={toggleNoteVoice} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background: noteListening ? "#fdecea" : "transparent", border:`1.5px solid ${noteListening ? "#e53935" : C.border}`, borderRadius:6, padding:"4px 6px", cursor:"pointer", display:"flex", alignItems:"center", color: noteListening ? "#e53935" : C.textMuted, animation: noteListening ? "pulse 1s infinite" : "none" }}>
                        {noteListening ? <MicOff size={14} strokeWidth={2} /> : <Mic size={14} strokeWidth={2} />}
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* 保存ボタン */}
              <button
                style={{ ...S.btn, opacity: imgUploading ? 0.7 : 1, marginTop: 4 }}
                onClick={async () => { await addReport(); setShowQuickReport(false); setQuickExpanded(false); }}
                disabled={imgUploading}
              >
                {imgUploading
                  ? <><RefreshCw size={16} strokeWidth={2} />アップロード中...</>
                  : <><ClipboardList size={16} strokeWidth={2} />すぐ保存する</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ログイン設定モーダル */}
      {setAuthTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }} onClick={() => setSetAuthTarget(null)}>
          <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", padding:"20px 16px 36px" }} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"0 auto 16px" }} />
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:16, display:"flex", alignItems:"center", gap:6 }}>
              <KeyRound size={15} color={C.primary} strokeWidth={2} />
              {setAuthTarget.name} のログイン設定
            </div>
            <div style={S.lbl}><KeyRound size={13} strokeWidth={2} />ユーザーID</div>
            <input style={S.input} placeholder="例: worker-001" value={setAuthForm.login_id} onChange={e => setSetAuthFormState(f => ({ ...f, login_id:e.target.value }))} />
            <div style={S.lbl}><KeyRound size={13} strokeWidth={2} />パスワード（6文字以上）</div>
            <input type="password" style={S.input} placeholder="パスワード" value={setAuthForm.password} onChange={e => setSetAuthFormState(f => ({ ...f, password:e.target.value }))} />
            <div style={S.lbl}><KeyRound size={13} strokeWidth={2} />パスワード確認</div>
            <input type="password" style={S.input} placeholder="もう一度入力" value={setAuthForm.confirmPass} onChange={e => setSetAuthFormState(f => ({ ...f, confirmPass:e.target.value }))} />
            <button style={{ ...S.btn, opacity:setAuthBusy?0.7:1 }} disabled={setAuthBusy} onClick={saveUserAuth}>
              {setAuthBusy ? <><RefreshCw size={16} strokeWidth={2} />設定中...</> : <><Save size={16} strokeWidth={2} />ログイン情報を設定する</>}
            </button>
          </div>
        </div>
      )}

      {/* ユーザー切り替えモーダル */}
      {showUserPicker && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"flex-end" }}
          onClick={() => setShowUserPicker(false)}
        >
          <div
            style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", padding:"20px 16px 36px", boxShadow:"0 -4px 24px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"0 auto 18px" }} />
            <div style={{ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
              <Users size={14} strokeWidth={2} />ユーザーを切り替え
            </div>
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => { setCurrentUser(u); setRForm(f => ({ ...f, user_id:u.id })); setShowUserPicker(false); }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"11px 12px", borderRadius:12, border:"none", cursor:"pointer", marginBottom:6, background: currentUser?.id === u.id ? C.primary3 : "#fafcfa", transition:"background 0.15s" }}
              >
                <div style={{ background: currentUser?.id === u.id ? C.primary : C.border, borderRadius:10, padding:8, display:"flex" }}>
                  <UserCircle size={18} color={ currentUser?.id === u.id ? "#fff" : C.textMuted } strokeWidth={1.8} />
                </div>
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{u.name}</div>
                  <span style={{ background: roleColor[u.role]+"18", color:roleColor[u.role], borderRadius:5, padding:"1px 8px", fontSize:11, fontWeight:700, border:`1px solid ${roleColor[u.role]}30` }}>
                    {roleLabel[u.role]}
                  </span>
                </div>
                {currentUser?.id === u.id && <span style={{ fontSize:12, color:C.primary, fontWeight:700 }}>✓</span>}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => { setShowUserPicker(false); setTab("users"); }}
                style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px 0", marginTop:8, borderRadius:12, border:`1.5px solid #e07020`, background:"#fff8f0", color:"#e07020", fontSize:14, fontWeight:700, cursor:"pointer" }}
              >
                <Users size={15} strokeWidth={2} />
                管理画面
              </button>
            )}
            <button
              onClick={() => { setShowUserPicker(false); handleLogout(); }}
              style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px 0", marginTop:8, borderRadius:12, border:`1.5px solid ${C.border}`, background:C.bg, color:C.textSub, fontSize:14, fontWeight:700, cursor:"pointer" }}
            >
              <LogOut size={15} strokeWidth={2} />
              ログアウト
            </button>
          </div>
        </div>
      )}

      {/* 削除確認ボトムシート */}
      {deleteModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", alignItems:"flex-end" }}
          onClick={() => setDeleteModal(null)}>
          <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", padding:"24px 16px 40px", boxShadow:"0 -4px 24px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"0 auto 20px" }} />
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <div style={{ background:C.dangerBg, borderRadius:10, padding:8, flexShrink:0 }}>
                <Trash2 size={18} color={C.danger} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:15, color:C.text }}>削除の確認</div>
                <div style={{ fontSize:13, color:C.textMuted, marginTop:2 }}>{deleteModal.message}</div>
              </div>
            </div>
            <div style={{ fontSize:12, color:C.textMuted, marginBottom:20, paddingLeft:2 }}>この操作は取り消せません。</div>
            <div style={{ display:"flex", gap:10 }}>
              <button
                onClick={() => setDeleteModal(null)}
                style={{ flex:1, padding:"13px 0", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.bg, color:C.textSub, fontSize:15, fontWeight:700, cursor:"pointer" }}
              >キャンセル</button>
              <button
                onClick={() => { deleteModal.onConfirm(); setDeleteModal(null); }}
                style={{ flex:1, padding:"13px 0", borderRadius:10, border:"none", background:C.danger, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
              ><Trash2 size={15} strokeWidth={2} />削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* 日付ピッカー */}
      {datePickerTarget && (
        <DatePicker
          label={datePickerTarget.field === "start_date" ? "作付け日" : "最終作業日"}
          value={datePickerTarget.value}
          onSelect={date => updateCropDate(datePickerTarget.cropId, datePickerTarget.field, date)}
          onClose={() => setDatePickerTarget(null)}
        />
      )}

      {/* トースト */}
      {toast && (
        <div style={{
          position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)",
          background: toast.type === "err" ? C.danger : C.primary,
          color:"#fff", padding:"10px 14px 10px 18px", borderRadius:16, fontSize:13, fontWeight:600,
          zIndex:999, maxWidth:"calc(100vw - 32px)", wordBreak:"break-all" as const, boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
          display:"flex", alignItems:"center", gap:8,
        }}>
          {toast.type === "err"
            ? <AlertCircle size={15} strokeWidth={2} style={{ flexShrink:0 }} />
            : <Wind size={15} strokeWidth={2} style={{ flexShrink:0 }} />}
          <span style={{ flex:1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background:"rgba(255,255,255,0.22)", border:"none", borderRadius:8, padding:"3px 7px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", flexShrink:0, marginLeft:4 }}>
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
