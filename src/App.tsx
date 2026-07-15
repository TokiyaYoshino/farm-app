import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Home, PenLine, Users, Thermometer,
  Droplets, CloudRain, Sun, Cloud, CloudSun, CloudDrizzle,
  Snowflake, CloudLightning, MapPin, RefreshCw, AlertCircle,
  PackageCheck, CalendarDays,
  UserCircle, Trash2, PlusCircle, ClipboardList, Check, MessageSquare, Bell,
  Wind, Camera, X, Navigation, Search, Save,
  Mic, MicOff,
  LogOut, KeyRound, Eye, EyeOff,
  ChevronLeft, ChevronRight, ChevronDown, BarChart2, Plus, FlaskConical, Settings, Copy,
  Sparkles,
} from "lucide-react";
import { Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line } from "recharts";
import CalendarView from "./components/CalendarView";
import type { Schedule, Comment } from "./components/CalendarView";
import DatePicker from "./components/DatePicker";
import AnalyticsView from "./components/AnalyticsView";
import GanttChart from "./components/GanttChart";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { C, SHADOW, RADIUS, roleLabel, roleColor, workTypeColor, cropColor } from "./ui/tokens";
import { btn } from "./ui/styles";
import BottomSheet from "./ui/BottomSheet";
import RowMenu from "./ui/RowMenu";
import CommentThread from "./ui/CommentThread";
import { canUseAiFeature } from "./ui/aiFeatures";

const makePin = (color: string) => L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="${color}" stroke="white" stroke-width="2.5"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -36],
});
const PIN_BLUE  = makePin(C.info);
const PIN_GREEN = makePin(C.primary);

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

// カラートークンは src/ui/tokens.ts に集約（import は先頭）

