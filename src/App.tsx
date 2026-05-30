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
  Play, Square, Mic, MicOff, Timer, Map as MapIcon,
  LogIn, LogOut, KeyRound, Eye, EyeOff,
  LeafyGreen, Grape, Apple, MoreVertical,
  ChevronLeft, BarChart2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import CalendarView from "./components/CalendarView";
import type { Schedule } from "./components/CalendarView";
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
interface Crop   { id: number; name: string; start_date: string; }
interface Field  { id: number; name: string; lat: number | null; lng: number | null; }
interface AppSettings { id: number; location_name: string; lat: number; lng: number; }
interface Session { id: number; user_id: number; field_id: number | null; started_at: string; voice_memo: string; }
interface Report {
  id: number; user_id: number; crop_id: number; field: string; date: string;
  work_type: string; quantity: string; work_time: string; note: string;
  image_url: string; weather: string; weather_icon: string; temp: string;
  humidity: string; rain: string;
}
interface WeatherInfo {
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  temp: number | string;
  humidity?: number;
  rain?: number;
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
  bg:        "#f4f7f2",
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
  const [currentUser, setCurrentUser]     = useState<User | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; type: "ok"|"err" } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [wxLoading, setWxLoading]         = useState(true);
  const [wxAuto, setWxAuto]               = useState<WeatherInfo | null>(null);
  const [wxManual, setWxManual]           = useState<WeatherInfo>({ label:"晴れ", Icon:Sun, temp:"" });
  const [rForm, setRForm]                 = useState({ user_id:0, crop_id:0, field:"", date:new Date().toISOString().slice(0,10), work_type:"収穫", quantity:"", work_time:"", note:"" });
  const [cForm, setCForm]                 = useState({ name:"", start_date:new Date().toISOString().slice(0,10) });
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
  const [sessionField, setSessionField]   = useState<number | null>(null);
  // 音声入力
  const [isListening, setIsListening]     = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef                    = useRef<any>(null);
  const [deleteModal, setDeleteModal]     = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId]       = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);

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
      const [{ data: c, error: cErr }, { data: fd, error: fdErr }, { data: r, error: rErr }, { data: s }, { data: sch }] = await Promise.all([
        supabase.from("crops").select("*").eq("org", org).order("id"),
        supabase.from("fields").select("*").eq("org", org).order("id"),
        supabase.from("reports").select("*").eq("org", org).order("date", { ascending: false }),
        supabase.from("settings").select("*").eq("org", org).maybeSingle(),
        orgUserIds.length > 0
          ? supabase.from("schedules").select("*").in("user_id", orgUserIds).order("date")
          : Promise.resolve({ data: null as any, error: null }),
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
    let imageUrl = "";
    if (imageFile) {
      try { imageUrl = await uploadImage(imageFile); }
      catch (e: unknown) {
        setImgUploading(false);
        return showToast((e as Error).message, "err");
      }
    }
    const w = wxAuto || (wxManual.temp ? wxManual : null);
    const { data, error } = await supabase.from("reports").insert([{
      ...rForm, image_url: imageUrl, org: currentOrg,
      weather:      w?.label || "",
      weather_icon: "",
      temp:         w?.temp     ? String(w.temp)     : "",
      humidity:     w?.humidity !== undefined ? String(w.humidity) : "",
      rain:         w?.rain     !== undefined ? String(w.rain)     : "",
    }]).select();
    setImgUploading(false);
    if (error) return showToast("登録に失敗しました", "err");
    if (data) setReports(p => [data[0] as Report, ...p]);
    setImageFile(null);
    setImagePreview("");
    showToast("作業報告を登録しました");
    setTab("home");

    // LINE グループに通知（失敗しても報告登録には影響させない）
    const r = data?.[0] as Report | undefined;
    if (r) {
      const lines = [
        `【作業報告】`,
        `作業者: ${currentUser?.name}`,
        `作物: ${cropName(r.crop_id)}`,
        `圃場: ${r.field || "未設定"}`,
        `作業: ${r.work_type}`,
        ...(r.quantity  ? [`収穫量: ${r.quantity}kg`] : []),
        ...(r.work_time ? [`作業時間: ${r.work_time}h`] : []),
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
  };

  const fmtElapsed = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const startWork = async () => {
    const { data, error } = await supabase.from("sessions").insert([{
      user_id: currentUser?.id, field_id: sessionField || null, started_at: new Date().toISOString(), voice_memo: "",
    }]).select();
    if (error) return showToast(error.message, "err");
    setWorkSession(data![0] as Session);
    setVoiceTranscript("");
    showToast("作業を開始しました");
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
    const { data, error } = await supabase.from("crops").insert([{ ...cForm, org: currentOrg }]).select();
    setSubmitting(false);
    if (error) { console.error("addCrop error:", error); return showToast(error.message, "err"); }
    if (data) setCrops(p => [...p, data[0] as Crop]);
    setCForm({ name:"", start_date:new Date().toISOString().slice(0,10) });
    showToast("作物を追加しました");
  };

  const deleteCrop = (id: number) =>
    confirmDelete("この作物を削除しますか？", async () => {
    const { error } = await supabase.from("crops").delete().eq("id", id);
    if (error) { console.error("deleteCrop error:", error); return showToast(error.message, "err"); }
    setCrops(p => p.filter(c => c.id !== id));
    showToast("作物を削除しました");
  });

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

  const addSchedule = async (date: string, title: string, note: string, crop: string, assignedUserId: number | null, workType: string): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const { data, error } = await supabase.from("schedules").insert([{
        user_id: currentUser.id,
        title,
        date,
        note: note || null,
        crop: crop || null,
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
  const workCount7d   = reports.filter(r => r.date >= sevenAgo).length;
  const weekHarvest   = reports.filter(r => r.date >= weekStart).reduce((s,r) => s+(Number(r.quantity)||0), 0);
  const sortedReports = [...reports].sort((a,b) => b.date.localeCompare(a.date));
  const lastWorkDate  = sortedReports[0]?.date ?? null;
  const daysSinceWork = lastWorkDate ? Math.floor((Date.now()-new Date(lastWorkDate).getTime())/86400000) : null;

  // 作物別月次収穫チャートデータ
  const monthlyHarvest = (cropId: number) => {
    const m: Record<string,number> = {};
    reports.filter(r => r.crop_id === cropId && r.quantity).forEach(r => {
      const k = r.date.slice(0,7);
      m[k] = (m[k]||0) + (Number(r.quantity)||0);
    });
    return Object.entries(m).sort().map(([k,v]) => ({ month: k.slice(5)+"月", total:v }));
  };

  // ─── スタイル ─────────────────────────────────────────
  const S = {
    wrap:    css({ minHeight:"100vh", background:C.bg, paddingBottom:80 }),
    header:  css({ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.primary2} 100%)`, color:"#fff", padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, boxShadow:"0 2px 8px rgba(45,106,45,0.25)", minHeight:0 }),
    headerTitle: css({ fontSize:14, fontWeight:700, letterSpacing:0.3, display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" as const, flex:1, minWidth:0 }),
    headerSub: css({ display:"none" }),
    page:    css({ padding:"16px 16px 0" }),
    sec:     css({ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:10, marginTop:16, display:"flex", alignItems:"center", gap:6, textTransform:"uppercase" as const, letterSpacing:0.5, whiteSpace:"nowrap" as const }),
    lbl:     css({ fontSize:12, fontWeight:600, color:C.textSub, marginBottom:5, display:"flex", alignItems:"center", gap:4 }),
    card:    css({ background:C.card, borderRadius:14, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:`1px solid ${C.border}` }),
    input:   css({ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text, transition:"border 0.15s", boxSizing:"border-box" as const }),
    select:  css({ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text }),
    btn:     css({ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.primary2} 100%)`, color:"#fff", border:"none", borderRadius:10, padding:"13px 0", width:"100%", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 2px 8px rgba(45,106,45,0.3)", whiteSpace:"nowrap" as const }),
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
    color: active ? C.primary : C.textMuted,
    fontSize:10, fontWeight: active ? 700 : 400,
    borderTop: active ? `2px solid ${C.primary}` : "2px solid transparent",
    transition:"all 0.15s",
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

  // worker が管理タブを直接開いていたらホームへ
  if (!isAdmin && tab === "users") setTab("home");

  const navItems = [
    { key:"home",   Icon:Home,    label:"ホーム" },
    { key:"map",    Icon:MapIcon, label:"マップ" },
    { key:"report", Icon:PenLine, label:"報告" },
    { key:"crops",  Icon:Sprout,  label:"作物" },
    ...(isAdmin ? [{ key:"users", Icon:Users, label:"管理" }] : []),
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
          <Wheat size={17} strokeWidth={1.8} />
          農作業レポート
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:"0 0 auto", flexShrink:0 }}>
          {currentUser && (
            <button onClick={() => setShowUserPicker(true)} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.15)", borderRadius:20, padding:"4px 10px 4px 7px", border:"none", cursor:"pointer", color:"#fff", maxWidth:160, overflow:"hidden" }}>
              <UserCircle size={14} strokeWidth={1.8} style={{ flexShrink:0 }} />
              <span style={{ fontSize:12, fontWeight:600, whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis", maxWidth:120 }}>{currentUser.name}</span>
            </button>
          )}
          <button onClick={handleLogout} style={{ display:"flex", alignItems:"center", padding:"4px 8px", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:20, cursor:"pointer", color:"#fff", flexShrink:0 }}>
            <LogOut size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ───── HOME ───── */}
      {tab === "home" && (
        <div style={S.page}>
          <CalendarView
            reports={reports}
            schedules={schedules}
            crops={crops}
            users={users}
            onAddSchedule={addSchedule}
          />
          {/* サマリーカード横スクロール */}
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, marginBottom:4, scrollSnapType:"x mandatory", WebkitOverflowScrolling:"touch" as any, msOverflowStyle:"none" as any, scrollbarWidth:"none" as any }}>
            {/* 天気カード */}
            {wxLoading ? (
              <div style={{ background:`linear-gradient(135deg,#f0faf0,#daf0da)`, borderRadius:16, padding:"16px 20px", minWidth:140, flexShrink:0, border:`1px solid ${C.primary4}`, scrollSnapAlign:"start", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                <RefreshCw size={18} color={C.primary} strokeWidth={1.8} />
                <div style={{ fontSize:11, color:C.textSub, fontWeight:600 }}>取得中...</div>
              </div>
            ) : wxAuto ? (
              <div style={{ background:`linear-gradient(135deg,#f0faf0,#daf0da)`, borderRadius:16, padding:"16px 20px", minWidth:140, flexShrink:0, border:`1px solid ${C.primary4}`, scrollSnapAlign:"start", display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ fontSize:11, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                  <wxAuto.Icon size={11} color={C.primary} strokeWidth={2} />今日の天気
                </div>
                <div style={{ fontSize:30, fontWeight:800, color:C.text, lineHeight:1.1 }}>{wxAuto.temp}°</div>
                <div style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>{wxAuto.label}</div>
                {wxAuto.humidity !== undefined && (
                  <div style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:3, marginTop:2 }}>
                    <Droplets size={10} color="#1976d2" strokeWidth={2}/>{wxAuto.humidity}%
                  </div>
                )}
              </div>
            ) : null}
            {/* 7日間作業数 */}
            <div style={{ background:C.card, borderRadius:16, padding:"16px 20px", minWidth:140, flexShrink:0, border:`1px solid ${C.border}`, scrollSnapAlign:"start", display:"flex", flexDirection:"column", gap:4, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <CalendarDays size={11} color={C.primary} strokeWidth={2} />直近7日間
              </div>
              <div style={{ fontSize:30, fontWeight:800, color:C.text, lineHeight:1.1 }}>{workCount7d}</div>
              <div style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>件の作業報告</div>
            </div>
            {/* 今週の収穫量 */}
            <div style={{ background:C.card, borderRadius:16, padding:"16px 20px", minWidth:140, flexShrink:0, border:`1px solid ${C.border}`, scrollSnapAlign:"start", display:"flex", flexDirection:"column", gap:4, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <PackageCheck size={11} color={C.primary} strokeWidth={2} />今週の収穫
              </div>
              <div style={{ fontSize:30, fontWeight:800, color:C.text, lineHeight:1.1 }}>{weekHarvest > 0 ? weekHarvest : "—"}</div>
              <div style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>{weekHarvest > 0 ? "kg 収穫" : "収穫なし"}</div>
            </div>
            {/* 最終作業からの日数 */}
            <div style={{ background:C.card, borderRadius:16, padding:"16px 20px", minWidth:140, flexShrink:0, border:`1px solid ${C.border}`, scrollSnapAlign:"start", display:"flex", flexDirection:"column", gap:4, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:C.textSub, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <Clock size={11} color={C.primary} strokeWidth={2} />最終作業
              </div>
              <div style={{ fontSize:30, fontWeight:800, color: daysSinceWork !== null && daysSinceWork > 7 ? "#e07020" : C.text, lineHeight:1.1 }}>
                {daysSinceWork !== null ? daysSinceWork : "—"}
              </div>
              <div style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>{daysSinceWork !== null ? "日前" : "記録なし"}</div>
            </div>
          </div>

          <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />作物サマリー</div>

          {cropStats.length === 0 ? (
            <div style={{ textAlign:"center", padding:"28px 16px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, marginBottom:10 }}>
              <div style={{ background:C.primary3, borderRadius:14, width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <Sprout size={22} color={C.primary} strokeWidth={1.5} />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>作物が登録されていません</div>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:14 }}>作物タブから追加してください</div>
              <button style={{ background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", border:"none", borderRadius:10, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }} onClick={() => setTab("crops")}>
                <PlusCircle size={14} strokeWidth={2} />作物を追加
              </button>
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
                  <span style={{ marginLeft:4, fontSize:12, color:C.textMuted, flexShrink:0 }}>{expanded ? "▲" : "▼"}</span>
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
                      onClick={e => { e.stopPropagation(); setSelectedCropId(c.id); }}
                      style={{ width:"100%", padding:"9px 0", borderRadius:10, border:`1.5px solid ${C.primary4}`, background:C.primary3, color:C.primary, fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
                    >
                      <BarChart2 size={14} strokeWidth={2} />詳細を見る
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
                {r.work_time && <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11} strokeWidth={2}/>{r.work_time}h</span>}
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
            </div>
          ))}
        </div>
      )}

      {/* ───── MAP ───── */}
      {tab === "map" && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:60, display:"flex", flexDirection:"column" }}>
          {/* ⑪ マップタイトル */}
          <div style={{ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.primary2} 100%)`, color:"#fff", padding:"10px 16px", display:"flex", alignItems:"center", gap:8, zIndex:10, flexShrink:0 }}>
            <MapIcon size={16} strokeWidth={2} />
            <span style={{ fontSize:15, fontWeight:700 }}>農場マップ</span>
          </div>
          {/* Leaflet マップ */}
          <MapContainer
            center={userPos ?? [weatherCoords?.lat ?? 35.0167, weatherCoords?.lng ?? 135.5833]}
            zoom={15}
            style={{ flex:1, width:"100%", height:"100%" }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {userPos && (
              <Marker position={userPos} icon={PIN_BLUE}>
                <Popup><b>現在地</b></Popup>
              </Marker>
            )}
            {fields.filter(f => f.lat && f.lng).map(f => (
              <Marker key={f.id} position={[f.lat!, f.lng!]} icon={PIN_GREEN}>
                <Popup><b>{f.name}</b></Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* 作業セッションバー */}
          <div style={{ background:"#fff", borderTop:`1px solid ${C.border}`, padding:"12px 16px", flexShrink:0 }}>
            {workSession && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#e53935", animation:"pulse 1s infinite" }} />
                  <span style={{ fontSize:12, fontWeight:700, color:C.textSub }}>作業中</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, background:C.primary3, borderRadius:8, padding:"4px 12px" }}>
                  <Timer size={14} color={C.primary} strokeWidth={2} />
                  <span style={{ fontSize:20, fontWeight:700, color:C.primary, fontVariantNumeric:"tabular-nums", letterSpacing:1 }}>{fmtElapsed(workElapsed)}</span>
                </div>
                <button
                  onClick={toggleVoice}
                  style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 12px", borderRadius:20, border:`1.5px solid ${isListening ? "#e53935" : C.border}`, background: isListening ? "#fdecea" : "#fff", color: isListening ? "#e53935" : C.textSub, fontWeight:700, fontSize:12, cursor:"pointer" }}
                >
                  {isListening ? <MicOff size={14} strokeWidth={2} /> : <Mic size={14} strokeWidth={2} />}
                  {isListening ? "停止" : "音声"}
                </button>
              </div>
            )}
            {workSession && voiceTranscript && (
              <div style={{ background:C.bg, borderRadius:8, padding:"6px 10px", marginBottom:8, fontSize:11, color:C.textSub, borderLeft:`3px solid ${C.primary4}` }}>
                {voiceTranscript}
              </div>
            )}
            {!workSession ? (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <select
                  style={{ flex:1, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, background:"#fafcfa", color:C.text }}
                  value={sessionField ?? ""}
                  onChange={e => setSessionField(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">圃場を選択</option>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button
                  onClick={startWork}
                  style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px 0", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", boxShadow:`0 2px 8px rgba(45,106,45,0.35)`, whiteSpace:"nowrap" as const, flexShrink:0, minWidth:0 }}
                >
                  <Play size={18} strokeWidth={2} style={{ flexShrink:0 }} />農作業を開始する
                </button>
              </div>
            ) : (
              <button
                onClick={stopWork}
                style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"13px 0", borderRadius:10, border:"none", background:`linear-gradient(135deg,#c0392b,#e53935)`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", boxShadow:"0 2px 8px rgba(192,57,43,0.35)" }}
              >
                <Square size={18} strokeWidth={2} />農作業を終了する
              </button>
            )}
          </div>
        </div>
      )}

      {/* ───── REPORT ───── */}
      {tab === "report" && (
        <div style={S.page}>
          <div style={S.sec}><PenLine size={14} strokeWidth={2} />作業報告を登録</div>

          <div style={S.wxBox}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:C.textSub, fontWeight:600 }}>
              <MapPin size={13} color={C.primary} strokeWidth={2} />
              {weatherCoords?.name ?? "..."} · 天気（自動入力）
            </div>
            {wxLoading
              ? <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, fontSize:13, color:C.textMuted }}><RefreshCw size={14} strokeWidth={2} />取得中...</div>
              : wxAuto
              ? <WxBadges wx={wxAuto} />
              : (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:8, marginBottom:10, fontSize:12, color:"#d07030" }}>
                    <AlertCircle size={13} strokeWidth={2} />手動で入力してください
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <select style={{ ...S.select, marginBottom:0, flex:2 }} value={wxManual.label}
                      onChange={e => { const o = WEATHER_OPTIONS.find(x => x.label === e.target.value) || WEATHER_OPTIONS[0]; setWxManual(f => ({ ...f, label:o.label, Icon:o.icon })); }}>
                      {WEATHER_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                    </select>
                    <input type="number" placeholder="気温°C" style={{ ...S.input, marginBottom:0, flex:1 }}
                      value={wxManual.temp} onChange={e => setWxManual(f => ({ ...f, temp:e.target.value }))} />
                  </div>
                </div>
              )}
          </div>

          <div style={S.card}>
            <div style={S.lbl}><Wheat size={13} strokeWidth={2} />作業の種類</div>
            <select style={S.select} value={rForm.work_type} onChange={e => setRForm(f => ({ ...f, work_type:e.target.value }))}>
              {WORK_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />日付</div>
            <input type="date" style={{ ...S.input, paddingRight:32, minWidth:200, boxSizing:"border-box" }} value={rForm.date} onChange={e => setRForm(f => ({ ...f, date:e.target.value }))} />

            <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />作業者</div>
            <select style={S.select} value={rForm.user_id} onChange={e => setRForm(f => ({ ...f, user_id:Number(e.target.value) }))}>
              {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物</div>
            <select style={S.select} value={rForm.crop_id} onChange={e => setRForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場</div>
            <select style={S.select} value={rForm.field} onChange={e => setRForm(f => ({ ...f, field:e.target.value }))}>
              {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>

            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={S.lbl}><PackageCheck size={13} strokeWidth={2} />収穫量 (kg)</div>
                <input type="number" style={S.input} placeholder="例: 20" value={rForm.quantity} onChange={e => setRForm(f => ({ ...f, quantity:e.target.value }))} />
              </div>
              <div style={{ flex:1 }}>
                <div style={S.lbl}><Clock size={13} strokeWidth={2} />作業時間 (h)</div>
                <input type="number" style={S.input} placeholder="例: 2" value={rForm.work_time} onChange={e => setRForm(f => ({ ...f, work_time:e.target.value }))} />
              </div>
            </div>

            <div style={S.lbl}><Camera size={13} strokeWidth={2} />写真</div>
            <input
              type="file" id="img-input" accept="image/*"
              style={{ display:"none" }}
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
                <img src={imagePreview} alt="preview" style={{ width:"100%", borderRadius:10, maxHeight:220, objectFit:"cover", display:"block" }} />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(""); }}
                  style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.55)", border:"none", borderRadius:20, padding:"5px 10px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}
                >
                  <X size={12} strokeWidth={2.5} />削除
                </button>
              </div>
            ) : (
              <label htmlFor="img-input" style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, border:`2px dashed ${C.border}`, borderRadius:10, padding:"24px 0", cursor:"pointer", marginBottom:12, color:C.textMuted, fontSize:13, background:C.bg }}>
                <Camera size={26} color={C.textMuted} strokeWidth={1.5} />
                <span>タップして写真を選択</span>
              </label>
            )}

            <div style={S.lbl}><PenLine size={13} strokeWidth={2} />メモ</div>
            <input style={S.input} placeholder="気づいたことなど" value={rForm.note} onChange={e => setRForm(f => ({ ...f, note:e.target.value }))} />

            <button style={{ ...S.btn, opacity: imgUploading ? 0.7 : 1 }} onClick={addReport} disabled={imgUploading}>
              {imgUploading
                ? <><RefreshCw size={16} strokeWidth={2} />アップロード中...</>
                : <><ClipboardList size={16} strokeWidth={2} />報告を登録する</>}
            </button>
          </div>
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
                <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />作物を追加</div>
                <div style={S.card}>
                  <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物名 *</div>
                  <input style={S.input} placeholder="例: キャベツ" value={cForm.name} onChange={e => setCForm(f => ({ ...f, name:e.target.value }))} />
                  <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />作付け日</div>
                  <input type="date" style={{ ...S.input, padding:"11px 14px" }} value={cForm.start_date} onChange={e => setCForm(f => ({ ...f, start_date:e.target.value }))} />
                  <button style={{ ...S.btn, opacity:submitting?0.7:1 }} onClick={addCrop} disabled={submitting}>
                    {submitting ? <><RefreshCw size={16} strokeWidth={2} />追加中...</> : <><PlusCircle size={16} strokeWidth={2} />作物を追加</>}
                  </button>
                </div>
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

      {/* ───── 作物詳細 ───── */}
      {selectedCropId !== null && (() => {
        const crop = crops.find(c => c.id === selectedCropId);
        if (!crop) return null;
        const ci = getCropIcon(crop.name);
        const cropReports = reports.filter(r => r.crop_id === selectedCropId).sort((a,b) => b.date.localeCompare(a.date));
        const chartData = monthlyHarvest(selectedCropId);
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

              {chartData.length > 0 && (
                <>
                  <div style={S.sec}><BarChart2 size={14} strokeWidth={2} />月別収穫量 (kg)</div>
                  <div style={{ background:C.card, borderRadius:14, padding:"16px 6px 8px", marginBottom:14, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:`1px solid ${C.border}` }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData} margin={{ top:0, right:8, bottom:0, left:-16 }}>
                        <XAxis dataKey="month" tick={{ fontSize:11, fill:C.textMuted }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${C.border}`, boxShadow:"0 2px 8px rgba(0,0,0,0.1)" }}
                          formatter={(v: unknown) => [`${Number(v)}kg`, "収穫量"]}
                        />
                        <Bar dataKey="total" radius={[6,6,0,0]} maxBarSize={44}>
                          {chartData.map((_,i) => <Cell key={i} fill={C.primary} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                    {r.work_time && <span style={{ color:C.textMuted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11} strokeWidth={2}/>{r.work_time}h</span>}
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
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ナビゲーション */}
      <nav style={S.nav}>
        {navItems.map(n => (
          <button key={n.key} style={navBtn(tab === n.key)} onClick={() => setTab(n.key)}>
            <n.Icon size={22} strokeWidth={tab === n.key ? 2.2 : 1.8} />
            {n.label}
          </button>
        ))}
      </nav>

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
