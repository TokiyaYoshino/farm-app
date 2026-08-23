// ─── データストア（src/App.tsx のデータ層の移植）───────────────────────
// 認証セッション監視 → users/crops/fields/reports/schedules/pesticides/
// projects/work_categories/comments/settings を organization_id / org で取得。
// CRUD は Web 版のハンドラと同一のクエリ・楽観更新。
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { registerPushToken, unregisterPushToken } from "./push";
import { fetchCurrentWeather, type CurrentWeather } from "./weather";
import type {
  User, Crop, Field, Report, Schedule, Comment, Pesticide, PesticideMaster, Project,
  WorkCategory, AppSettings, PesticideRegistration, CropAdviceMessage,
} from "./types";
import type { AdviceAction } from "./adviceMatch";
import type { AdviseResult } from "./ai";

// Web版 /api/pesticide-registration（FAMICのZIPにCORSが無くクライアントから直接取得
// できないための中継）。アプリからも同じVercel APIを叩く。lib/ai.ts と同じ既定。
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://kishu-farm.vercel.app";

// pesticide_registrations から引く列（Web版 App.tsx の select と同一）
const REG_COLUMNS = "pesticide_id,registration_no,product_name,crop_name,pest_name,dilution,usage_timing,usage_count,total_count,application";