// ─── グローバルスタイル注入 ───────────────────────────────
const globalStyle = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; font-family: -apple-system, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.5; }
  input, select, button { font-family: inherit; }
  button { border: none; background: none; }
  input:focus, select:focus { outline: 2px solid ${C.primary}; outline-offset: -1px; }
  input[type="date"] { -webkit-appearance: none; appearance: none; min-width: 0; width: 100%; font-size: 13px; padding: 8px 10px; }
  @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
  @keyframes slideUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse     { 0%, 100% { opacity:1; } 50% { opacity:0.5; } }
  .anim-slideDown { animation: slideDown 0.2s ease; }
  .anim-fadeIn    { animation: fadeIn 0.2s ease; }
  .anim-slideUp   { animation: slideUp 0.2s ease; }
  .anim-pulse     { animation: pulse 1.1s ease-in-out infinite; }
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
  const [allComments, setAllComments]     = useState<Comment[]>([]);
  const [pForm, setPForm]                 = useState({ name:"", type:"殺虫剤", dilution_rate:"", notes:"" });
  const [pManualMode, setPManualMode]     = useState(false);
  const [masterSearch, setMasterSearch]   = useState("");
  const [masterResults, setMasterResults] = useState<PesticideMaster[]>([]);
  const [masterSearching, setMasterSearching] = useState(false);
  const [selectedMaster, setSelectedMaster]   = useState<PesticideMaster | null>(null);
  const masterTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentUser, setCurrentUser]     = useState<User | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showNotifs, setShowNotifs]       = useState(false);
  const [notifSeenAt, setNotifSeenAt]     = useState<string>("");  // ISO文字列。ユーザー切替時にlocalStorageから読む
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
  const [aiStructuring, setAiStructuring] = useState(false);
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [quickExpanded, setQuickExpanded]     = useState(false);
  const [manageSubTab, setManageSubTab]       = useState<"crops"|"fields"|"pesticides">("crops");
  const [showCropAddForm, setShowCropAddForm] = useState(false);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"report"|"backlog">("report");
  const [showMapModal, setShowMapModal]       = useState(false);
  const cropExpandedInit                       = useRef(false);
  const [deleteModal, setDeleteModal]     = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<number | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<{ cropId: number; field: "start_date" | "last_work_date"; value: string } | null>(null);
  const [openMenuId, setOpenMenuId]       = useState<string | null>(null);
  const [chartYear, setChartYear]         = useState(() => new Date().getFullYear());
  const [editingTargetYield, setEditingTargetYield] = useState(false);
  const [targetYieldInput, setTargetYieldInput]     = useState("");
  const [selectedPesticides, setSelectedPesticides] = useState<string[]>([]);
  const [pesticideAmounts, setPesticideAmounts]     = useState<Record<string, string>>({});
  const [soilPh, setSoilPh]                         = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  // 記録タブ：カレンダー/一覧の表示切替＋検索/フィルタ
  const [reportView, setReportView]         = useState<"calendar"|"list">("calendar");
  const [reportQuery, setReportQuery]       = useState("");
  const [filterCrop, setFilterCrop]         = useState(0);        // 0 = すべて
  const [filterField, setFilterField]       = useState("");       // "" = すべて
  const [filterWorkType, setFilterWorkType] = useState("");       // "" = すべて
  const [filterUser, setFilterUser]         = useState(0);        // 0 = すべて

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
      const [{ data: c, error: cErr }, { data: fd, error: fdErr }, { data: r, error: rErr }, { data: s }, { data: sch }, { data: ps }, { data: prj }, { data: tkt }, { data: wc }, { data: cmts }] = await Promise.all([
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
        supabase.from("comments").select("*").order("created_at", { ascending: false }),
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
      if (cmts) {
        // comments に org 列がないため、org 内の報告/予定に紐づくものだけ残す
        const reportIds   = new Set((r ?? []).map((x: Report) => String(x.id)));
        const scheduleIds = new Set(((sch ?? []) as Schedule[]).map(x => x.id));
        setAllComments((cmts as Comment[]).filter(cm =>
          cm.target_type === "report" ? reportIds.has(cm.target_id) : scheduleIds.has(cm.target_id)
        ));
      }
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
    if (!SR) return showToast("このブラウザは音声入力非対応です（Chrome推奨）", "err");

    // 停止
    if (noteListening) {
      const r = noteRecRef.current;
      noteRecRef.current = null;
      setNoteListening(false);
      try { r?.stop(); } catch { /* ignore */ }
      return;
    }

    // 開始（無音で切れても自動再開し、話し終わるまで継続して聞き取る）
    const rec = new SR();
    rec.lang           = "ja-JP";
    rec.continuous     = true;
    rec.interimResults = true;
    noteRecRef.current = rec;

    rec.onstart  = () => setNoteListening(true);

    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (!finalText) return;
      setRForm(f => ({ ...f, note: f.note ? f.note + "　" + finalText : finalText }));
    };

    rec.onerror  = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.error("SpeechRecognition error:", e.error);
      const msg = e.error === "not-allowed"   ? "マイクの使用が許可されていません"
                : e.error === "audio-capture" ? "マイクが見つかりません"
                : e.error === "network"       ? "音声認識にはネットワークが必要です"
                : `音声入力エラー: ${e.error}`;
      showToast(msg, "err");
      noteRecRef.current = null;
      setNoteListening(false);
    };

    rec.onend = () => {
      if (noteRecRef.current !== rec) return;
      setTimeout(() => {
        if (noteRecRef.current !== rec) return;
        try { rec.start(); }
        catch { noteRecRef.current = null; setNoteListening(false); }
      }, 300);
    };

    try {
      rec.start();
    } catch (e) {
      console.error("rec.start() failed:", e);
      showToast("音声入力を開始できませんでした", "err");
      noteRecRef.current = null;
    }
  };

  // 音声メモをAIで作業報告フォームに振り分け
  const structureVoiceNote = async () => {
    if (!rForm.note.trim()) return showToast("メモが空です", "err");
    setAiStructuring(true);
    try {
      const res = await fetch("/api/structure-voice", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript:     rForm.note,
          fields:         fields.map(f => f.name),
          workCategories: workCategories.length > 0 ? workCategories.map(c => c.name) : WORK_TEMPLATES,
          pesticides:     pesticides.map(p => p.name),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const s = await res.json();

      setRForm(f => {
        const next = { ...f, note: s.note || f.note };
        if (s.field && fields.some(fd => fd.name === s.field)) next.field = s.field;
        if (s.work_category) {
          const cat = workCategories.find(c => c.name === s.work_category);
          if (cat) {
            next.work_category_id = cat.id;
            next.work_type = cat.name;
            next.quantity_unit = cat.unit ?? next.quantity_unit;
          } else if (WORK_TEMPLATES.includes(s.work_category)) {
            next.work_type = s.work_category;
          }
        }
        if (s.quantity_value != null) { next.quantity_value = String(s.quantity_value); next.quantity = String(s.quantity_value); }
        if (s.quantity_unit) next.quantity_unit = s.quantity_unit;
        return next;
      });
      if (Array.isArray(s.pesticide_names) && s.pesticide_names.length > 0) {
        const matchedIds = pesticides.filter(p => s.pesticide_names.includes(p.name)).map(p => p.id);
        if (matchedIds.length > 0) setSelectedPesticides(prev => Array.from(new Set([...prev, ...matchedIds])));
      }
      if (s.soil_ph != null) setSoilPh(String(s.soil_ph));
      showToast("AIでフォームに反映しました");
    } catch (e: unknown) {
      console.error("structure-voice error:", e);
      showToast("AI整理に失敗しました", "err");
    } finally {
      setAiStructuring(false);
    }
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
  };

  // 予定を1タップで実績記録へ（クイック記録モーダルを予定内容で prefill して開く）
  // title と work_type が同じ文字列のとき、タイトル表示は空にする（タグで表現済みのため重複を避ける）
  const scheduleTitle = (s: Schedule) => (s.title === s.work_type ? "" : s.title);

  const scheduleToReport = (s: Schedule) => {
    const cropObj = crops.find(c => c.name === s.crop);
    setRForm(f => ({
      ...f,
      user_id:   s.assigned_user_id ?? s.user_id ?? f.user_id,
      crop_id:   cropObj?.id ?? f.crop_id,
      field:     s.field ?? f.field,
      date:      s.date,
      work_type: s.work_type ?? f.work_type,
      note:      s.note ?? "",
    }));
    setShowQuickReport(true);
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
    const { data, error } = await supabase.from("comments").insert([{
      target_type: targetType, target_id: targetId,
      user_id: currentUser.id, message,
    }]).select().single();
    if (!error && data) setAllComments(prev => [data as Comment, ...prev]);
    return !error;
  };

  const editComment = async (id: string, message: string): Promise<boolean> => {
    const { error } = await supabase.from("comments").update({ message }).eq("id", id);
    if (!error) setAllComments(prev => prev.map(cm => cm.id === id ? { ...cm, message } : cm));
    return !error;
  };

  // コメント件数マップ（"report:123" / "schedule:uuid" → 件数）
  const commentCounts = (() => {
    const m: Record<string, number> = {};
    allComments.forEach(cm => { const k = `${cm.target_type}:${cm.target_id}`; m[k] = (m[k] ?? 0) + 1; });
    return m;
  })();
  const commentCountOf = (type: "report" | "schedule", id: number | string) => commentCounts[`${type}:${id}`] ?? 0;

  // ─── 通知（自分宛コメント・メンション）────────────────────
  // 既読時刻はユーザーごとに localStorage に保持（DB変更なし）
  useEffect(() => {
    if (currentUser) setNotifSeenAt(localStorage.getItem(`notifSeen_${currentUser.id}`) ?? "");
  }, [currentUser]);

  // 自分宛 = @自分名のメンション / 自分の記録・予定へのコメント（自分の投稿は除外）
  const myNotifs = allComments.filter(cm => {
    if (!currentUser || cm.user_id === currentUser.id) return false;
    if (cm.message.includes(`@${currentUser.name}`)) return true;
    if (cm.target_type === "report") {
      const r = reports.find(x => String(x.id) === cm.target_id);
      return r?.user_id === currentUser.id;
    }
    const sc = schedules.find(x => x.id === cm.target_id);
    return sc ? (sc.assigned_user_id ?? sc.user_id) === currentUser.id : false;
  });
  const unreadNotifCount = notifSeenAt ? myNotifs.filter(cm => cm.created_at > notifSeenAt).length : myNotifs.length;
  const openNotifs = () => {
    setShowNotifs(true);
    const now = new Date().toISOString();
    setNotifSeenAt(now);
    if (currentUser) localStorage.setItem(`notifSeen_${currentUser.id}`, now);
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

  // ─── 記録の検索/フィルタ（一覧モード）─────────────────────
  const filteredReports = (() => {
    const q = reportQuery.trim().toLowerCase();
    return reports.filter(r => {
      if (filterCrop && r.crop_id !== filterCrop) return false;
      if (filterField && r.field !== filterField) return false;
      if (filterWorkType && r.work_type !== filterWorkType) return false;
      if (filterUser && r.user_id !== filterUser) return false;
      if (q) {
        const hay = [r.note, cropName(r.crop_id), r.field, r.work_type, userName(r.user_id)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  })();
  const reportFilterActive = !!(reportQuery.trim() || filterCrop || filterField || filterWorkType || filterUser);
  const chipSelect = (active: boolean): CSSProperties => ({
    flexShrink: 0, appearance: "none", WebkitAppearance: "none", padding: "7px 12px", borderRadius: 999,
    border: "none",
    background: active ? C.inkSoft : C.well, color: active ? C.ink : C.textSub,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  });

  // ─── ダッシュボード統計 ───────────────────────────────
  const sevenAgo      = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const weekStart     = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d.toISOString().slice(0,10); })();
  const workCount7d        = reports.filter(r => r.date >= sevenAgo).length;
  const weekHarvest        = reports.filter(r => r.date >= weekStart).reduce((s,r) => s+(Number(r.quantity)||0), 0);
  const todayStr           = new Date().toISOString().slice(0,10);

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


  // ─── スタイル ─────────────────────────────────────────
  const S = {
    wrap:    css({ minHeight:"100vh", background:C.bg, paddingBottom:"calc(88px + env(safe-area-inset-bottom))" }),
    header:  css({ background:"#fff", color:C.text, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, borderBottom:`1px solid ${C.border}`, position:"sticky" as const, top:0, zIndex:90 }),
    headerTitle: css({ fontSize:16, fontWeight:700, color:C.text, letterSpacing:-0.3, display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" as const, flex:1, minWidth:0 }),
    headerSub: css({ background:"#fff", borderBottom:`1px solid ${C.border}`, display:"flex", paddingLeft:4, paddingRight:4, gap:0 }),
    subTabBtn: (active: boolean) => ({ flex:1, padding:"10px 8px", border:"none", borderBottom: active ? `2.5px solid ${C.primary}` : "2.5px solid transparent", background:"transparent", color: active ? C.primary : C.textMuted, fontSize:13, fontWeight: active ? 700 : 600, cursor:"pointer", transition:"all 0.15s" } as const),
    page:    css({ padding:"16px 16px 0" }),
    sec:     css({ fontSize:12, fontWeight:600, color:C.textMuted, marginBottom:8, marginTop:20, letterSpacing:0.4, textTransform:"uppercase" as const }),
    lbl:     css({ fontSize:12, fontWeight:600, color:C.textSub, marginBottom:5, display:"flex", alignItems:"center", gap:4 }),
    card:    css({ background:C.card, borderRadius:RADIUS.card, padding:"14px 16px", marginBottom:8, boxShadow:SHADOW.card }),
    input:   css({ width:"100%", padding:"11px 0", borderRadius:0, border:"none", borderBottom:`1.5px solid ${C.border}`, fontSize:15, marginBottom:16, background:"transparent", color:C.text, transition:"border 0.15s", boxSizing:"border-box" as const }),
    select:  css({ width:"100%", padding:"11px 0", borderRadius:0, border:"none", borderBottom:`1.5px solid ${C.border}`, fontSize:15, marginBottom:16, background:"transparent", color:C.text }),
    btn:     btn("primary", "lg"),
    btnSm:   { ...btn("dangerOutline", "sm"), minWidth:48, flexShrink:0 },
    row:     css({ display:"flex", justifyContent:"space-between", alignItems:"center" }),
    wxBox:   css({ background:C.card, borderRadius:RADIUS.card, padding:"14px 16px", marginBottom:14, boxShadow:SHADOW.card }),
    wxGrid:  css({ display:"flex", flexWrap:"nowrap" as const, gap:6, marginTop:8, overflowX:"auto" as const }),
    wxBadge: css({ background:C.bg, borderRadius:6, padding:"4px 7px", display:"inline-flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, color:C.text, border:`1px solid ${C.border}`, whiteSpace:"nowrap" as const, flexShrink:0 }),

    nav:     css({ position:"fixed" as const, bottom:0, left:0, right:0, background:C.navBg, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100, paddingBottom:"env(safe-area-inset-bottom)" }),
    center:  css({ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", flexDirection:"column" as const, gap:12, fontSize:15, color:C.textMuted }),
    divider: css({ height:1, background:C.border, margin:"8px 0 12px" }),
    // Soft Widget: グループ入力（灰の受け皿 well に白い行 row を積む）
    wellBox: css({ background:C.well, borderRadius:18, padding:6, marginBottom:12 }),
    wrow:    css({ background:C.card, borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 1px 2px rgba(16,17,20,.04)" }),
    lbl2:    css({ fontSize:11, fontWeight:500, color:C.textMuted, marginBottom:2 }),
    fieldSelect: css({ width:"100%", border:"none", outline:"none", background:"none", fontSize:16, fontWeight:600, color:C.text, appearance:"none" as const, WebkitAppearance:"none" as const, padding:0, cursor:"pointer" }),
    fieldInput:  css({ width:"100%", border:"none", outline:"none", background:"none", fontSize:16, fontWeight:600, color:C.text, padding:0 }),
    circleBtn: css({ width:32, height:32, borderRadius:999, background:C.well, border:"none", display:"flex", alignItems:"center", justifyContent:"center", color:C.textSub, cursor:"pointer", flexShrink:0 }),
  };


  const navBtn = (active: boolean): CSSProperties => ({
    flex:1, padding:"13px 0", border:"none", background:"none", cursor:"pointer",
    display:"flex", flexDirection:"column", alignItems:"center", gap:5,
    color: active ? C.ink : C.textMuted,
    fontSize:11, fontWeight: active ? 700 : 500,
    minHeight:62,
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
        <Thermometer size={14} color={C.temp} strokeWidth={2} />{wx.temp}°C
      </span>
      {wx.humidity !== undefined && <>
        <span style={{ color:C.border }}>|</span>
        <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, fontWeight:600, color:C.textSub, whiteSpace:"nowrap" as const }}>
          <Droplets size={14} color={C.info} strokeWidth={2} />{wx.humidity}%
        </span>
      </>}
      {wx.rain !== undefined && <>
        <span style={{ color:C.border }}>|</span>
        <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:13, fontWeight:600, color:C.textSub, whiteSpace:"nowrap" as const }}>
          <CloudRain size={14} color={C.rain} strokeWidth={2} />{wx.rain}mm
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
      <span style={{ fontSize:14, color:C.textMuted }}>認証確認中...</span>
    </div>
  );

  if (!authSession) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:360 }}>
        <div style={{ marginBottom:40 }}>
          <div style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:6 }}>農作業レポート</div>
          <div style={{ fontSize:14, color:C.textMuted }}>ログイン</div>
        </div>

        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:12, fontWeight:600, color:C.textMuted, display:"block", marginBottom:8 }}>ユーザーID</label>
          <input
            style={{ width:"100%", padding:"10px 0", border:"none", borderBottom:`1.5px solid ${loginError ? C.danger : C.border}`, fontSize:15, background:"transparent", color:C.text, boxSizing:"border-box" as const, outline:"none" }}
            placeholder="例: kishu-001"
            value={loginId}
            onChange={e => { setLoginId(e.target.value); setLoginError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
        </div>

        <div style={{ marginBottom:32 }}>
          <label style={{ fontSize:12, fontWeight:600, color:C.textMuted, display:"block", marginBottom:8 }}>パスワード</label>
          <div style={{ position:"relative" }}>
            <input
              type={showPass ? "text" : "password"}
              style={{ width:"100%", padding:"10px 40px 10px 0", border:"none", borderBottom:`1.5px solid ${loginError ? C.danger : C.border}`, fontSize:15, background:"transparent", color:C.text, boxSizing:"border-box" as const, outline:"none" }}
              placeholder="パスワード"
              value={loginPass}
              onChange={e => { setLoginPass(e.target.value); setLoginError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <button onClick={() => setShowPass(p => !p)} style={{ position:"absolute", right:0, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex" }}>
              {showPass ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>

        {loginError && <div style={{ color:C.danger, fontSize:13, marginBottom:16 }}>{loginError}</div>}

        <button
          onClick={handleLogin}
          disabled={loginBusy}
          style={{ ...btn("primary", "lg"), opacity:loginBusy ? 0.7 : 1 }}
        >
          {loginBusy ? "ログイン中..." : "ログイン"}
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div style={S.center}>
      <span style={{ fontSize:14, color:C.textMuted }}>読み込み中...</span>
    </div>
  );

  return (
    <div style={S.wrap} onClick={() => openMenuId && setOpenMenuId(null)}>
      {/* ヘッダー */}
      <div style={S.header}>
        <div style={S.headerTitle}>
          {tab === "home" ? "農作業レポート" :
           tab === "report" ? "作業記録" :
           tab === "analytics" ? "分析" :
           tab === "manage" ? "管理" : "農作業レポート"}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:"0 0 auto", flexShrink:0 }}>
          {currentUser && (
            <button onClick={openNotifs} style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center", width:36, height:36, background:C.well, borderRadius:999, border:"none", cursor:"pointer", color:C.textSub, flexShrink:0 }}>
              <Bell size={17} strokeWidth={1.8} />
              {unreadNotifCount > 0 && (
                <span style={{ position:"absolute", top:2, right:2, minWidth:16, height:16, borderRadius:999, background:C.danger, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", lineHeight:1 }}>
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>
          )}
          {currentUser && (
            <button onClick={() => setShowUserPicker(true)} style={{ display:"flex", alignItems:"center", justifyContent:"center", width:36, height:36, background:C.well, borderRadius:999, border:"none", cursor:"pointer", color:C.textSub, flexShrink:0 }}>
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
            <div style={{ background:C.card, borderRadius:RADIUS.card, padding:"12px 14px", marginBottom:12, boxShadow:SHADOW.card }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:C.danger, flexShrink:0 }} />
                <span style={{ fontSize:14, fontWeight:700, color:C.text, flex:1 }}>作業中</span>
                <span style={{ fontSize:16, fontWeight:700, color:C.text, fontVariantNumeric:"tabular-nums" as const }}>
                  {fmtElapsed(workElapsed)}
                </span>
                <button
                  onClick={toggleVoice}
                  style={{ width:30, height:30, borderRadius:999, border:"none", background: isListening ? C.dangerBg : C.well, color: isListening ? C.danger : C.textMuted, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}
                >
                  {isListening ? <MicOff size={13} strokeWidth={2} /> : <Mic size={13} strokeWidth={2} />}
                </button>
                <button onClick={stopWork} style={btn("secondary", "sm")}>
                  終了する
                </button>
              </div>
              {voiceTranscript && (
                <div style={{ marginTop:10, fontSize:12, color:C.textSub, background:C.well, borderRadius:10, padding:"8px 10px" }}>
                  {voiceTranscript}
                </div>
              )}
            </div>
          )}
          {/* 天気カード */}
          {wxLoading ? null : wxAuto ? (
            <div style={{ background:C.card, borderRadius:RADIUS.card, padding:"14px 16px", marginBottom:12, boxShadow:SHADOW.card }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <span style={{ fontSize:30, fontWeight:700, color:C.text, lineHeight:1 }}>{wxAuto.temp}°</span>
                  <span style={{ fontSize:13, color:C.textSub }}>
                    {wxAuto.label}{weatherCoords?.name ? ` · ${weatherCoords.name}` : ""}
                  </span>
                </div>
                {(wxAuto.humidity !== undefined || wxAuto.rain !== undefined) && (
                  <div style={{ display:"flex", gap:10 }}>
                    {wxAuto.humidity !== undefined && (
                      <span style={{ fontSize:12, display:"flex", alignItems:"center", gap:4, color:C.textSub }}>
                        <Droplets size={13} strokeWidth={2} color={C.info} />{wxAuto.humidity}%
                      </span>
                    )}
                    {wxAuto.rain !== undefined && (
                      <span style={{ fontSize:12, display:"flex", alignItems:"center", gap:4, color:C.textSub }}>
                        <CloudRain size={13} strokeWidth={2} color={C.rain} />{wxAuto.rain}mm
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {/* 統計カードグリッド */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, padding:"14px 16px" }}>
              <div style={{ fontSize:11, color:C.textSub, marginBottom:4 }}>直近7日の作業</div>
              <div style={{ fontSize:22, fontWeight:700, color:C.text }}>
                {workCount7d}<span style={{ fontSize:12, fontWeight:400, marginLeft:2, color:C.textMuted }}>件</span>
              </div>
            </div>
            <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, padding:"14px 16px" }}>
              <div style={{ fontSize:11, color:C.textSub, marginBottom:4 }}>今週の収穫</div>
              {weekHarvest > 0 ? (
                <div style={{ fontSize:22, fontWeight:700, color:C.text }}>
                  {weekHarvest}<span style={{ fontSize:12, fontWeight:400, marginLeft:2, color:C.textMuted }}>kg</span>
                </div>
              ) : (
                <div style={{ fontSize:13, color:C.textMuted, paddingTop:6 }}>記録なし</div>
              )}
            </div>
          </div>

          {/* 今日の予定 */}
          {(() => {
            const todaySchedsHome = schedules.filter(s => s.date === todayStr);
            return (
              <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:500, color:C.textMuted, marginBottom:8 }}>今日の予定</div>
                {todaySchedsHome.length === 0 ? (
                  <div>
                    <p style={{ fontSize:13, color:C.textMuted, margin:"0 0 8px" }}>予定はありません</p>
                    <button onClick={() => setShowQuickReport(true)} style={btn("secondary", "sm")}>
                      <Plus size={13} strokeWidth={2.5} />作業を追加
                    </button>
                  </div>
                ) : todaySchedsHome.map((s, i) => {
                  const wc = s.work_type ? workTypeColor(s.work_type) : null;
                  return (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                      {wc && (
                        <span style={{ flexShrink:0, fontSize:11, fontWeight:700, color:wc.fg, background:wc.bg, borderRadius:999, padding:"3px 9px" }}>{s.work_type}</span>
                      )}
                      <div style={{ flex:1, minWidth:0 }}>
                        {scheduleTitle(s) && (
                          <div style={{ fontSize:14, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{scheduleTitle(s)}</div>
                        )}
                        {(s.crop || s.field) && (
                          <div style={{ fontSize: scheduleTitle(s) ? 11 : 14, fontWeight: scheduleTitle(s) ? 400 : 600, color: scheduleTitle(s) ? C.textMuted : C.text, marginTop: scheduleTitle(s) ? 2 : 0 }}>{[s.crop, s.field].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>
                      <button onClick={() => scheduleToReport(s)} style={{ ...btn("secondary", "sm"), flexShrink:0 }}>
                        <ClipboardList size={13} strokeWidth={2} />実績にする
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 新着コメント */}
          {(() => {
            const feed = allComments
              .map(cm => {
                if (cm.target_type === "report") {
                  const r = reports.find(x => String(x.id) === cm.target_id);
                  return r ? { cm, label: `${cropName(r.crop_id)} · ${r.date}`, open: () => setSelectedReport(r) } : null;
                }
                const sc = schedules.find(x => x.id === cm.target_id);
                return sc ? { cm, label: `${sc.work_type || sc.title} · ${sc.date}`, open: () => setSelectedSchedule(sc) } : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
              .slice(0, 3);
            if (feed.length === 0) return null;
            return (
              <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:500, color:C.textMuted, marginBottom:8, display:"flex", alignItems:"center", gap:4 }}>
                  <MessageSquare size={11} strokeWidth={2} />新着コメント
                </div>
                {feed.map(({ cm, label, open }, i) => (
                  <button key={cm.id} onClick={open}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 0", border:"none", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background:"none", cursor:"pointer", textAlign:"left" as const }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        <span style={{ fontWeight:700 }}>{userName(cm.user_id)}</span>
                        <span style={{ color:C.textSub }}>：{cm.message}</span>
                      </div>
                      <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{label}</div>
                    </div>
                    <ChevronRight size={14} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />
                  </button>
                ))}
              </div>
            );
          })()}

          {/* 記録一覧への導線 */}
          <button onClick={() => { setTab("report"); setReportView("list"); }} style={{ ...S.card, display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left" as const, width:"100%" }}>
            <ClipboardList size={16} color={C.textMuted} strokeWidth={1.8} style={{ flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>記録一覧を見る</div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{reports.length}件の作業記録</div>
            </div>
            <ChevronRight size={16} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />
          </button>
          {/* マップカード */}
          <button onClick={() => setShowMapModal(true)} style={{ ...S.card, display:"flex", alignItems:"center", gap:10, marginTop:4, cursor:"pointer", textAlign:"left" as const, width:"100%" }}>
            <MapPin size={16} color={C.textMuted} strokeWidth={1.8} style={{ flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>圃場マップ</div>
            </div>
            <ChevronRight size={16} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />
          </button>
        </div>
      )}

      {/* マップモーダル */}
      <BottomSheet open={showMapModal} onClose={() => setShowMapModal(false)} height="75vh" padBottom={0}>
        <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <span style={{ fontWeight:700, fontSize:15, color:C.text, display:"flex", alignItems:"center", gap:6 }}><MapPin size={16} color={C.primary} strokeWidth={2} />圃場マップ</span>
          <button onClick={() => setShowMapModal(false)} style={btn("secondary", "sm")}>閉じる</button>
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
      </BottomSheet>

      {/* ───── REPORT ───── */}
      {tab === "report" && (
        <div style={S.page}>
          {/* 表示モード切替（カレンダー / 記録一覧） */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {([["calendar","カレンダー",CalendarDays],["list","記録一覧",Search]] as const).map(([key,label,Icon]) => (
              <button key={key} onClick={() => setReportView(key)}
                style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 0", borderRadius:8, border:`1.5px solid ${reportView===key ? C.primary : C.border}`, background: reportView===key ? C.primary : C.card, color: reportView===key ? "#fff" : C.textSub, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                <Icon size={15} strokeWidth={2} />{label}
              </button>
            ))}
          </div>

          {reportView === "calendar" && (<>
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
                <div style={S.sec}>今日の予定</div>
                {todayScheds.length === 0 ? (
                  <div style={{ padding:"14px 16px", background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, fontSize:13, color:C.textMuted }}>
                    今日の予定はありません
                  </div>
                ) : todayScheds.map(s => {
                  const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                  const meta = [s.crop, s.field, assignedUser?.name].filter(Boolean).join(" · ");
                  const wc = s.work_type ? workTypeColor(s.work_type) : null;
                  return (
                    <div key={s.id} style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, padding:"12px 16px", marginBottom:6, display:"flex", alignItems:"center", gap:10 }}>
                      {wc && <span style={{ flexShrink:0, fontSize:11, fontWeight:700, color:wc.fg, background:wc.bg, borderRadius:999, padding:"3px 9px" }}>{s.work_type}</span>}
                      <div style={{ flex:1, minWidth:0 }}>
                        {scheduleTitle(s) && <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{scheduleTitle(s)}</div>}
                        {meta && <div style={{ fontSize: scheduleTitle(s) ? 12 : 14, fontWeight: scheduleTitle(s) ? 400 : 600, color: scheduleTitle(s) ? C.textMuted : C.text, marginTop: scheduleTitle(s) ? 3 : 0 }}>{meta}</div>}
                      </div>
                      <button onClick={() => scheduleToReport(s)} style={{ ...btn("secondary", "sm"), flexShrink:0 }}>
                        <ClipboardList size={13} strokeWidth={2} />実績にする
                      </button>
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
                <div style={{ fontSize:13, fontWeight:700, color:C.warning, marginBottom:8 }}>
                  未報告の作業
                </div>
                <div style={{ background:C.card, boxShadow:SHADOW.card, borderRadius:RADIUS.card, padding:"0 16px" }}>
                  {unreported.map((s, i) => {
                    const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSchedule(s)}
                        style={{ width:"100%", background:"none", borderRadius:0, padding:"14px 0", border:"none", borderBottom: i === unreported.length - 1 ? "none" : `1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left" as const }}
                      >
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                            <span style={{ fontWeight:700, fontSize:13, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, flex:1 }}>{scheduleTitle(s) || s.work_type}</span>
                            {commentCountOf("schedule", s.id) > 0 && (
                              <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, color:C.ink, flexShrink:0 }}>
                                <MessageSquare size={11} strokeWidth={2} />{commentCountOf("schedule", s.id)}
                              </span>
                            )}
                            <span style={{ fontSize:11, fontWeight:600, color:C.warning, flexShrink:0 }}>未報告</span>
                          </div>
                          <div style={{ fontSize:11, color:C.textSub, marginTop:4 }}>
                            {[s.date, s.crop, assignedUser?.name].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <ChevronRight size={16} color={C.textMuted} strokeWidth={2} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          </>)}

          {reportView === "list" && (
            <>
              {/* 検索バー */}
              <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"9px 12px", marginBottom:10 }}>
                <Search size={16} color={C.textMuted} strokeWidth={2} />
                <input
                  value={reportQuery}
                  onChange={e => setReportQuery(e.target.value)}
                  placeholder="メモ・作物・圃場・作業で検索"
                  style={{ flex:1, minWidth:0, border:"none", outline:"none", background:"transparent", fontSize:14, color:C.text }}
                />
                {reportQuery && (
                  <button onClick={() => setReportQuery("")} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, display:"flex", flexShrink:0 }}><X size={15} strokeWidth={2} /></button>
                )}
              </div>

              {/* フィルタチップ */}
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:6, marginBottom:4 }}>
                <select value={filterCrop} onChange={e => setFilterCrop(Number(e.target.value))} style={chipSelect(!!filterCrop)}>
                  <option value={0}>作物：すべて</option>
                  {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={filterField} onChange={e => setFilterField(e.target.value)} style={chipSelect(!!filterField)}>
                  <option value="">圃場：すべて</option>
                  {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
                <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)} style={chipSelect(!!filterWorkType)}>
                  <option value="">作業：すべて</option>
                  {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterUser} onChange={e => setFilterUser(Number(e.target.value))} style={chipSelect(!!filterUser)}>
                  <option value={0}>担当：すべて</option>
                  {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              {/* 件数＋クリア */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, minHeight:28 }}>
                <span style={{ fontSize:12, color:C.textMuted }}>{filteredReports.length}件の記録</span>
                {reportFilterActive && (
                  <button onClick={() => { setReportQuery(""); setFilterCrop(0); setFilterField(""); setFilterWorkType(""); setFilterUser(0); }} style={btn("tertiary", "sm")}>条件をクリア</button>
                )}
              </div>

              {/* 結果 */}
              {filteredReports.length === 0 ? (
                <div style={{ padding:"32px 16px", textAlign:"center" as const, color:C.textMuted, fontSize:13 }}>
                  {reportFilterActive ? "条件に一致する記録がありません" : "まだ作業報告がありません"}
                </div>
              ) : filteredReports.map(r => {
                const wc = r.work_type ? workTypeColor(r.work_type) : null;
                return (
                <div key={r.id} style={S.card}>
                  <div style={S.row}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, flex:1 }}>
                      <span style={{ width:9, height:9, borderRadius:"50%", background:cropColor(r.crop_id), flexShrink:0 }} />
                      <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{cropName(r.crop_id)}</span>
                      {r.field && <span style={{ fontSize:12, color:C.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>· {r.field}</span>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                      {wc && <span style={{ fontSize:11, fontWeight:700, color:wc.fg, background:wc.bg, borderRadius:999, padding:"3px 9px" }}>{r.work_type}</span>}
                      {commentCountOf("report", r.id) > 0 && (
                        <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, color:C.ink, background:C.inkSoft, borderRadius:999, padding:"3px 8px" }}>
                          <MessageSquare size={11} strokeWidth={2} />{commentCountOf("report", r.id)}
                        </span>
                      )}
                      <span style={{ fontSize:11, color:C.textMuted }}>{r.date}</span>
                      {(isAdmin || r.user_id === currentUser?.id) && (
                        <RowMenu menuKey={`lr${r.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                          items={[{ label:"削除", icon:<Trash2 size={13} strokeWidth={2} />, danger:true, onClick:() => deleteReport(r.id) }]} />
                      )}
                    </div>
                  </div>
                  <div style={S.divider} />
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>
                    {[
                      r.quantity ? `${r.quantity}kg` : "",
                      (r.work_start && r.work_end) ? `${r.work_start}〜${r.work_end}` : r.work_time ? `${r.work_time}h` : "",
                      r.pesticide_id ? (() => { const ps = pesticides.find(p => p.id === r.pesticide_id); return ps ? ps.name : ""; })() : "",
                      userName(r.user_id),
                      r.weather ? `${r.weather}${r.temp ? ` ${r.temp}°C` : ""}` : "",
                    ].filter(Boolean).join("  ·  ")}
                  </div>
                  {r.note && (
                    <div style={{ fontSize:12, color:C.textSub, marginTop:8, borderLeft:`2px solid ${C.border}`, paddingLeft:10 }}>
                      {r.note}
                    </div>
                  )}
                  {r.image_url && (
                    <img src={r.image_url} alt="作業写真" style={{ width:"100%", borderRadius:14, marginTop:10, maxHeight:220, objectFit:"cover", display:"block" }} />
                  )}
                  <div style={{ display:"flex", gap:8, marginTop:12 }}>
                    <button onClick={() => setSelectedReport(r)} style={{ ...btn("secondary", "sm"), flex:1 }}>詳細を見る</button>
                    <button onClick={() => handleCopyReport(r)} style={{ ...btn("soft", "sm"), flex:1 }}><Copy size={12} strokeWidth={2} />コピーして作成</button>
                  </div>
                </div>
                );
              })}
            </>
          )}
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
                    <div style={S.lbl}>作物名 *</div>
                    <input style={S.input} placeholder="例: キャベツ" value={cForm.name} onChange={e => setCForm(f => ({ ...f, name:e.target.value }))} />
                    <div style={S.lbl}>作付け日</div>
                    <input type="date" style={{ ...S.input, maxWidth:"100%" }} value={cForm.start_date} onChange={e => setCForm(f => ({ ...f, start_date:e.target.value }))} />
                    <div style={S.lbl}>目標収穫量（kg/年・任意）</div>
                    <input type="number" style={S.input} placeholder="例: 500" min="0" value={cForm.target_yield} onChange={e => setCForm(f => ({ ...f, target_yield:e.target.value }))} />
                    <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addCrop} disabled={submitting}>
                      {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />作物を追加</>}
                    </button>
                  </div>
                )}
              </>
            )}
            <div style={S.sec}>登録作物</div>
            {crops.length === 0 ? (
              <div style={{ padding:"18px 16px", background:C.card, borderRadius:8, border:`1px solid ${C.border}`, marginBottom:8 }}>
                <div style={{ fontSize:13, color:C.textMuted }}>作物が登録されていません</div>
              </div>
            ) : crops.map(c => {
              const stat = cropStats.find(cs => cs.id === c.id);
              const expanded = expandedCrops.has(c.id);
              return (
                <div key={c.id} style={S.card}>
                  <div style={S.row}>
                    <button
                      onClick={() => setSelectedCropId(c.id)}
                      style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1, background:"none", border:"none", cursor:"pointer", padding:0, textAlign:"left" as const }}
                    >
                      <span style={{ width:10, height:10, borderRadius:"50%", background:cropColor(c.id), flexShrink:0 }} />
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{c.name}</div>
                        <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{c.start_date}{stat?.growDays != null ? ` · ${stat.growDays}日目` : ""}</div>
                      </div>
                    </button>
                    <div style={{ display:"flex", alignItems:"center", gap:2, flexShrink:0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedCrops(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; }); }}
                        style={{ ...S.circleBtn }}
                      >
                        <ChevronRight size={16} strokeWidth={2} style={{ transform: expanded ? "rotate(90deg)" : "none", transition:"transform .15s" }} />
                      </button>
                      {isAdmin && (
                        <RowMenu menuKey={`mc${c.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                          items={[{ label:"削除", icon:<Trash2 size={13} strokeWidth={2} />, danger:true, onClick:() => deleteCrop(c.id) }]} />
                      )}
                    </div>
                  </div>
                  {expanded && stat && (
                    <>
                      <div style={S.divider} />
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:0, marginBottom:12, background:C.hairline, borderRadius:10, overflow:"hidden" }}>
                        <div style={{ background:C.well, padding:"10px 6px", textAlign:"center" as const }}>
                          <div style={{ fontSize:22, fontWeight:700, color:C.text, lineHeight:1 }}>{stat.growDays ?? "—"}</div>
                          <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>生育日数</div>
                        </div>
                        <div style={{ background:C.well, padding:"10px 6px", textAlign:"center" as const, borderLeft:`1px solid ${C.hairline}`, borderRight:`1px solid ${C.hairline}` }}>
                          <div style={{ fontSize:22, fontWeight:700, color:C.text, lineHeight:1 }}>{stat.count}</div>
                          <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>作業回数</div>
                        </div>
                        <div style={{ background:C.well, padding:"10px 6px", textAlign:"center" as const }}>
                          <div style={{ fontSize:stat.tot > 999 ? 16 : 22, fontWeight:700, color:C.text, lineHeight:1 }}>{stat.tot > 0 ? stat.tot : "—"}</div>
                          <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>{stat.tot > 0 ? "kg収穫" : "収穫なし"}</div>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setTab("analytics"); }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:C.ink, fontSize:13, fontWeight:600, padding:0 }}
                      >
                        分析で見る →
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </>}

          {/* 圃場 */}
          {manageSubTab === "fields" && <>
            {isAdmin && (
              <>
                <div style={S.sec}>圃場を追加</div>
                <div style={S.card}>
                  <div style={S.lbl}>圃場名 *</div>
                  <input style={S.input} placeholder="例: A圃場" value={fForm.name} onChange={e => setFForm({ name:e.target.value })} />
                  <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addField} disabled={submitting}>
                    {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />圃場を追加</>}
                  </button>
                </div>
              </>
            )}
            <div style={S.sec}>登録圃場</div>
            {fields.length === 0 ? (
              <div style={{ padding:"18px 16px", background:C.card, borderRadius:8, border:`1px solid ${C.border}`, marginBottom:8 }}>
                <div style={{ fontSize:13, color:C.textMuted }}>圃場が登録されていません</div>
              </div>
            ) : fields.map(f => (
              <div key={f.id} style={S.card}>
                <div style={S.row}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{f.name}</div>
                    <div style={{ fontSize:12, color: f.lat ? C.textSub : C.textMuted, marginTop:4 }}>{f.lat ? `${f.lat.toFixed(4)}, ${f.lng?.toFixed(4)}` : "位置未設定"}</div>
                  </div>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                      <button style={{ ...btn("soft", "sm") }} onClick={() => setFieldLocation(f.id)}>
                        <Navigation size={12} strokeWidth={2} />現在地
                      </button>
                      <RowMenu menuKey={`mf${f.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                        items={[{ label:"削除", icon:<Trash2 size={13} strokeWidth={2} />, danger:true, onClick:() => deleteField(f.id) }]} />
                    </div>
                  )}
                </div>
                {(() => {
                  const history = getFieldCropHistory(f.name);
                  return (
                    <div style={{ borderTop:`1px solid ${C.border}`, marginTop:10, paddingTop:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.textSub, marginBottom:6 }}>
                        作付け履歴
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
                <div style={S.sec}>農薬を追加</div>
                <div style={S.card}>
                  {!pManualMode ? (
                    <>
                      <div style={S.lbl}>農薬名で検索</div>
                      <div style={{ position:"relative", marginBottom:12 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <input style={{ ...S.input, marginBottom:0, flex:1 }} placeholder="例: スミチオン、ラウンドアップ..." value={masterSearch} onChange={e => handleMasterSearchChange(e.target.value)} autoComplete="off" />
                          {masterSearching && <RefreshCw size={14} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />}
                        </div>
                        {masterResults.length > 0 && (
                          <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:60, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", marginTop:4, maxHeight:220, overflowY:"auto" }}>
                            {masterResults.map(m => (
                              <button key={m.id} onClick={() => selectMaster(m)} style={{ width:"100%", padding:"10px 14px", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" as const, display:"flex", flexDirection:"column" as const, gap:2 }}>
                                <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{m.name}</span>
                                <div style={{ display:"flex", gap:6 }}>
                                  {m.type && <span style={{ fontSize:11, color:C.pesticide, background:C.pesticideBg, borderRadius:5, padding:"1px 6px", fontWeight:600 }}>{m.type}</span>}
                                  {m.dilution_rate && <span style={{ fontSize:11, color:C.textMuted }}>{m.dilution_rate}</span>}
                                  {m.company && <span style={{ fontSize:11, color:C.textMuted }}>{m.company}</span>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedMaster && (
                        <div style={{ background:C.inkSoft, borderRadius:14, padding:"10px 12px", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                          <FlaskConical size={14} color={C.ink} strokeWidth={2} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{selectedMaster.name}</div>
                            <div style={{ fontSize:11, color:C.textMuted }}>{selectedMaster.type}{selectedMaster.dilution_rate ? ` / ${selectedMaster.dilution_rate}` : ""}</div>
                          </div>
                        </div>
                      )}
                      {selectedMaster && (
                        <>
                          <div style={S.lbl}>備考（任意）</div>
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
                      <div style={S.lbl}>農薬名 *</div>
                      <input style={S.input} placeholder="例: スミチオン" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name:e.target.value }))} />
                      <div style={S.lbl}>種別</div>
                      <select style={S.select} value={pForm.type} onChange={e => setPForm(f => ({ ...f, type:e.target.value }))}>
                        {["殺虫剤","殺菌剤","除草剤","その他"].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div style={S.lbl}>希釈倍数</div>
                      <input style={S.input} placeholder="例: 1000倍" value={pForm.dilution_rate} onChange={e => setPForm(f => ({ ...f, dilution_rate:e.target.value }))} />
                      <div style={S.lbl}>備考</div>
                      <input style={S.input} placeholder="注意事項など" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes:e.target.value }))} />
                      <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addPesticide} disabled={submitting}>
                        {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />この農薬を登録する</>}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            <div style={S.sec}>登録済みの農薬</div>
            {pesticides.length === 0 ? (
              <div style={{ padding:"18px 16px", background:C.card, borderRadius:8, border:`1px solid ${C.border}`, marginBottom:8 }}>
                <div style={{ fontSize:13, color:C.textMuted }}>農薬が登録されていません</div>
              </div>
            ) : pesticides.map(p => (
              <div key={p.id} style={S.card}>
                <div style={S.row}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0, flex:1 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:C.pesticideBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <FlaskConical size={16} color={C.pesticide} strokeWidth={2} />
                    </div>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:3 }}>{p.name}</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                        <span style={{ fontSize:12, color:C.textMuted }}>{p.type}</span>
                        {p.dilution_rate && <span style={{ fontSize:12, color:C.textMuted }}>· {p.dilution_rate}</span>}
                      </div>
                      {p.notes && <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{p.notes}</div>}
                    </div>
                  </div>
                  {isAdmin && (
                    <RowMenu menuKey={`mp${p.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                      items={[{ label:"削除", icon:<Trash2 size={13} strokeWidth={2} />, danger:true, onClick:() => deletePesticide(p.id) }]} />
                  )}
                </div>
              </div>
            ))}
          </>}



        </div>
      )}


      {/* ───── USERS ───── */}
      {tab === "users" && (
        <div style={S.page}>
          <div style={S.sec}>農場の場所設定</div>
          <div style={S.card}>
            <div style={S.lbl}>場所を検索</div>
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
                style={{ background:C.primary, color:"#fff", border:"none", borderRadius:8, padding:"0 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600, opacity:locSearching?0.7:1, flexShrink:0 }}
              >
                {locSearching ? <RefreshCw size={14} strokeWidth={2} /> : <Search size={14} strokeWidth={2} />}
                検索
              </button>
            </div>
            {locPreview && (
              <div style={{ background:C.inkSoft, borderRadius:14, padding:"10px 14px", marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:4 }}>{locPreview.name}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>緯度: {locPreview.lat.toFixed(4)}　経度: {locPreview.lng.toFixed(4)}</div>
              </div>
            )}
            {!locPreview && weatherCoords && (
              <div style={{ background:C.bg, borderRadius:8, padding:"10px 14px", marginBottom:12, border:`1px solid ${C.border}` }}>
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

          <div style={S.sec}>アカウントを作成</div>
          <div style={S.card}>
            <div style={S.lbl}>名前 *</div>
            <input style={S.input} placeholder="例: 山田 三郎" value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name:e.target.value }))} />
            <div style={S.lbl}>役割</div>
            <select style={S.select} value={invForm.role} onChange={e => setInvForm(f => ({ ...f, role:e.target.value as Role }))}>
              <option value="admin">管理者</option>
              <option value="worker">作業者</option>
            </select>
            <div style={S.lbl}>ユーザーID *</div>
            <input style={S.input} placeholder="例: worker-001" value={invForm.login_id} onChange={e => setInvForm(f => ({ ...f, login_id:e.target.value }))} />
            <div style={{ ...S.lbl, flexWrap:"nowrap" as const, whiteSpace:"nowrap" as const }}><KeyRound size={13} strokeWidth={2} />パスワード * <span style={{ fontWeight:400, color:C.textMuted, fontSize:11 }}>（6文字以上）</span></div>
            <input type="password" style={{ ...S.input, padding:"11px 14px" }} placeholder="パスワードを設定" value={invForm.password} onChange={e => setInvForm(f => ({ ...f, password:e.target.value }))} />
            <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={inviteUser} disabled={submitting}>
              {submitting ? <><RefreshCw size={16} strokeWidth={2} />作成中...</> : <><PlusCircle size={16} strokeWidth={2} />アカウントを作成する</>}
            </button>
          </div>

          <div style={S.sec}>登録済みユーザー</div>
          {users.map(u => (
            <div key={u.id} style={S.card}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const }}>
                    <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{u.name}</span>
                    <span style={tagStyle(u.role)}>{roleLabel[u.role]}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>
                    {u.login_id ? `ID: ${u.login_id}` : <span style={{ color:C.temp }}>ログイン未設定</span>}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button
                  style={{ ...btn("soft", "sm"), flex:1, justifyContent:"center" }}
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
      <BottomSheet open={!!selectedReport} onClose={() => setSelectedReport(null)}>
        {selectedReport && (() => {
        const r = selectedReport;
        return (
          <>
              {/* ヘッダー */}
              <div style={{ padding:"6px 16px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:17, color:C.text }}>{cropName(r.crop_id)}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>
                    {r.date}{r.field && ` · ${r.field}`}
                  </div>
                </div>
                <button onClick={() => setSelectedReport(null)} style={S.circleBtn}>
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              <div style={{ padding:"0 16px" }}>
                {/* 基本情報 */}
                <div style={{ background:C.well, borderRadius:14, padding:"12px 14px", marginBottom:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作業種別</div>
                    {(() => { const wc = workTypeColor(r.work_type); return (
                      <span style={{ display:"inline-block", fontWeight:700, fontSize:12, color:wc.fg, background:wc.bg, borderRadius:999, padding:"3px 10px" }}>{r.work_type}</span>
                    ); })()}
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
                  <div style={{ background:C.well, borderRadius:14, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const }}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weather}</span>
                    {r.temp && <span style={{ fontSize:13, color:C.textSub, display:"flex", alignItems:"center", gap:3 }}><Thermometer size={13} color={C.temp} strokeWidth={2}/>{r.temp}°C</span>}
                    {r.humidity && <span style={{ fontSize:13, color:C.textSub, display:"flex", alignItems:"center", gap:3 }}><Droplets size={13} color={C.info} strokeWidth={2}/>{r.humidity}%</span>}
                    {r.rain && <span style={{ fontSize:13, color:C.textSub, display:"flex", alignItems:"center", gap:3 }}><CloudRain size={13} color={C.rain} strokeWidth={2}/>{r.rain}mm</span>}
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
                        <div key={pu.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:C.pesticideBg, borderRadius:8, marginBottom:4 }}>
                          <FlaskConical size={12} color={C.pesticide} strokeWidth={2} />
                          <span style={{ fontWeight:600, fontSize:13, color:C.pesticide, flex:1 }}>{ps.name}</span>
                          {pu.amount && <span style={{ fontSize:12, color:C.textMuted }}>{pu.amount}</span>}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                {(!r.pesticides_used || r.pesticides_used.length === 0) && r.pesticide_id && (() => {
                  const ps = pesticides.find(p => p.id === r.pesticide_id);
                  return ps ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:C.pesticideBg, borderRadius:8, marginBottom:12 }}>
                      <FlaskConical size={12} color={C.pesticide} strokeWidth={2} />
                      <span style={{ fontWeight:600, fontSize:13, color:C.pesticide, flex:1 }}>{ps.name}</span>
                      {r.pesticide_amount && <span style={{ fontSize:12, color:C.textMuted }}>{r.pesticide_amount}</span>}
                    </div>
                  ) : null;
                })()}

                {/* メモ */}
                {r.note && (
                  <div style={{ fontSize:13, color:C.textSub, marginBottom:12, borderLeft:`2px solid ${C.border}`, paddingLeft:10 }}>
                    {r.note}
                  </div>
                )}

                {/* 写真 */}
                {r.image_url && (
                  <img src={r.image_url} alt="作業写真" style={{ width:"100%", borderRadius:8, marginBottom:12, maxHeight:240, objectFit:"cover", display:"block" }} />
                )}

                {/* アクション */}
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  <button
                    onClick={() => { setSelectedReport(null); handleCopyReport(r); }}
                    style={{ ...btn("soft", "md"), flex:1 }}
                  >
                    <Copy size={14} strokeWidth={2} />コピーして作成
                  </button>
                  {(isAdmin || r.user_id === currentUser?.id) && (
                    <button
                      onClick={() => { setSelectedReport(null); deleteReport(r.id); }}
                      style={btn("dangerOutline", "md")}
                    >
                      <Trash2 size={14} strokeWidth={2} />削除
                    </button>
                  )}
                </div>

                {/* コメント */}
                <CommentThread
                  targetType="report" targetId={String(r.id)}
                  currentUserId={currentUser?.id ?? 0} userName={userName} users={users.filter(u => u.role !== "viewer")}
                  onLoad={loadComments} onAdd={addComment} onEdit={editComment}
                />
              </div>
          </>
        );
      })()}
      </BottomSheet>

      {/* ───── 予定詳細（未報告） ───── */}
      <BottomSheet open={!!selectedSchedule} onClose={() => setSelectedSchedule(null)}>
        {selectedSchedule && (() => {
        const s = selectedSchedule;
        const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
        const cropObj = crops.find(c => c.name === s.crop);
        return (
          <>
              {/* ヘッダー */}
              <div style={{ padding:"6px 16px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:17, color:C.text }}>{scheduleTitle(s) || s.work_type}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>
                    {s.date}{s.crop && ` · ${s.crop}`}
                  </div>
                </div>
                <button onClick={() => setSelectedSchedule(null)} style={S.circleBtn}>
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              <div style={{ padding:"0 16px" }}>
                {/* 基本情報 */}
                <div style={{ background:C.well, borderRadius:14, padding:"12px 14px", marginBottom:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {s.work_type && scheduleTitle(s) && (
                    <div>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:3 }}>作業種別</div>
                      {(() => { const wc = workTypeColor(s.work_type); return (
                        <span style={{ display:"inline-block", fontWeight:700, fontSize:12, color:wc.fg, background:wc.bg, borderRadius:999, padding:"3px 10px" }}>{s.work_type}</span>
                      ); })()}
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
                  <div style={{ fontSize:13, color:C.textSub, marginBottom:12, borderLeft:`2px solid ${C.border}`, paddingLeft:10 }}>
                    {s.note}
                  </div>
                )}

                {/* アクション */}
                <button
                  onClick={() => {
                    setSelectedSchedule(null);
                    setRForm(f => ({ ...f, user_id: s.assigned_user_id ?? s.user_id, crop_id: cropObj?.id ?? f.crop_id, date: s.date, work_type: s.work_type ?? f.work_type, note: s.note ?? "" }));
                    setShowQuickReport(true);
                  }}
                  style={btn("primary", "lg")}
                >
                  <ClipboardList size={16} strokeWidth={2} />この予定の報告を入力
                </button>

                {/* コメント */}
                <div style={{ marginTop:16 }}>
                  <CommentThread
                    targetType="schedule" targetId={s.id}
                    currentUserId={currentUser?.id ?? 0} userName={userName} users={users.filter(u => u.role !== "viewer")}
                    onLoad={loadComments} onAdd={addComment} onEdit={editComment}
                  />
                </div>
              </div>
          </>
        );
      })()}
      </BottomSheet>

      {/* ───── 作物詳細 ───── */}
      {selectedCropId !== null && (() => {
        const crop = crops.find(c => c.id === selectedCropId);
        if (!crop) return null;
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
          <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:95, overflowY:"auto", paddingBottom:"calc(88px + env(safe-area-inset-bottom))" }} className="anim-slideUp">
            <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, zIndex:10 }}>
              <button onClick={() => setSelectedCropId(null)} style={{ background:"none", border:"none", padding:"6px 6px", color:C.textSub, cursor:"pointer", display:"flex", flexShrink:0 }}>
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{crop.name}</span>
            </div>
            <div style={{ padding:"16px 16px 0" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
                {[
                  { label:"生育日数", value:stat?.growDays ?? "—" },
                  { label:"作業回数", value:stat?.count ?? 0 },
                  { label: stat?.tot ? "kg総収穫" : "収穫なし", value: stat?.tot ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background:C.card, borderRadius:16, padding:"14px 8px", textAlign:"center", boxShadow:SHADOW.card }}>
                    <div style={{ fontSize:String(value).length > 4 ? 18 : 26, fontWeight:700, color:C.text, lineHeight:1 }}>{value}</div>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* 日付情報 */}
              {(() => {
                const lastDate = crop.last_work_date || stat?.last?.date || null;
                const isManual = !!crop.last_work_date;
                return (
                  <div style={{ background:C.card, borderRadius:16, padding:"12px 16px", marginBottom:16, boxShadow:SHADOW.card }}>
                    {/* 作付け日 */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom:10, borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:12, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                        <CalendarDays size={12} strokeWidth={2} />作付け日
                      </span>
                      <button
                        onClick={() => setDatePickerTarget({ cropId:crop.id, field:"start_date", value:crop.start_date || "" })}
                        style={{ fontSize:13, fontWeight:700, color: crop.start_date ? C.text : C.textMuted, background:"none", border:"none", padding:0, cursor:"pointer" }}
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
                          <span style={{ fontSize:10, color:C.textMuted }}>手動</span>
                        )}
                        <button
                          onClick={() => setDatePickerTarget({ cropId:crop.id, field:"last_work_date", value:crop.last_work_date || stat?.last?.date || "" })}
                          style={{ fontSize:13, fontWeight:700, color: lastDate ? C.text : C.textMuted, background:"none", border:"none", padding:0, cursor:"pointer" }}
                        >
                          {lastDate || "未設定"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 目標収穫量 編集行 */}
              <div style={{ background:C.card, borderRadius:16, padding:"12px 16px", marginBottom:16, boxShadow:SHADOW.card }}>
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
                        style={{ width:100, padding:"6px 11px", borderRadius:999, border:`1px solid ${C.hairline}`, fontSize:13, background:C.card, color:C.text, boxSizing:"border-box" as const }}
                      />
                      <button onClick={() => updateTargetYield(crop.id, targetYieldInput)} style={btn("primary", "sm")}>保存</button>
                      <button onClick={() => setEditingTargetYield(false)} style={btn("secondary", "sm")}>×</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTargetYieldInput(crop.target_yield ? String(crop.target_yield) : ""); setEditingTargetYield(true); }}
                      style={{ fontSize:13, fontWeight:700, color: crop.target_yield ? C.text : C.textMuted, background:"none", border:"none", padding:0, cursor:"pointer" }}
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
                        style={{ width:26, height:26, background:C.well, border:"none", borderRadius:999, cursor:(cropYears.length === 0 || safeYear <= cropYears[0]) ? "default":"pointer", color:(cropYears.length === 0 || safeYear <= cropYears[0]) ? C.textMuted:C.textSub, display:"flex", alignItems:"center", justifyContent:"center" }}
                      >
                        <ChevronLeft size={14} strokeWidth={2.5} />
                      </button>
                      <span style={{ fontSize:12, fontWeight:700, color:C.text, minWidth:40, textAlign:"center" as const }}>{safeYear}年</span>
                      <button
                        onClick={() => setChartYear(y => y + 1)}
                        disabled={cropYears.length === 0 || safeYear >= cropYears[cropYears.length-1]}
                        style={{ width:26, height:26, background:C.well, border:"none", borderRadius:999, cursor:(cropYears.length === 0 || safeYear >= cropYears[cropYears.length-1]) ? "default":"pointer", color:(cropYears.length === 0 || safeYear >= cropYears[cropYears.length-1]) ? C.textMuted:C.textSub, display:"flex", alignItems:"center", justifyContent:"center" }}
                      >
                        <ChevronRight size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <div style={{ background:C.card, borderRadius:16, padding:"16px 6px 8px", marginBottom:14, boxShadow:SHADOW.card }}>
                    {yearTotal === 0 ? (
                      <div style={{ textAlign:"center" as const, padding:"32px 0", color:C.textMuted, fontSize:13 }}>{safeYear}年の収穫記録はありません</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart data={chartDataWithTarget} margin={{ top:4, right:8, bottom:0, left:-16 }}>
                          <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ fontSize:12, borderRadius:10, border:"none", boxShadow:SHADOW.float }}
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

              <div style={S.sec}>作業報告</div>
              {cropReports.length === 0 ? (
                <div style={{ padding:"18px 16px", background:C.card, borderRadius:16, boxShadow:SHADOW.card, marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>まだ報告がありません</div>
                  <div style={{ fontSize:12, color:C.textMuted }}>報告タブから登録できます</div>
                </div>
              ) : cropReports.map(r => {
                const wc = workTypeColor(r.work_type);
                return (
                <div key={r.id} style={S.card}>
                  <div style={S.row}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:11, color:wc.fg, background:wc.bg, borderRadius:999, padding:"3px 9px" }}>{r.work_type}</span>
                      {r.field && <span style={{ fontSize:12, color:C.textMuted }}>· {r.field}</span>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:11, color:C.textMuted }}>{r.date}</span>
                      {(isAdmin || r.user_id === currentUser?.id) && (
                        <RowMenu menuKey={`dr${r.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                          items={[{ label:"削除", icon:<Trash2 size={13} strokeWidth={2} />, danger:true, onClick:() => deleteReport(r.id) }]} />
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:6 }}>
                    {[
                      r.quantity ? `${r.quantity}kg` : "",
                      (r.work_start && r.work_end) ? `${r.work_start}〜${r.work_end}` : r.work_time ? `${r.work_time}h` : "",
                      userName(r.user_id),
                    ].filter(Boolean).join(" · ")}
                  </div>
                  {r.note && (
                    <div style={{ fontSize:12, color:C.textSub, marginTop:8, borderLeft:`2px solid ${C.border}`, paddingLeft:10 }}>
                      {r.note}
                    </div>
                  )}
                  {r.image_url && (
                    <img src={r.image_url} alt="作業写真" style={{ width:"100%", borderRadius:8, marginTop:8, maxHeight:160, objectFit:"cover", display:"block" }} />
                  )}
                  <button
                    onClick={() => { setSelectedCropId(null); handleCopyReport(r); }}
                    style={{ ...btn("soft", "sm"), marginTop:10 }}
                  >
                    <Copy size={12} strokeWidth={2} />コピーして作成
                  </button>
                </div>
                );
              })}
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
      {/* 記録FAB（全タブ共通の主導線） */}
      <button
        onClick={() => setShowQuickReport(true)}
        aria-label="作業を記録"
        style={{ position:"fixed", right:16, bottom:"calc(86px + env(safe-area-inset-bottom))", zIndex:90, display:"flex", alignItems:"center", gap:7, background:C.ink, color:"#fff", border:"none", borderRadius:999, padding:"14px 22px", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 6px 18px rgba(46,125,50,0.32)" }}
      >
        <Plus size={20} strokeWidth={2.5} />記録
      </button>

      {/* ナビゲーション */}
      <nav style={S.nav}>
        {navItems.map(n => (
          <button key={n.key} style={navBtn(tab === n.key)} onClick={() => setTab(n.key)}>
            <n.Icon size={24} strokeWidth={tab === n.key ? 2.2 : 1.8} />
            {n.label}
          </button>
        ))}
      </nav>

      {/* ───── クイック作業記録モーダル ───── */}
      <BottomSheet open={showQuickReport} onClose={() => { setShowQuickReport(false); setQuickExpanded(false); }}>
            {/* ヘッダー */}
            <div style={{ padding:"6px 16px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontWeight:700, fontSize:17, color:C.text }}>作業を記録</span>
              <button onClick={() => { setShowQuickReport(false); setQuickExpanded(false); }} style={S.circleBtn}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div style={{ padding:"0 16px" }}>
              {/* 天気（白row） */}
              <div style={S.wellBox}>
                <div style={S.wrow}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ ...S.lbl2, display:"flex", alignItems:"center", gap:4 }}>
                      <MapPin size={11} color={C.textMuted} strokeWidth={2} />{weatherCoords?.name ?? "..."} · 天気（自動）
                    </div>
                    {wxLoading
                      ? <div style={{ fontSize:13, color:C.textMuted }}>取得中...</div>
                      : wxAuto
                      ? <WxBadges wx={wxAuto} />
                      : (
                        <div style={{ display:"flex", gap:8, marginTop:4 }}>
                          <select style={{ ...S.select, marginBottom:0, flex:2, fontSize:14, padding:"6px 8px" }} value={wxManual.label}
                            onChange={e => { const o = WEATHER_OPTIONS.find(x => x.label === e.target.value) || WEATHER_OPTIONS[0]; setWxManual(f => ({ ...f, label:o.label, Icon:o.icon })); }}>
                            {WEATHER_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                          </select>
                          <input type="number" placeholder="気温°C" style={{ ...S.input, marginBottom:0, flex:1, fontSize:14, padding:"6px 8px" }}
                            value={wxManual.temp} onChange={e => setWxManual(f => ({ ...f, temp:e.target.value }))} />
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* 日付・作物/圃場・作業種別（グループ入力） */}
              <div style={S.wellBox}>
                <div style={S.wrow}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={S.lbl2}>日付</div>
                    <input type="date" style={{ ...S.fieldInput, maxWidth:"100%" }} value={rForm.date} onChange={e => setRForm(f => ({ ...f, date:e.target.value }))} />
                  </div>
                </div>
                <div style={{ ...S.wrow, marginTop:6 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={S.lbl2}>作物</div>
                    <select style={S.fieldSelect} value={rForm.crop_id} onChange={e => setRForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                      {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:1, minWidth:0, borderLeft:`1px solid ${C.hairline}`, paddingLeft:16 }}>
                    <div style={S.lbl2}>圃場</div>
                    <select style={S.fieldSelect} value={rForm.field} onChange={e => setRForm(f => ({ ...f, field:e.target.value }))}>
                      {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ ...S.wrow, marginTop:6 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={S.lbl2}>作業の種類</div>
                    {workCategories.length > 0 ? (
                      <select style={S.fieldSelect} value={rForm.work_category_id}
                        onChange={e => {
                          const cat = workCategories.find(c => c.id === Number(e.target.value));
                          setRForm(f => ({ ...f, work_category_id: Number(e.target.value), work_type: cat?.name ?? f.work_type, quantity_unit: cat?.unit ?? f.quantity_unit }));
                        }}>
                        <option value={0}>選択してください</option>
                        {workCategories.map(c => <option key={c.id} value={c.id}>{c.name}{c.unit ? `（${c.unit}）` : ""}</option>)}
                      </select>
                    ) : (
                      <select style={S.fieldSelect} value={rForm.work_type} onChange={e => setRForm(f => ({ ...f, work_type:e.target.value }))}>
                        {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </div>
                  {rForm.work_type && (
                    <span style={{ width:9, height:9, borderRadius:"50%", background:workTypeColor(rForm.work_type).fg, flexShrink:0 }} />
                  )}
                  <ChevronRight size={18} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />
                </div>
              </div>

              {/* 詳細アコーディオン */}
              <button
                onClick={() => setQuickExpanded(p => !p)}
                style={{ ...btn("secondary", "md"), width:"100%", color:C.textSub, marginBottom:12, marginTop:2 }}
              >
                <ChevronDown size={15} strokeWidth={2} style={{ transform: quickExpanded ? "rotate(180deg)" : "none", transition:"transform .15s" }} />
                {quickExpanded ? "詳細を閉じる" : "詳細を入力"}
              </button>

              {quickExpanded && (
                <>
                  {/* 作業者 */}
                  <div style={S.lbl}>作業者</div>
                  <select style={S.select} value={rForm.user_id} onChange={e => setRForm(f => ({ ...f, user_id:Number(e.target.value) }))}>
                    {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>

                  {/* 実績数量 */}
                  <div style={S.lbl}>実績数量{rForm.quantity_unit ? `（${rForm.quantity_unit}）` : ""}</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                    <input type="number" style={{ ...S.input, marginBottom:0, flex:1 }} placeholder="例: 20" value={rForm.quantity_value} onChange={e => setRForm(f => ({ ...f, quantity_value:e.target.value, quantity:e.target.value }))} />
                    <input style={{ ...S.input, marginBottom:0, width:70, flexShrink:0, fontSize:13, padding:"11px 8px" }} placeholder="単位" value={rForm.quantity_unit} onChange={e => setRForm(f => ({ ...f, quantity_unit:e.target.value }))} />
                  </div>

                  {/* 作業時刻 */}
                  <div style={S.lbl}>作業時刻</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                    <input type="time" style={{ ...S.input, marginBottom:0, flex:1 }} value={rForm.work_start} onChange={e => setRForm(f => ({ ...f, work_start:e.target.value }))} />
                    <span style={{ color:C.textMuted, flexShrink:0, fontSize:13 }}>〜</span>
                    <input type="time" style={{ ...S.input, marginBottom:0, flex:1 }} value={rForm.work_end} onChange={e => setRForm(f => ({ ...f, work_end:e.target.value }))} />
                  </div>
                  {periodWeather && (
                    <div style={{ background:C.well, borderRadius:14, padding:"8px 12px", marginBottom:12, fontSize:12, color:C.textSub, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontWeight:700, color:C.text }}>{periodWeather.weather}</span>
                      {periodWeather.temp && <span>{periodWeather.temp}°C</span>}
                      {periodWeather.humidity && <span>湿度{periodWeather.humidity}%</span>}
                      {parseFloat(periodWeather.rain) > 0 && <span>雨量{periodWeather.rain}mm</span>}
                      <span style={{ marginLeft:"auto", fontSize:11, color:C.textMuted }}>自動取得</span>
                    </div>
                  )}

                  {/* 写真 */}
                  <div style={S.lbl}>写真</div>
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
                      <img src={imagePreview} alt="preview" style={{ width:"100%", borderRadius:8, maxHeight:200, objectFit:"cover", display:"block" }} />
                      <button onClick={() => { setImageFile(null); setImagePreview(""); }}
                        style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.55)", border:"none", borderRadius:20, padding:"5px 10px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                        <X size={12} strokeWidth={2.5} />削除
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="img-input-quick" style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, border:`2px dashed ${C.border}`, borderRadius:8, padding:"20px 0", cursor:"pointer", marginBottom:12, color:C.textMuted, fontSize:13, background:C.bg }}>
                      <Camera size={24} color={C.textMuted} strokeWidth={1.5} />
                      <span>タップして写真を選択</span>
                    </label>
                  )}

                  {/* 農薬複数選択 */}
                  <div style={S.lbl}>使用農薬（任意）</div>
                  {pesticides.length === 0 ? (
                    <div style={{ fontSize:12, color:C.textMuted, padding:"8px 12px", background:C.bg, borderRadius:8, marginBottom:12 }}>登録済みの農薬がありません</div>
                  ) : (
                    <div style={{ border:`1.5px solid ${C.border}`, borderRadius:8, padding:"4px 10px", marginBottom:12, background:"#fff" }}>
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
                  <div style={S.lbl}>土壌pH（任意）</div>
                  <input
                    type="number" placeholder="例: 6.5" min="0" max="14" step="0.1"
                    value={soilPh} onChange={e => setSoilPh(e.target.value)}
                    style={S.input}
                  />

                  {/* メモ */}
                  <div style={S.lbl}>メモ</div>
                  <input style={S.input} placeholder="気づいたことなど" value={rForm.note} onChange={e => setRForm(f => ({ ...f, note:e.target.value }))} />
                  {hasSpeech && (
                    <button
                      onClick={toggleNoteVoice}
                      className={noteListening ? "anim-pulse" : ""}
                      style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"11px 0", marginTop:-4, marginBottom:12, borderRadius:8, border:`1.5px solid ${noteListening ? C.danger : C.primary}`, background: noteListening ? C.dangerBg : "transparent", color: noteListening ? C.danger : C.primary, fontSize:13, fontWeight:700, cursor:"pointer" }}
                    >
                      {noteListening ? <MicOff size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
                      {noteListening ? "音声入力中…タップで停止" : "音声でメモを入力"}
                    </button>
                  )}
                  {canUseAiFeature("voiceStructuring") && rForm.note.trim() && (
                    <button
                      onClick={structureVoiceNote}
                      disabled={aiStructuring}
                      style={{ ...btn("soft", "md"), width:"100%", marginBottom:12, opacity: aiStructuring ? 0.6 : 1, cursor: aiStructuring ? "default" : "pointer" }}
                    >
                      <Sparkles size={16} strokeWidth={2} />
                      {aiStructuring ? "AIで整理中…" : "AIでフォームに自動入力"}
                    </button>
                  )}
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
                  : <><Check size={17} strokeWidth={2.4} />保存する</>}
              </button>
            </div>
      </BottomSheet>

      {/* ログイン設定モーダル */}
      {setAuthTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }} onClick={() => setSetAuthTarget(null)}>
          <div style={{ background:C.card, borderRadius:"20px 20px 0 0", width:"100%", padding:"20px 16px 36px" }} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, background:C.border, borderRadius:4, margin:"0 auto 16px" }} />
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:16, display:"flex", alignItems:"center", gap:6 }}>
              <KeyRound size={15} color={C.primary} strokeWidth={2} />
              {setAuthTarget.name} のログイン設定
            </div>
            <div style={S.lbl}>ユーザーID</div>
            <input style={S.input} placeholder="例: worker-001" value={setAuthForm.login_id} onChange={e => setSetAuthFormState(f => ({ ...f, login_id:e.target.value }))} />
            <div style={S.lbl}>パスワード（6文字以上）</div>
            <input type="password" style={S.input} placeholder="パスワード" value={setAuthForm.password} onChange={e => setSetAuthFormState(f => ({ ...f, password:e.target.value }))} />
            <div style={S.lbl}>パスワード確認</div>
            <input type="password" style={S.input} placeholder="もう一度入力" value={setAuthForm.confirmPass} onChange={e => setSetAuthFormState(f => ({ ...f, confirmPass:e.target.value }))} />
            <button style={{ ...S.btn, opacity:setAuthBusy?0.7:1 }} disabled={setAuthBusy} onClick={saveUserAuth}>
              {setAuthBusy ? <><RefreshCw size={16} strokeWidth={2} />設定中...</> : <><Save size={16} strokeWidth={2} />ログイン情報を設定する</>}
            </button>
          </div>
        </div>
      )}

      {/* ユーザー切り替えモーダル */}
      {/* 通知一覧 */}
      <BottomSheet open={showNotifs} onClose={() => setShowNotifs(false)}>
        <div style={{ padding:"0 16px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
            <Bell size={14} strokeWidth={2} />通知
          </div>
          {myNotifs.length === 0 ? (
            <div style={{ padding:"24px 0 12px", textAlign:"center" as const, color:C.textMuted, fontSize:13 }}>
              自分宛のコメント・メンションはまだありません
            </div>
          ) : myNotifs.slice(0, 20).map(cm => {
            const isMention = currentUser && cm.message.includes(`@${currentUser.name}`);
            const target = cm.target_type === "report"
              ? (() => { const r = reports.find(x => String(x.id) === cm.target_id); return r ? { label: `${cropName(r.crop_id)} · ${r.date}`, open: () => { setShowNotifs(false); setSelectedReport(r); } } : null; })()
              : (() => { const sc = schedules.find(x => x.id === cm.target_id); return sc ? { label: `${sc.work_type || sc.title} · ${sc.date}`, open: () => { setShowNotifs(false); setSelectedSchedule(sc); } } : null; })();
            if (!target) return null;
            return (
              <button key={cm.id} onClick={target.open}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 0", border:"none", borderBottom:`1px solid ${C.border}`, background:"none", cursor:"pointer", textAlign:"left" as const }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:C.text }}>
                    <span style={{ fontWeight:700 }}>{userName(cm.user_id)}</span>
                    {isMention && <span style={{ marginLeft:6, fontSize:10, fontWeight:700, color:C.ink, background:C.inkSoft, borderRadius:999, padding:"2px 7px" }}>@メンション</span>}
                  </div>
                  <div style={{ fontSize:13, color:C.textSub, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{cm.message}</div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{target.label}</div>
                </div>
                <ChevronRight size={14} color={C.textMuted} strokeWidth={2} style={{ flexShrink:0 }} />
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={showUserPicker} onClose={() => setShowUserPicker(false)}>
            <div style={{ padding:"0 16px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
              <Users size={14} strokeWidth={2} />ユーザーを切り替え
            </div>
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => { setCurrentUser(u); setRForm(f => ({ ...f, user_id:u.id })); setShowUserPicker(false); }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"11px 14px", borderRadius:14, border:"none", cursor:"pointer", marginBottom:6, background: currentUser?.id === u.id ? C.inkSoft : "transparent" }}
              >
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{u.name}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{roleLabel[u.role]}</div>
                </div>
                {currentUser?.id === u.id && <span style={{ fontSize:12, color:C.ink, fontWeight:700 }}>✓</span>}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => { setShowUserPicker(false); setTab("users"); }}
                style={{ ...btn("secondary", "md"), width:"100%", marginTop:8 }}
              >
                <Users size={15} strokeWidth={2} />
                管理画面
              </button>
            )}
            <button
              onClick={() => { setShowUserPicker(false); handleLogout(); }}
              style={{ ...btn("secondary", "md"), width:"100%", marginTop:8, color:C.textSub }}
            >
              <LogOut size={15} strokeWidth={2} />
              ログアウト
            </button>
            </div>
      </BottomSheet>

      {/* 削除確認ボトムシート */}
      <BottomSheet open={!!deleteModal} onClose={() => setDeleteModal(null)}>
        {deleteModal && (
            <div style={{ padding:"6px 16px 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <div style={{ background:C.dangerBg, borderRadius:12, padding:8, flexShrink:0 }}>
                <Trash2 size={18} color={C.danger} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:15, color:C.text }}>削除の確認</div>
                <div style={{ fontSize:13, color:C.textMuted, marginTop:4 }}>{deleteModal.message}</div>
              </div>
            </div>
            <div style={{ fontSize:12, color:C.textMuted, marginBottom:20, paddingLeft:2 }}>この操作は取り消せません。</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleteModal(null)} style={{ ...btn("secondary", "lg"), flex:1 }}>キャンセル</button>
              <button
                onClick={() => { deleteModal.onConfirm(); setDeleteModal(null); }}
                style={{ ...btn("danger", "lg"), flex:1 }}
              ><Trash2 size={15} strokeWidth={2} />削除する</button>
            </div>
            </div>
        )}
      </BottomSheet>

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
