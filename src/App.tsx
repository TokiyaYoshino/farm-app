import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Home, PenLine, Sprout, Users, Leaf, Thermometer,
  Droplets, CloudRain, Sun, Cloud, CloudSun, CloudDrizzle,
  Snowflake, CloudLightning, MapPin, RefreshCw, AlertCircle,
  PackageCheck, RotateCcw, CalendarDays, Clock, Wheat,
  UserCircle, Trash2, PlusCircle, ClipboardList,
  Wind, Camera, X, Navigation, Search, Save,
  Play, Square, Mic, MicOff, Timer, Map as MapIcon,
} from "lucide-react";
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



// ─── 型 ─────────────────────────────────────────────────
type Role = "admin" | "worker" | "viewer";
interface User   { id: number; name: string; role: Role; }
interface Crop   { id: number; name: string; start_date: string; }
interface Field  { id: number; name: string; lat: number | null; lng: number | null; }
interface AppSettings { id: number; location_name: string; lat: number; lng: number; }
interface Session { id: number; user_id: number; field_id: number | null; started_at: string; voice_memo: string; }
interface Report {
  id: number; user_id: number; crop_id: number; field: string; date: string;
  work_type: string; quantity: string; work_time: string; note: string;
  image_url: string; weather: string; weather_icon: string; temp: string;
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
  body { background: ${C.bg}; font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  input, select, button { font-family: inherit; }
  input:focus, select:focus { outline: 2px solid ${C.primary}; outline-offset: -1px; }
`;

// ─── ユーティリティ ──────────────────────────────────────
const css = (o: CSSProperties): CSSProperties => o;

export default function App() {
  const [tab, setTab]                     = useState("home");
  const [users, setUsers]                 = useState<User[]>([]);
  const [crops, setCrops]                 = useState<Crop[]>([]);
  const [fields, setFields]               = useState<Field[]>([]);
  const [reports, setReports]             = useState<Report[]>([]);
  const [currentUser, setCurrentUser]     = useState<User | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; type: "ok"|"err" } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [wxLoading, setWxLoading]         = useState(true);
  const [wxAuto, setWxAuto]               = useState<WeatherInfo | null>(null);
  const [wxManual, setWxManual]           = useState<WeatherInfo>({ label:"晴れ", Icon:Sun, temp:"" });
  const [rForm, setRForm]                 = useState({ user_id:0, crop_id:0, field:"", date:new Date().toISOString().slice(0,10), work_type:"収穫", quantity:"", work_time:"", note:"" });
  const [uForm, setUForm]                 = useState({ name:"", role:"worker" as Role });
  const [cForm, setCForm]                 = useState({ name:"", start_date:new Date().toISOString().slice(0,10) });
  const [fForm, setFForm]                 = useState({ name:"" });
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState("");
  const [imgUploading, setImgUploading]   = useState(false);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [locInput, setLocInput]           = useState("");
  const [locSearching, setLocSearching]   = useState(false);
  const [locPreview, setLocPreview]       = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [locSaving, setLocSaving]         = useState(false);
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

  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = globalStyle;
    document.head.appendChild(styleEl);
    return () => { document.head.removeChild(styleEl); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
      setLoading(true);
      const [{ data: u, error: uErr }, { data: c, error: cErr }, { data: fd, error: fdErr }, { data: r, error: rErr }, { data: s }] = await Promise.all([
        supabase.from("users").select("*").order("id"),
        supabase.from("crops").select("*").order("id"),
        supabase.from("fields").select("*").order("id"),
        supabase.from("reports").select("*").order("date", { ascending: false }),
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      if (uErr)  console.error("users fetch error:",   uErr);
      if (cErr)  console.error("crops fetch error:",   cErr);
      if (fdErr) console.error("fields fetch error:",  fdErr);
      if (rErr)  console.error("reports fetch error:", rErr);
      const loc = s
        ? { lat:(s as AppSettings).lat, lng:(s as AppSettings).lng, name:(s as AppSettings).location_name }
        : { lat:35.0167, lng:135.5833, name:"京都府亀岡市" };
      setWeatherCoords(loc);
      setLocInput(loc.name);
      if (u && u.length > 0) {
        const userList = u as User[];
        setUsers(userList);
        const defaultUser = userList.find(x => x.name === "吉野")
          || userList.find(x => x.role === "admin")
          || userList[0];
        setCurrentUser(defaultUser);
        setRForm(f => ({ ...f, user_id: defaultUser?.id || 0 }));
      }
      if (c)  { setCrops(c as Crop[]); setRForm(f => ({ ...f, crop_id: (c[0] as Crop)?.id || 0 })); }
      if (fd) { setFields(fd as Field[]); setRForm(f => ({ ...f, field: (fd[0] as Field)?.name || "" })); }
      if (r)  setReports(r as Report[]);
      setLoading(false);
      } catch (e) {
        console.error("Startup error:", e);
        setLoading(false);
      }
    })();
  }, []);

  // GPS取得
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
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
        const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&current=relative_humidity_2m,rain&timezone=Asia%2FTokyo`);
        const data = await res.json();
        const cw   = data.current_weather;
        const cur  = data.current;
        const lbl  = WMO_MAP[cw.weathercode as number] || "曇り";
        const opt  = WEATHER_OPTIONS.find(o => o.label === lbl) || WEATHER_OPTIONS[3];
        const rain = cur?.rain ?? 0;
        if (!cancelled) setWxAuto({
          label: opt.label, Icon: opt.icon, temp: Math.round(cw.temperature),
          humidity: Math.round(cur?.relative_humidity_2m ?? 0),
          rain: rain > 0 ? rain : undefined,
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
      ...rForm, image_url: imageUrl,
      weather:      w?.label || "",
      weather_icon: "",
      temp:         w?.temp ? String(w.temp) : "",
    }]).select();
    setImgUploading(false);
    if (error) return showToast("登録に失敗しました", "err");
    if (data) setReports(p => [data[0] as Report, ...p]);
    setImageFile(null);
    setImagePreview("");
    showToast("作業報告を登録しました");
    setTab("home");
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
    recognitionRef.current?.stop();
    setIsListening(false);
    setWorkSession(null);
    setRForm(f => ({ ...f, work_time: mins > 0 ? String(mins) : "", note: voiceTranscript ? (f.note ? f.note + "\n" + voiceTranscript : voiceTranscript) : f.note }));
    showToast(`作業終了 ${fmtElapsed(workElapsed)} → 報告フォームに反映しました`);
    setTab("report");
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return showToast("このブラウザは音声入力非対応です", "err");
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      // 確定済みの結果（isFinal）だけを処理
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript;
        }
      }
      if (!finalText) return;
      setVoiceTranscript(p => (p ? p + "　" + finalText : finalText));
      for (const [kw, wt] of Object.entries(VOICE_WORK_MAP)) {
        if (finalText.includes(kw)) { setRForm(f => ({ ...f, work_type: wt })); break; }
      }
    };
    rec.onerror = (e: any) => { console.error("SpeechRecognition error:", e.error); setIsListening(false); };
    rec.onend   = () => {
      // continuous モードで予期せず停止した場合は再起動
      if (recognitionRef.current === rec) {
        try { rec.start(); } catch { setIsListening(false); }
      }
    };
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const setFieldLocation = async (fieldId: number) => {
    if (!userPos) return showToast("GPS位置を取得中です", "err");
    const { error } = await supabase.from("fields").update({ lat: userPos[0], lng: userPos[1] }).eq("id", fieldId);
    if (error) return showToast(error.message, "err");
    setFields(p => p.map(f => f.id === fieldId ? { ...f, lat: userPos[0], lng: userPos[1] } : f));
    showToast("圃場の位置を現在地に設定しました");
  };

  const addUser = async () => {
    if (!uForm.name.trim()) return;
    const { data, error } = await supabase.from("users").insert([uForm]).select();
    if (error) { console.error("addUser error:", error); return showToast(error.message, "err"); }
    if (data) setUsers(p => [...p, data[0] as User]);
    setUForm({ name:"", role:"worker" });
    showToast("ユーザーを追加しました");
  };

  const deleteUser = async (id: number) => {
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) { console.error("deleteUser error:", error); return showToast(error.message, "err"); }
    setUsers(p => p.filter(u => u.id !== id));
    showToast("ユーザーを削除しました");
  };

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
    const { error } = await supabase.from("settings").upsert({ id:1, location_name:locPreview.name, lat:locPreview.lat, lng:locPreview.lng });
    setLocSaving(false);
    if (error) return showToast(error.message, "err");
    setWeatherCoords(locPreview);
    setWxLoading(true);
    setWxAuto(null);
    showToast("農場の場所を保存しました");
  };

  const addCrop = async () => {
    if (!cForm.name.trim()) return;
    const { data, error } = await supabase.from("crops").insert([cForm]).select();
    if (error) { console.error("addCrop error:", error); return showToast(error.message, "err"); }
    if (data) setCrops(p => [...p, data[0] as Crop]);
    setCForm({ name:"", start_date:new Date().toISOString().slice(0,10) });
    showToast("作物を追加しました");
  };

  const deleteCrop = async (id: number) => {
    const { error } = await supabase.from("crops").delete().eq("id", id);
    if (error) { console.error("deleteCrop error:", error); return showToast(error.message, "err"); }
    setCrops(p => p.filter(c => c.id !== id));
    showToast("作物を削除しました");
  };

  const addField = async () => {
    if (!fForm.name.trim()) return;
    const { data, error } = await supabase.from("fields").insert([fForm]).select();
    if (error) { console.error("addField error:", error); return showToast(error.message, "err"); }
    if (data) setFields(p => [...p, data[0] as Field]);
    setFForm({ name:"" });
    showToast("圃場を追加しました");
  };

  const deleteField = async (id: number) => {
    const { error } = await supabase.from("fields").delete().eq("id", id);
    if (error) { console.error("deleteField error:", error); return showToast(error.message, "err"); }
    setFields(p => p.filter(f => f.id !== id));
    showToast("圃場を削除しました");
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

  // ─── スタイル ─────────────────────────────────────────
  const S = {
    wrap:    css({ minHeight:"100vh", background:C.bg, paddingBottom:80 }),
    header:  css({ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.primary2} 100%)`, color:"#fff", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 2px 8px rgba(45,106,45,0.25)" }),
    headerTitle: css({ fontSize:17, fontWeight:700, letterSpacing:0.5, display:"flex", alignItems:"center", gap:8 }),
    headerSub: css({ fontSize:11, color:"rgba(255,255,255,0.75)", marginTop:2 }),
    page:    css({ padding:"16px 16px 0" }),
    sec:     css({ fontSize:13, fontWeight:700, color:C.textSub, marginBottom:10, marginTop:16, display:"flex", alignItems:"center", gap:6, textTransform:"uppercase" as const, letterSpacing:0.5 }),
    lbl:     css({ fontSize:12, fontWeight:600, color:C.textSub, marginBottom:5, display:"flex", alignItems:"center", gap:4 }),
    card:    css({ background:C.card, borderRadius:14, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:`1px solid ${C.border}` }),
    input:   css({ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text, transition:"border 0.15s" }),
    select:  css({ width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:15, marginBottom:12, background:"#fafcfa", color:C.text }),
    btn:     css({ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.primary2} 100%)`, color:"#fff", border:"none", borderRadius:10, padding:"13px 0", width:"100%", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 2px 8px rgba(45,106,45,0.3)" }),
    btnSm:   css({ background:C.dangerBg, color:C.danger, border:`1.5px solid ${C.danger}22`, borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }),
    row:     css({ display:"flex", justifyContent:"space-between", alignItems:"center" }),
    wxBox:   css({ background:`linear-gradient(135deg, #f0faf0 0%, #daf0da 100%)`, borderRadius:14, padding:"14px 16px", marginBottom:14, border:`1px solid ${C.primary4}` }),
    wxGrid:  css({ display:"flex", flexWrap:"wrap" as const, gap:8, marginTop:8 }),
    wxBadge: css({ background:"rgba(255,255,255,0.85)", backdropFilter:"blur(4px)", borderRadius:10, padding:"7px 12px", display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600, color:C.text, border:`1px solid ${C.border}` }),

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
    border:`1px solid ${roleColor[role]}30`,
  });


  // ─── 天気バッジ ───────────────────────────────────────
  const WxBadges = ({ wx }: { wx: WeatherInfo }) => (
    <div style={S.wxGrid}>
      <span style={S.wxBadge}><wx.Icon size={15} color={C.primary} strokeWidth={2} /> {wx.label}</span>
      <span style={S.wxBadge}><Thermometer size={15} color="#e07020" strokeWidth={2} /> {wx.temp}°C</span>
      {wx.humidity !== undefined && <span style={S.wxBadge}><Droplets size={15} color="#1976d2" strokeWidth={2} /> {wx.humidity}%</span>}
      {wx.rain !== undefined     && <span style={S.wxBadge}><CloudRain size={15} color="#0288d1" strokeWidth={2} /> {wx.rain}mm</span>}
    </div>
  );

  const navItems = [
    { key:"home",   Icon:Home,    label:"ホーム" },
    { key:"map",    Icon:MapIcon, label:"マップ" },
    { key:"report", Icon:PenLine, label:"報告" },
    { key:"crops",  Icon:Sprout,  label:"作物" },
    { key:"users",  Icon:Users,   label:"管理" },
  ];

  if (loading) return (
    <div style={S.center}>
      <Leaf size={36} color={C.primary} strokeWidth={1.5} />
      <span>読み込み中...</span>
    </div>
  );

  return (
    <div style={S.wrap}>
      {/* ヘッダー */}
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>
            <Wheat size={20} strokeWidth={1.8} />
            農作業レポート
          </div>
          <div style={S.headerSub}>Farm Management System</div>
        </div>
        {currentUser && (
          <button onClick={() => setShowUserPicker(true)} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.15)", borderRadius:20, padding:"5px 12px 5px 8px", border:"none", cursor:"pointer", color:"#fff" }}>
            <UserCircle size={16} strokeWidth={1.8} />
            <span style={{ fontSize:13, fontWeight:600 }}>{currentUser.name}</span>
            <span style={{ fontSize:10, opacity:0.7, marginLeft:1 }}>▼</span>
          </button>
        )}
      </div>

      {/* ───── HOME ───── */}
      {tab === "home" && (
        <div style={S.page}>
          <div style={S.wxBox}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:C.textSub, fontWeight:600 }}>
              <MapPin size={13} color={C.primary} strokeWidth={2} />
              {weatherCoords?.name ?? "..."} · 現在の天気
            </div>
            {wxLoading
              ? <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, fontSize:13, color:C.textMuted }}><RefreshCw size={14} strokeWidth={2} />取得中...</div>
              : wxAuto
              ? <WxBadges wx={wxAuto} />
              : <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, fontSize:13, color:"#d07030" }}><AlertCircle size={14} strokeWidth={2} />取得できませんでした</div>
            }
          </div>

          <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />作物サマリー</div>
          {cropStats.map(c => (
            <div key={c.id} style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ background:C.primary3, borderRadius:8, padding:6 }}>
                  <Leaf size={16} color={C.primary} strokeWidth={2} />
                </div>
                <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{c.name}</div>
                {c.growDays !== null && (
                  <span style={{ marginLeft:"auto", fontSize:11, color:C.primary, background:C.primary3, borderRadius:6, padding:"2px 8px", fontWeight:600 }}>
                    生育 {c.growDays}日
                  </span>
                )}
              </div>
              <div style={S.divider} />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ background:C.bg, borderRadius:9, padding:"8px 10px" }}>
                  <div style={{ fontSize:10, color:C.textMuted, marginBottom:2, display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={10} strokeWidth={2} />作付け日</div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{c.start_date || "—"}</div>
                </div>
                <div style={{ background:C.bg, borderRadius:9, padding:"8px 10px" }}>
                  <div style={{ fontSize:10, color:C.textMuted, marginBottom:2, display:"flex", alignItems:"center", gap:3 }}><PackageCheck size={10} strokeWidth={2} />累計収穫量</div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{c.tot > 0 ? `${c.tot} kg` : "—"}</div>
                </div>
                <div style={{ background:C.bg, borderRadius:9, padding:"8px 10px" }}>
                  <div style={{ fontSize:10, color:C.textMuted, marginBottom:2, display:"flex", alignItems:"center", gap:3 }}><CalendarDays size={10} strokeWidth={2} />最終作業日</div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{c.last?.date || "—"}</div>
                </div>
                <div style={{ background:C.bg, borderRadius:9, padding:"8px 10px" }}>
                  <div style={{ fontSize:10, color:C.textMuted, marginBottom:2, display:"flex", alignItems:"center", gap:3 }}><RotateCcw size={10} strokeWidth={2} />作業回数</div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{c.count}回</div>
                </div>
              </div>
            </div>
          ))}

          <div style={S.sec}><ClipboardList size={14} strokeWidth={2} />最新の作業報告</div>
          {reports.slice(0,5).map(r => (
            <div key={r.id} style={S.card}>
              <div style={S.row}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ background:C.primary3, borderRadius:7, padding:5 }}>
                    <Sprout size={13} color={C.primary} strokeWidth={2} />
                  </div>
                  <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{cropName(r.crop_id)}</span>
                  <span style={{ fontSize:11, color: r.field ? C.primary : C.textMuted, background: r.field ? C.primary3 : C.bg, borderRadius:6, padding:"1px 7px", fontWeight:600 }}>{r.field || "未設定"}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:C.textMuted }}>
                  <CalendarDays size={11} strokeWidth={2} />
                  {r.date}
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
                {r.weather && <span style={{ fontSize:11, color:C.textSub }}>{r.weather}{r.temp ? ` · ${r.temp}°C` : ""}</span>}
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
                  style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px 0", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.primary},${C.primary2})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", boxShadow:`0 2px 8px rgba(45,106,45,0.35)` }}
                >
                  <Play size={18} strokeWidth={2} />農作業を開始する
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
            <input type="date" style={S.input} value={rForm.date} onChange={e => setRForm(f => ({ ...f, date:e.target.value }))} />

            <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />作業者</div>
            <select style={S.select} value={rForm.user_id} onChange={e => setRForm(f => ({ ...f, user_id:Number(e.target.value) }))}>
              {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物</div>
                <select style={S.select} value={rForm.crop_id} onChange={e => setRForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
                  {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場</div>
                <select style={S.select} value={rForm.field} onChange={e => setRForm(f => ({ ...f, field:e.target.value }))}>
                  {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
              </div>
            </div>

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
          <div style={S.sec}><Sprout size={14} strokeWidth={2} />作物を追加</div>
          <div style={S.card}>
            <div style={S.lbl}><Leaf size={13} strokeWidth={2} />作物名 *</div>
            <input style={S.input} placeholder="例: キャベツ" value={cForm.name} onChange={e => setCForm(f => ({ ...f, name:e.target.value }))} />
            <div style={S.lbl}><CalendarDays size={13} strokeWidth={2} />作付け日</div>
            <input type="date" style={S.input} value={cForm.start_date} onChange={e => setCForm(f => ({ ...f, start_date:e.target.value }))} />
            <button style={S.btn} onClick={addCrop}><PlusCircle size={16} strokeWidth={2} />作物を追加</button>
          </div>
          <div style={S.sec}><Leaf size={14} strokeWidth={2} />登録作物</div>
          {crops.map(c => (
            <div key={c.id} style={S.card}>
              <div style={S.row}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ background:C.primary3, borderRadius:10, padding:8 }}>
                    <Leaf size={18} color={C.primary} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{c.name}</div>
                    <div style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                      <CalendarDays size={11} strokeWidth={2} />作付け: {c.start_date}
                    </div>
                  </div>
                </div>
                <button style={S.btnSm} onClick={() => deleteCrop(c.id)}>
                  <Trash2 size={12} strokeWidth={2} />削除
                </button>
              </div>
            </div>
          ))}
          <div style={S.sec}><MapPin size={14} strokeWidth={2} />圃場管理</div>
          <div style={S.card}>
            <div style={S.lbl}><MapPin size={13} strokeWidth={2} />圃場名 *</div>
            <input style={S.input} placeholder="例: A圃場" value={fForm.name} onChange={e => setFForm({ name:e.target.value })} />
            <button style={S.btn} onClick={addField}><PlusCircle size={16} strokeWidth={2} />圃場を追加</button>
          </div>
          {fields.map(f => (
            <div key={f.id} style={S.card}>
              <div style={S.row}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ background: f.lat ? C.primary3 : C.bg, borderRadius:9, padding:7 }}>
                    <MapPin size={16} color={f.lat ? C.primary : C.textMuted} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{f.name}</div>
                    <div style={{ fontSize:11, color:C.textMuted }}>{f.lat ? `${f.lat.toFixed(4)}, ${f.lng?.toFixed(4)}` : "位置未設定"}</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button style={{ ...S.btnSm, background:C.primary3, color:C.primary, border:`1.5px solid ${C.primary4}` }} onClick={() => setFieldLocation(f.id)}>
                    <Navigation size={12} strokeWidth={2} />現在地
                  </button>
                  <button style={S.btnSm} onClick={() => deleteField(f.id)}>
                    <Trash2 size={12} strokeWidth={2} />削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ───── USERS ───── */}
      {tab === "users" && (
        <div style={S.page}>
          <div style={S.sec}><Navigation size={14} strokeWidth={2} />農場の場所設定</div>
          <div style={S.card}>
            <div style={S.lbl}><MapPin size={13} strokeWidth={2} />場所を検索</div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <input
                style={{ ...S.input, marginBottom:0, flex:1 }}
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

          <div style={S.sec}><PlusCircle size={14} strokeWidth={2} />ユーザーを追加</div>
          <div style={S.card}>
            <div style={S.lbl}><UserCircle size={13} strokeWidth={2} />名前 *</div>
            <input style={S.input} placeholder="例: 山田 三郎" value={uForm.name} onChange={e => setUForm(f => ({ ...f, name:e.target.value }))} />
            <div style={S.lbl}><Users size={13} strokeWidth={2} />役割</div>
            <select style={S.select} value={uForm.role} onChange={e => setUForm(f => ({ ...f, role:e.target.value as Role }))}>
              <option value="worker">作業者</option>
              <option value="viewer">閲覧者</option>
            </select>
            <button style={S.btn} onClick={addUser}><PlusCircle size={16} strokeWidth={2} />ユーザーを追加</button>
          </div>

          <div style={S.sec}><Users size={14} strokeWidth={2} />登録済みユーザー</div>
          {users.map(u => (
            <div key={u.id} style={S.card}>
              <div style={S.row}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ background:C.primary3, borderRadius:9, padding:7 }}>
                    <UserCircle size={16} color={C.primary} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{u.name}</div>
                    <span style={tagStyle(u.role)}>{roleLabel[u.role]}</span>
                  </div>
                </div>
                <button style={S.btnSm} onClick={() => deleteUser(u.id)}>
                  <Trash2 size={12} strokeWidth={2} />削除
                </button>
              </div>
            </div>
          ))}

        </div>
      )}

      {/* ナビゲーション */}
      <nav style={S.nav}>
        {navItems.map(n => (
          <button key={n.key} style={navBtn(tab === n.key)} onClick={() => setTab(n.key)}>
            <n.Icon size={22} strokeWidth={tab === n.key ? 2.2 : 1.8} />
            {n.label}
          </button>
        ))}
      </nav>

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

      {/* トースト */}
      {toast && (
        <div style={{
          position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)",
          background: toast.type === "err" ? C.danger : C.primary,
          color:"#fff", padding:"10px 20px", borderRadius:16, fontSize:13, fontWeight:600,
          zIndex:999, maxWidth:"calc(100vw - 32px)", wordBreak:"break-all" as const, boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
          display:"flex", alignItems:"center", gap:8,
        }}>
          {toast.type === "err"
            ? <AlertCircle size={15} strokeWidth={2} />
            : <Wind size={15} strokeWidth={2} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