interface Store {
  // auth
  authSession: AuthSession | null;
  authLoading: boolean;
  loading: boolean;
  loadError: boolean;
  retryLoad: () => Promise<void>;
  refreshing: boolean;
  refresh: () => Promise<void>;
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
  // 通知（自分宛コメント・メンション）
  myNotifs: Comment[];
  unreadNotifCount: number;
  notifSeenAt: string;
  markNotifsSeen: () => void;
  // 記録フォームのドラフト（コピーして作成・タイマー終了からの反映に使う）
  quickReportDraft: Partial<Report> | null;
  quickReportOpen: boolean;
  openQuickReport: (draft?: Partial<Report>) => void;
  closeQuickReport: () => void;
  // 作業タイマー（開始時刻のみ保持。終了時に経過分を記録フォームへ）
  workStartedAt: string | null;
  startWork: () => void;
  stopWork: () => void;
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
  addCrop: (name: string, startDate: string, targetYield: string, famicCropName?: string) => Promise<string | null>;
  updateFamicCropName: (cropId: number, value: string) => Promise<string | null>;
  deleteCrop: (id: number) => Promise<string | null>;
  // 農薬の適用情報（FAMIC）。キーが無い = 未取得、空配列 = 取得したが適用行なし
  pRegs: Record<string, PesticideRegistration[]>;
  // 保存済みの適用情報を必要ぶんだけ引く（記録フォーム・チャットの判定用）
  loadSavedRegistrations: (pesticideIds: string[]) => Promise<void>;
  // 全農薬ぶんを先読みして返す（チャットで「あと何回使えるか」に答える用）
  prefetchAllRegistrations: () => Promise<Record<string, PesticideRegistration[]>>;
  // パネルを開いたときの取得。候補が複数あるときは candidates を返して選ばせる
  openRegistrations: (p: Pesticide) => Promise<{ candidates: { registration_no: string; product_name: string }[] } | string | null>;
  // 候補から登録番号を確定して取得・保存
  saveRegistrationsFor: (p: Pesticide, registrationNo: string) => Promise<string | null>;
  addField: (name: string) => Promise<string | null>;
  deleteField: (id: number) => Promise<string | null>;
  setFieldLocation: (fieldId: number, lat: number, lng: number) => Promise<string | null>;
  addPesticide: (name: string, type: string, dilutionRate: string, master?: PesticideMaster | null) => Promise<string | null>;
  deletePesticide: (id: string) => Promise<string | null>;
  searchPesticideMaster: (q: string) => Promise<PesticideMaster[]>;
  loadComments: (targetType: string, targetId: string) => Promise<Comment[]>;
  addComment: (targetType: string, targetId: string, message: string) => Promise<boolean>;
  editComment: (id: string, message: string) => Promise<boolean>;
  // 作物ごとの相談スレッド（農業エージェント）。
  // 全件を fetchAll に積まないのは、作物を開いたときだけ必要で件数が伸び続けるため。
  loadCropAdvice: (cropId: number) => Promise<{ messages: CropAdviceMessage[]; actions: AdviceAction[] } | null>;
  // 利用者の質問とAIの返答を1往復ぶんまとめて保存する（やることも同時に切り出す）
  saveCropAdviceTurn: (cropId: number, question: string, result: AdviseResult)
    => Promise<{ messages: CropAdviceMessage[]; actions: AdviceAction[] } | null>;
  // 「やらない」判断。行は消さずに dismissed_at を立てる（判断の履歴になる）
  dismissAdviceAction: (actionId: string, dismissed: boolean) => Promise<boolean>;
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
      // トークン自動更新でも呼ばれる。ここで毎回 setAuthSession すると
      // オブジェクト同一性が変わって初期ロード useEffect が再実行され、
      // loading=true → App.tsx の早期 return でツリーごとアンマウントされる
      // （＝記録フォームの入力途中が消える）。同一ユーザーの更新では state を
      // 差し替えない。ログイン・ログアウト・ユーザー変更のときだけ差し替える。
      setAuthSession(prev => {
        if (prev?.user?.id === session?.user?.id) return prev;
        return session;
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── 一括データ取得（Web版 useEffect [authSession] と同一のクエリ）──
  // 初期ロード・エラー時の再試行・プル・トゥ・リフレッシュで共用する。
  // 失敗したら throw し、呼び出し側で loadError / RefreshControl を制御する。
  const fetchAll = useCallback(async (session: AuthSession) => {
    const { data: meRow, error: meErr } = await supabase.from("users").select("*").eq("auth_id", session.user.id).maybeSingle();
    if (meErr) throw meErr;
    const me = (meRow ?? null) as User | null;
    const org = me?.org ?? "kishu";
    const organizationId = me?.organization_id ?? null;
    setCurrentOrg(org);
    setCurrentOrganizationId(organizationId);
    if (me) setCurrentUser(me);

    const results = await Promise.all([
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
    // ネットワーク断のときは全クエリが error になる。最初のエラーで通信失敗として扱う
    const firstError = results.find(r => r.error)?.error;
    if (firstError && results.every(r => r.error)) throw firstError;

    const [{ data: allUsers }, { data: c }, { data: fd }, { data: r }, { data: s }, { data: sch }, { data: ps }, { data: prj }, { data: wc }, { data: cmts }] = results;
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
  }, []);

  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 初期ロード（ログイン後）
  useEffect(() => {
    if (!authSession) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        await fetchAll(authSession);
      } catch (e) {
        console.error("Startup error:", e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authSession, fetchAll]);

  // エラー画面の「再試行」
  const retryLoad = useCallback(async () => {
    if (!authSession) return;
    setLoading(true);
    setLoadError(false);
    try {
      await fetchAll(authSession);
    } catch (e) {
      console.error("Retry error:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [authSession, fetchAll]);

  // プル・トゥ・リフレッシュ（失敗しても既存表示を保つ）
  const refresh = useCallback(async () => {
    if (!authSession || refreshing) return;
    setRefreshing(true);
    try {
      await fetchAll(authSession);
    } catch (e) {
      console.error("Refresh error:", e);
    } finally {
      setRefreshing(false);
    }
  }, [authSession, refreshing, fetchAll]);

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

  // ── プッシュ通知のトークン登録（ログイン後・組織確定後に1回）──
  // 失敗（権限拒否・Expo Go・シミュレータ）は null が返るだけでアプリは通常動作する。
  // currentUser は refetch ごとに別オブジェクトになるため、試行済みのユーザーIDを
  // ref で持って重複要求を防ぐ（権限ダイアログの再表示・無駄なupsertを避ける）。
  const [pushToken, setPushToken] = useState<string | null>(null);
  const pushRegisteredFor = useRef<number | null>(null);
  const userId = currentUser?.id ?? null;
  useEffect(() => {
    if (!userId || !currentOrganizationId) return;
    if (pushRegisteredFor.current === userId) return;
    pushRegisteredFor.current = userId;
    registerPushToken(userId, currentOrganizationId).then(t => {
      if (t) setPushToken(t);
    });
  }, [userId, currentOrganizationId]);

  const logout = useCallback(async () => {
    // 端末を手放した後に通知が届かないよう、サインアウト前にトークン行を消す
    if (pushToken) {
      await unregisterPushToken(pushToken);
      setPushToken(null);
    }
    pushRegisteredFor.current = null; // 別ユーザーで再ログインしたら登録し直す
    await supabase.auth.signOut();
    setCurrentUser(null);
  }, [pushToken]);

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
  const addCrop = useCallback(async (name: string, startDate: string, targetYield: string, famicCropName?: string): Promise<string | null> => {
    const { data, error } = await supabase.from("crops").insert([{
      name: name.trim(),
      start_date: startDate,
      target_yield: targetYield ? Number(targetYield) : null,
      famic_crop_name: famicCropName?.trim() || null,
      org: currentOrg, organization_id: currentOrganizationId,
    }]).select();
    if (error) return error.message;
    if (data) setCrops(p => [...p, data[0] as Crop]);
    return null;
  }, [currentOrg, currentOrganizationId]);

  // FAMIC 登録適用部の作物名との紐付け（Web版 updateFamicCropName と同一）。
  // 「南高梅」→「うめ」のように登録上の作物名と一致しないため自動マッチングはせず手入力。
  // 未設定のあいだは農薬の総使用回数を「判定不可」として扱う
  const updateFamicCropName = useCallback(async (cropId: number, value: string): Promise<string | null> => {
    const name = value.trim() || null;
    const { error } = await supabase.from("crops").update({ famic_crop_name: name }).eq("id", cropId);
    if (error) return error.message;
    setCrops(prev => prev.map(c => c.id === cropId ? { ...c, famic_crop_name: name } : c));
    return null;
  }, []);

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

  const addPesticide = useCallback(async (name: string, type: string, dilutionRate: string, master?: PesticideMaster | null): Promise<string | null> => {
    const { data, error } = await supabase.from("pesticides").insert([{
      name: name.trim(), type: type.trim() || "その他", dilution_rate: dilutionRate.trim() || null,
      org: currentOrg, organization_id: currentOrganizationId,
      // マスタ経由で選んだ場合は登録番号を引き継ぐ（Web版と同一。適用情報の取得に使う）
      master_id: master?.id || null,
      registration_no: master?.reg_no || null,
    }]).select();
    if (error) return error.message;
    if (data) setPesticides(p => [...p, data[0] as Pesticide].sort((a, b) => a.name.localeCompare(b.name)));
    return null;
  }, [currentOrg, currentOrganizationId]);

  // 農薬マスタ検索（Web版 searchPesticideMaster と同一: pesticides_master を ilike）
  const searchPesticideMaster = useCallback(async (q: string): Promise<PesticideMaster[]> => {
    if (!q.trim()) return [];
    const { data } = await supabase.from("pesticides_master")
      .select("*").eq("is_active", true).ilike("name", `%${q}%`).limit(10);
    return (data ?? []) as PesticideMaster[];
  }, []);

  const deletePesticide = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from("pesticides").delete().eq("id", id);
    if (error) return error.message;
    setPesticides(p => p.filter(x => x.id !== id));
    return null;
  }, []);

  // ── 農薬の適用情報（FAMIC・Web版 pRegs / openRegistrations / saveRegistrations の移植） ──
  // キーが無い = 未取得、空配列 = 取得したが適用行なし（この区別で「判定不可」の理由を分ける）
  const [pRegs, setPRegs] = useState<Record<string, PesticideRegistration[]>>({});
  // 保存済み0件の農薬は pRegs にキーが立たないため、取得済み判定は ref で持つ
  // （state だけで見ると同じ農薬を無限に取得し続ける。Web版 regFetchedRef と同一の理由）
  const regFetchedRef = useRef<Set<string>>(new Set());

  // 保存済みの適用情報をまとめて引く（記録フォームで農薬を選んだとき・チャットの先読み）
  const loadSavedRegistrations = useCallback(async (pesticideIds: string[]): Promise<void> => {
    const missing = pesticideIds.filter(id => !regFetchedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => regFetchedRef.current.add(id));
    const { data, error } = await supabase
      .from("pesticide_registrations").select(REG_COLUMNS).in("pesticide_id", missing);
    if (error) {
      console.error("pesticide_registrations fetch error:", error);
      // 取り直せるように取得済み印を戻す（判定不可のまま固定させない）
      missing.forEach(id => regFetchedRef.current.delete(id));
      return;
    }
    setPRegs(prev => {
      const next = { ...prev };
      // 今回取得した農薬ぶんは丸ごと差し替える（既存に足すと適用行が二重になり
      // 使用回数の判定根拠が壊れる）。0件も空配列で確定させる
      missing.forEach(id => { next[id] = []; });
      (data ?? []).forEach(row => {
        const key = (row as PesticideRegistration).pesticide_id;
        if (!key || !next[key] || !missing.includes(key)) return;
        next[key].push(row as PesticideRegistration);
      });
      return next;
    });
  }, []);

  // 全農薬ぶんを先読みして最新の pRegs を返す（チャット送信時。Web版 prefetchAllRegistrations と同一）
  const prefetchAllRegistrations = useCallback(async (): Promise<Record<string, PesticideRegistration[]>> => {
    const missing = pesticides.filter(p => !regFetchedRef.current.has(p.id)).map(p => p.id);
    if (missing.length === 0) return pRegs;
    missing.forEach(id => regFetchedRef.current.add(id));
    const { data, error } = await supabase
      .from("pesticide_registrations").select(REG_COLUMNS).in("pesticide_id", missing);
    if (error) {
      missing.forEach(id => regFetchedRef.current.delete(id));
      return pRegs;
    }
    const grouped: Record<string, PesticideRegistration[]> = { ...pRegs };
    missing.forEach(id => { grouped[id] = []; });
    (data ?? []).forEach(row => {
      const key = (row as PesticideRegistration).pesticide_id;
      if (!key || !missing.includes(key)) return;
      grouped[key].push(row as PesticideRegistration);
    });
    setPRegs(grouped);
    return grouped;
  }, [pesticides, pRegs]);

  // 登録番号ごとの適用情報を Vercel API 経由で取得して保存（Web版 saveRegistrations と同一）。
  // 取得した値は正規化せず原文のまま保持する。最終的に正しいのは製品ラベルの表示
  const saveRegistrationsFor = useCallback(async (p: Pesticide, registrationNo: string): Promise<string | null> => {
    try {
      // api/_auth.ts が Authorization を必須にしているため付ける（無認証だと踏み台になる）
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/pesticide-registration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ registrationNo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return (d as { error?: string }).error || "適用情報を取得できませんでした。";
      const rows = (d.rows ?? []) as PesticideRegistration[];
      if (rows.length === 0) return `登録番号 ${registrationNo} の適用情報が見つかりませんでした。`;

      // 取り直しのたびに増えないよう、この農薬の既存ぶんを置き換える
      await supabase.from("pesticide_registrations").delete().eq("pesticide_id", p.id);
      const { error } = await supabase.from("pesticide_registrations").insert(
        rows.map(r => ({
          organization_id: currentOrganizationId,
          pesticide_id: p.id,
          registration_no: r.registration_no,
          product_name: r.product_name,
          crop_name: r.crop_name,
          pest_name: r.pest_name,
          dilution: r.dilution,
          usage_timing: r.usage_timing,
          usage_count: r.usage_count,
          total_count: r.total_count,
          application: r.application,
          raw: r.raw ?? null,
        })),
      );
      if (error) return error.message;

      // 農薬側にも登録番号を残し、次回以降は候補選択を挟まずに済むようにする
      if (p.registration_no !== registrationNo) {
        await supabase.from("pesticides").update({ registration_no: registrationNo }).eq("id", p.id);
        setPesticides(list => list.map(x => (x.id === p.id ? { ...x, registration_no: registrationNo } : x)));
      }
      regFetchedRef.current.add(p.id);
      setPRegs(m => ({ ...m, [p.id]: rows }));
      return null;
    } catch {
      return "通信に失敗しました。ネットワークをご確認ください。";
    }
  }, [currentOrganizationId]);

  // 適用情報パネルを開いたときの取得フロー（Web版 openRegistrations と同一）。
  // 保存済み → 登録番号あり → 名前検索で候補を返す、の順
  const openRegistrations = useCallback(async (p: Pesticide): Promise<{ candidates: { registration_no: string; product_name: string }[] } | string | null> => {
    if (pRegs[p.id] && pRegs[p.id].length > 0) return null; // 取得済み
    const { data: saved } = await supabase
      .from("pesticide_registrations").select("*").eq("pesticide_id", p.id);
    if (saved && saved.length > 0) {
      regFetchedRef.current.add(p.id);
      setPRegs(m => ({ ...m, [p.id]: saved as PesticideRegistration[] }));
      return null;
    }
    if (p.registration_no) return saveRegistrationsFor(p, p.registration_no);
    // 登録番号が分からない農薬は、名前から候補を出して選んでもらう
    try {
      // api/_auth.ts が Authorization を必須にしているため付ける（無認証だと踏み台になる）
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/pesticide-registration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ name: p.name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return (d as { error?: string }).error || "農薬登録情報を検索できませんでした。";
      const list = (d.candidates ?? []) as { registration_no: string; product_name: string }[];
      if (list.length === 0) return `「${p.name}」に一致する登録が見つかりませんでした。`;
      if (list.length === 1) return saveRegistrationsFor(p, list[0].registration_no);
      return { candidates: list };
    } catch {
      return "通信に失敗しました。ネットワークをご確認ください。";
    }
  }, [pRegs, saveRegistrationsFor]);

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

  // ── 作物ごとの相談スレッド（農業エージェント） ──
  // 発言（crop_advice_messages）と、そこから切り出したやること（crop_advice_actions）。
  // **照合結果は保存しない**。作業記録は後から追加・修正されるので、実施済みを
  // 書き込むと実態とずれる。実施したかは lib/adviceMatch.ts で毎回計算する。
  const loadCropAdvice = useCallback(async (cropId: number) => {
    if (!currentOrganizationId) return null;
    const [msgRes, actRes] = await Promise.all([
      supabase.from("crop_advice_messages").select("*")
        .eq("organization_id", currentOrganizationId).eq("crop_id", cropId).order("created_at"),
      supabase.from("crop_advice_actions").select("*")
        .eq("organization_id", currentOrganizationId).eq("crop_id", cropId).order("created_at"),
    ]);
    if (msgRes.error || actRes.error) return null;
    return {
      messages: (msgRes.data ?? []) as CropAdviceMessage[],
      actions: (actRes.data ?? []) as AdviceAction[],
    };
  }, [currentOrganizationId]);

  const saveCropAdviceTurn = useCallback(async (cropId: number, question: string, result: AdviseResult) => {
    if (!currentOrganizationId) return null;
    const base = { organization_id: currentOrganizationId, crop_id: cropId, created_by: currentUser?.id ?? null };
    // 質問と返答を1往復として入れる。返答だけ・質問だけが残るとスレッドが読めなくなるので、
    // 返答の insert が失敗したら質問も消す
    const { data: userRow, error: userErr } = await supabase.from("crop_advice_messages")
      .insert([{ ...base, role: "user", content: question }]).select().single();
    if (userErr || !userRow) return null;

    const { data: aiRow, error: aiErr } = await supabase.from("crop_advice_messages").insert([{
      ...base, role: "assistant", content: result.advice.reply,
      // 出典・限界・FAMIC原文は生成時のものを残す。あとで文言を変えても過去の発言は当時のまま
      sources: result.sources, limits: result.limits,
      registration_facts: result.registrationFacts,
      model: "gpt-4o-mini", usage: result.usage ?? null, cost_usd: result.costUsd ?? null,
    }]).select().single();
    if (aiErr || !aiRow) {
      await supabase.from("crop_advice_messages").delete().eq("id", (userRow as CropAdviceMessage).id);
      return null;
    }

    let actions: AdviceAction[] = [];
    if (result.advice.actions.length > 0) {
      const { data: actRows } = await supabase.from("crop_advice_actions").insert(
        result.advice.actions.map(a => ({
          ...base, message_id: (aiRow as CropAdviceMessage).id,
          title: a.title, work_type: a.workType,
          due_from: a.dueFrom, due_to: a.dueTo,
          when_text: a.when || null, why: a.why || null, sort_order: a.sortOrder,
        })),
      ).select();
      // やることの保存に失敗しても会話は残す（照合できないだけで、助言自体は読める）
      actions = (actRows ?? []) as AdviceAction[];
    }
    return { messages: [userRow as CropAdviceMessage, aiRow as CropAdviceMessage], actions };
  }, [currentOrganizationId, currentUser]);

  const dismissAdviceAction = useCallback(async (actionId: string, dismissed: boolean): Promise<boolean> => {
    if (!currentOrganizationId) return false;
    const { error } = await supabase.from("crop_advice_actions")
      .update({ dismissed_at: dismissed ? new Date().toISOString() : null })
      .eq("id", actionId).eq("organization_id", currentOrganizationId);
    return !error;
  }, [currentOrganizationId]);

  // ── 通知（Web版 myNotifs / notifSeenAt と同一。既読時刻は AsyncStorage に保持） ──
  const [notifSeenAt, setNotifSeenAt] = useState("");
  useEffect(() => {
    if (!currentUser) return;
    AsyncStorage.getItem(`notifSeen_${currentUser.id}`).then(v => setNotifSeenAt(v ?? ""));
  }, [currentUser]);

  // 自分宛 = @自分名のメンション / 自分の記録・予定へのコメント（自分の投稿は除外）
  const myNotifs = comments.filter(cm => {
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
  const markNotifsSeen = useCallback(() => {
    const now = new Date().toISOString();
    setNotifSeenAt(now);
    if (currentUser) AsyncStorage.setItem(`notifSeen_${currentUser.id}`, now);
  }, [currentUser]);

  // ── 記録フォームのドラフト（コピーして作成／タイマー終了→フォーム反映） ──
  const [quickReportDraft, setQuickReportDraft] = useState<Partial<Report> | null>(null);
  const [quickReportOpen, setQuickReportOpen] = useState(false);
  const openQuickReport = useCallback((draft?: Partial<Report>) => {
    setQuickReportDraft(draft ?? null);
    setQuickReportOpen(true);
  }, []);
  const closeQuickReport = useCallback(() => {
    setQuickReportOpen(false);
    setQuickReportDraft(null);
  }, []);

  // ── 作業タイマー ──
  // Web版は sessions テーブルの update を行うが、開始経路（insert）が現行UIから
  // 露出していないため、アプリでは端末内タイマー→終了時にフォームへ反映のみとする。
  const [workStartedAt, setWorkStartedAt] = useState<string | null>(null);
  const startWork = useCallback(() => setWorkStartedAt(new Date().toISOString()), []);
  const stopWork = useCallback(() => {
    if (!workStartedAt) return;
    const start = new Date(workStartedAt);
    const end = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setWorkStartedAt(null);
    // 開始・終了時刻を入れた状態で記録フォームを開く（時間帯天気も自動取得される）
    openQuickReport({
      work_start: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      work_end: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    });
  }, [workStartedAt, openQuickReport]);

  // ── ヘルパー ──
  const cropName = useCallback((id: number) => crops.find(c => c.id === id)?.name ?? "未設定", [crops]);
  const userName = useCallback((id: number) => users.find(u => u.id === id)?.name ?? "未設定", [users]);
  const commentCountOf = useCallback((type: "report" | "schedule", id: number | string) =>
    comments.filter(cm => cm.target_type === type && cm.target_id === String(id)).length, [comments]);

  const store: Store = {
    authSession, authLoading, loading, loadError, retryLoad, refreshing, refresh, login, logout,
    currentUser, isAdmin: (currentUser?.role ?? "worker") === "admin",
    users, crops, fields, reports, schedules, pesticides, projects, workCategories, comments,
    weatherCoords, wxAuto, wxLoading,
    myNotifs, unreadNotifCount, notifSeenAt, markNotifsSeen,
    quickReportDraft, quickReportOpen, openQuickReport, closeQuickReport,
    workStartedAt, startWork, stopWork,
    cropName, userName, commentCountOf,
    addReport, deleteReport,
    addSchedule, updateSchedule, deleteSchedule,
    addCrop, updateFamicCropName, deleteCrop, addField, deleteField, setFieldLocation,
    addPesticide, deletePesticide, searchPesticideMaster,
    pRegs, loadSavedRegistrations, prefetchAllRegistrations, openRegistrations, saveRegistrationsFor,
    loadComments, addComment, editComment,
    loadCropAdvice, saveCropAdviceTurn, dismissAdviceAction,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
