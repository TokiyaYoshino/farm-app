// ─── データストア（src/App.tsx のデータ層の移植）───────────────────────
// 認証セッション監視 → users/crops/fields/reports/schedules/pesticides/
// projects/work_categories/comments/settings を organization_id / org で取得。
// CRUD は Web 版のハンドラと同一のクエリ・楽観更新。
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { fetchCurrentWeather, type CurrentWeather } from "./weather";
import type {
  User, Crop, Field, Report, Schedule, Comment, Pesticide, Project,
  WorkCategory, AppSettings,
} from "./types";

interface Store {
  // auth
  authSession: AuthSession | null;
  authLoading: boolean;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<string | null>; // エラーメッセージ or null
  logout: () => Promise<void>;
  // data
  currentUser: User | null;
  isAdmin: boolean;
  users: User[];
  crops: Crop[];
  fields: Field[];
  reports: Report[];
  schedules: Schedule[];
  pesticides: Pesticide[];
  projects: Project[];
  workCategories: WorkCategory[];
  comments: Comment[];
  weatherCoords: { lat: number; lng: number; name: string } | null;
  wxAuto: CurrentWeather | null;
  wxLoading: boolean;
  // helpers
  cropName: (id: number) => string;
  userName: (id: number) => string;
  commentCountOf: (type: "report" | "schedule", id: number | string) => number;
  // CRUD
  addReport: (payload: Partial<Report>, imageUri?: string | null) => Promise<string | null>;
  deleteReport: (id: number) => Promise<string | null>;
  addSchedule: (date: string, note: string, crop: string, assignedUserId: number | null, workType: string, field?: string) => Promise<boolean>;
  updateSchedule: (id: string, date: string, note: string, crop: string, assignedUserId: number | null, workType: string, field?: string) => Promise<boolean>;
  deleteSchedule: (id: string) => Promise<string | null>;
  addCrop: (name: string, startDate: string, targetYield: string) => Promise<string | null>;
  deleteCrop: (id: number) => Promise<string | null>;
  addField: (name: string) => Promise<string | null>;
  deleteField: (id: number) => Promise<string | null>;
  setFieldLocation: (fieldId: number, lat: number, lng: number) => Promise<string | null>;
  addPesticide: (name: string, type: string, dilutionRate: string) => Promise<string | null>;
  deletePesticide: (id: string) => Promise<string | null>;
  loadComments: (targetType: string, targetId: string) => Promise<Comment[]>;
  addComment: (targetType: string, targetId: string, message: string) => Promise<boolean>;
  editComment: (id: string, message: string) => Promise<boolean>;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState("kishu");
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pesticides, setPesticides] = useState<Pesticide[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workCategories, setWorkCategories] = useState<WorkCategory[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [wxAuto, setWxAuto] = useState<CurrentWeather | null>(null);
  const [wxLoading, setWxLoading] = useState(true);

  // ── Auth セッション監視 ──
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

  // ── ログイン後の一括データ取得（Web版 useEffect [authSession] と同一） ──
  useEffect(() => {
    if (!authSession) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data: meRow } = await supabase.from("users").select("*").eq("auth_id", authSession.user.id).maybeSingle();
        const me = (meRow ?? null) as User | null;
        const org = me?.org ?? "kishu";
        const organizationId = me?.organization_id ?? null;
        if (cancelled) return;
        setCurrentOrg(org);
        setCurrentOrganizationId(organizationId);
        if (me) setCurrentUser(me);

        const [{ data: allUsers }, { data: c }, { data: fd }, { data: r }, { data: s }, { data: sch }, { data: ps }, { data: prj }, { data: wc }, { data: cmts }] = await Promise.all([
          supabase.from("users").select("*").eq("organization_id", organizationId).order("id"),
          supabase.from("crops").select("*").eq("org", org).order("id"),
          supabase.from("fields").select("*").eq("org", org).order("id"),
          supabase.from("reports").select("*").eq("org", org).order("date", { ascending: false }),
          supabase.from("settings").select("*").eq("org", org).maybeSingle(),
          supabase.from("schedules").select("*").eq("organization_id", organizationId).order("date"),
          supabase.from("pesticides").select("*").eq("org", org).order("name"),
          supabase.from("projects").select("*").eq("org", org).order("created_at", { ascending: false }),
          supabase.from("work_categories").select("*").order("id"),
          supabase.from("comments").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
        ]);
        if (cancelled) return;
        const loc = s
          ? { lat: (s as AppSettings).lat, lng: (s as AppSettings).lng, name: (s as AppSettings).location_name }
          : { lat: 35.0167, lng: 135.5833, name: "京都府亀岡市" };
        setWeatherCoords(loc);
        setUsers((allUsers ?? []) as User[]);
        if (c) setCrops(c as Crop[]);
        if (fd) setFields(fd as Field[]);
        if (r) setReports(r as Report[]);
        if (sch) setSchedules(sch as Schedule[]);
        if (ps) setPesticides(ps as Pesticide[]);
        if (prj) setProjects(prj as Project[]);
        if (wc) setWorkCategories(wc as WorkCategory[]);
        if (cmts) setComments(cmts as Comment[]);
      } catch (e) {
        console.error("Startup error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authSession]);

  // ── 天気（Web版 useEffect [weatherCoords] と同一・リトライ2回） ──
  useEffect(() => {
    if (!weatherCoords) return;
    let cancelled = false;
    const tryFetch = async (attempt: number) => {
      try {
        const w = await fetchCurrentWeather(weatherCoords.lat, weatherCoords.lng);
        if (!cancelled) setWxAuto(w);
      } catch {
        if (attempt < 2) { setTimeout(() => { if (!cancelled) tryFetch(attempt + 1); }, 1500); return; }
        if (!cancelled) setWxAuto(null);
      }
      if (!cancelled) setWxLoading(false);
    };
    tryFetch(0);
    return () => { cancelled = true; };
  }, [weatherCoords]);

  // ── ログイン（Web版 handleLogin と同一: login_id → email 解決 → password auth） ──
  const login = useCallback(async (loginId: string, password: string): Promise<string | null> => {
    try {
      const { data: ud, error: ue } = await supabase
        .from("users").select("email").eq("login_id", loginId.trim()).maybeSingle();
      if (ue || !ud?.email) return "ユーザーIDが見つかりません";
      const { error: ae } = await supabase.auth.signInWithPassword({ email: ud.email, password });
      if (ae) return "パスワードが正しくありません";
      return null;
    } catch {
      return "ログインに失敗しました";
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  }, []);

  // ── 画像アップロード（Web版 uploadImage の RN 版: URI → ArrayBuffer） ──
  const uploadImage = async (uri: string): Promise<string> => {
    const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const resp = await fetch(uri);
    const buf = await resp.arrayBuffer();
    const { error } = await supabase.storage.from("report-images").upload(path, buf, {
      contentType: ext === "png" ? "image/png" : "image/jpeg",
    });
    if (error) throw error;
    return supabase.storage.from("report-images").getPublicUrl(path).data.publicUrl;
  };

  // ── 作業報告（Web版 addReport 相当。天気の確定は呼び出し側で済ませて渡す） ──
  const addReport = useCallback(async (payload: Partial<Report>, imageUri?: string | null): Promise<string | null> => {
    if (!currentUser) return "ログインが必要です";
    try {
      let imageUrl = "";
      if (imageUri) imageUrl = await uploadImage(imageUri);
      const { data, error } = await supabase.from("reports").insert([{
        ...payload,
        image_url: imageUrl,
        weather_icon: "",
        org: currentOrg,
        organization_id: currentOrganizationId,
      }]).select();
      if (error) return error.message || "登録に失敗しました";
      const newReport = data?.[0] as Report | undefined;
      if (newReport) setReports(p => [newReport, ...p]);
      return null;
    } catch (e) {
      return (e as Error).message || "登録に失敗しました";
    }
  }, [currentUser, currentOrg, currentOrganizationId]);

  const deleteReport = useCallback(async (id: number): Promise<string | null> => {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) return error.message;
    setReports(p => p.filter(r => r.id !== id));
    return null;
  }, []);

  // ── 予定（Web版 addSchedule / updateSchedule / deleteSchedule と同一） ──
  const addSchedule = useCallback(async (date: string, note: string, crop: string, assignedUserId: number | null, workType: string, field?: string): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const { data, error } = await supabase.from("schedules").insert([{
        user_id: currentUser.id,
        organization_id: currentOrganizationId,
        title: workType,
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
  }, [currentUser, currentOrganizationId]);

  const updateSchedule = useCallback(async (id: string, date: string, note: string, crop: string, assignedUserId: number | null, workType: string, field?: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from("schedules").update({
        title: workType,
        date,
        note: note || null,
        crop: crop || null,
        field: field || null,
        assigned_user_id: assignedUserId || null,
        work_type: workType || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      setSchedules(p => p.map(s => s.id === id ? (data as Schedule) : s));
      return true;
    } catch (e) {
      console.error("updateSchedule error:", e);
      return false;
    }
  }, []);

  const deleteSchedule = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (error) return error.message;
    setSchedules(p => p.filter(s => s.id !== id));
    return null;
  }, []);

  // ── 作物・圃場・農薬（Web版と同一） ──
  const addCrop = useCallback(async (name: string, startDate: string, targetYield: string): Promise<string | null> => {
    const { data, error } = await supabase.from("crops").insert([{
      name: name.trim(),
      start_date: startDate,
      target_yield: targetYield ? Number(targetYield) : null,
      org: currentOrg, organization_id: currentOrganizationId,
    }]).select();
    if (error) return error.message;
    if (data) setCrops(p => [...p, data[0] as Crop]);
    return null;
  }, [currentOrg, currentOrganizationId]);

  const deleteCrop = useCallback(async (id: number): Promise<string | null> => {
    const { error } = await supabase.from("crops").delete().eq("id", id);
    if (error) return error.message;
    setCrops(p => p.filter(c => c.id !== id));
    return null;
  }, []);

  const addField = useCallback(async (name: string): Promise<string | null> => {
    const { data, error } = await supabase.from("fields").insert([{ name: name.trim(), org: currentOrg, organization_id: currentOrganizationId }]).select();
    if (error) return error.message;
    if (data) setFields(p => [...p, data[0] as Field]);
    return null;
  }, [currentOrg, currentOrganizationId]);

  const deleteField = useCallback(async (id: number): Promise<string | null> => {
    const { error } = await supabase.from("fields").delete().eq("id", id);
    if (error) return error.message;
    setFields(p => p.filter(f => f.id !== id));
    return null;
  }, []);

  const setFieldLocation = useCallback(async (fieldId: number, lat: number, lng: number): Promise<string | null> => {
    const { error } = await supabase.from("fields").update({ lat, lng }).eq("id", fieldId);
    if (error) return error.message;
    setFields(p => p.map(f => f.id === fieldId ? { ...f, lat, lng } : f));
    return null;
  }, []);

  const addPesticide = useCallback(async (name: string, type: string, dilutionRate: string): Promise<string | null> => {
    const { data, error } = await supabase.from("pesticides").insert([{
      name: name.trim(), type: type.trim() || "その他", dilution_rate: dilutionRate.trim() || null,
      org: currentOrg, organization_id: currentOrganizationId,
    }]).select();
    if (error) return error.message;
    if (data) setPesticides(p => [...p, data[0] as Pesticide].sort((a, b) => a.name.localeCompare(b.name)));
    return null;
  }, [currentOrg, currentOrganizationId]);

  const deletePesticide = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from("pesticides").delete().eq("id", id);
    if (error) return error.message;
    setPesticides(p => p.filter(x => x.id !== id));
    return null;
  }, []);

  // ── コメント（Web版と同一） ──
  const loadComments = useCallback(async (targetType: string, targetId: string): Promise<Comment[]> => {
    const { data } = await supabase.from("comments")
      .select("*").eq("target_type", targetType).eq("target_id", targetId)
      .eq("organization_id", currentOrganizationId).order("created_at");
    return (data ?? []) as Comment[];
  }, [currentOrganizationId]);

  const addComment = useCallback(async (targetType: string, targetId: string, message: string): Promise<boolean> => {
    if (!currentUser) return false;
    const { data, error } = await supabase.from("comments").insert([{
      target_type: targetType, target_id: targetId,
      user_id: currentUser.id, message, organization_id: currentOrganizationId,
    }]).select().single();
    if (!error && data) setComments(prev => [data as Comment, ...prev]);
    return !error;
  }, [currentUser, currentOrganizationId]);

  const editComment = useCallback(async (id: string, message: string): Promise<boolean> => {
    const { error } = await supabase.from("comments").update({ message }).eq("id", id).eq("organization_id", currentOrganizationId);
    if (!error) setComments(prev => prev.map(cm => cm.id === id ? { ...cm, message } : cm));
    return !error;
  }, [currentOrganizationId]);

  // ── ヘルパー ──
  const cropName = useCallback((id: number) => crops.find(c => c.id === id)?.name ?? "未設定", [crops]);
  const userName = useCallback((id: number) => users.find(u => u.id === id)?.name ?? "未設定", [users]);
  const commentCountOf = useCallback((type: "report" | "schedule", id: number | string) =>
    comments.filter(cm => cm.target_type === type && cm.target_id === String(id)).length, [comments]);

  const store: Store = {
    authSession, authLoading, loading, login, logout,
    currentUser, isAdmin: (currentUser?.role ?? "worker") === "admin",
    users, crops, fields, reports, schedules, pesticides, projects, workCategories, comments,
    weatherCoords, wxAuto, wxLoading,
    cropName, userName, commentCountOf,
    addReport, deleteReport,
    addSchedule, updateSchedule, deleteSchedule,
    addCrop, deleteCrop, addField, deleteField, setFieldLocation,
    addPesticide, deletePesticide,
    loadComments, addComment, editComment,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
