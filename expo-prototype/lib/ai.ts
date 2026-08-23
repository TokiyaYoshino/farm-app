// ─── AI機能連携（src/App.tsx のAI呼び出し部の移植）──────────────────────
// Web版は同一オリジンの /api/* を叩くが、アプリは Vercel 本番のAPIを直接叩く。
// api/*.ts は入力テキストを受け取るだけの疎結合設計のため、URLを変える以外は同一。
import { supabase } from "./supabase";
import { wmoToLabel } from "./weather";
import type { Report, Pesticide } from "./types";

// Web版本番（Vercel）。api/ ディレクトリのサーバーレス関数がここに載っている
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://kishu-farm.vercel.app";

// ai_outputs.model に残すモデル名（api/*.ts のモデル指定が正）
const AI_MODEL = "gpt-4o-mini";

// ── プラン別アクセス判定（src/ui/aiFeatures.ts と同一。課金連携後に差し替え） ──
export const AI_FEATURES = {
  voiceStructuring: true,
  recordSearchChat: true,
  pestControlAdvice: true,
  pestDiagnosis: true,
  // 次にやる作業の相談（api/advise.ts）。記録の検索ではなく知識の補填なので別枠
  nextActionAdvice: true,
} as const;

export function canUseAiFeature(feature: keyof typeof AI_FEATURES): boolean {
  return AI_FEATURES[feature];
}

export interface DiagnosisResult {
  inconclusive: boolean;
  possibilities: { name: string; category: "病害" | "虫害" | "生理障害" | "ウイルス病"; confidence: number; reason: string }[];
  note: string;
}

// ── AI出力の保存（Web版 saveAiOutput と同一） ──
export async function saveAiOutput(
  organizationId: string | null,
  userId: number | null,
  // "advice" は api/advise.ts（次にやる作業の助言）。ai_outputs.kind は text で
  // CHECK 制約が無いのでマイグレーション不要
  kind: "diagnosis" | "pest_advice" | "daily_report" | "voice_structure" | "advice",
  payload: {
    reportId?: number | null;
    targetDate?: string | null;
    field?: string | null;
    cropId?: number | null;
    inputSummary?: string | null;
    outputJson?: unknown;
    outputText?: string | null;
    usage?: unknown;
    costUsd?: number | null;
  },
): Promise<void> {
  if (!organizationId) return;
  const { error } = await supabase.from("ai_outputs").insert([{
    organization_id: organizationId,
    kind,
    report_id: payload.reportId ?? null,
    target_date: payload.targetDate ?? new Date().toISOString().slice(0, 10),
    field: payload.field ?? null,
    crop_id: payload.cropId ?? null,
    input_summary: payload.inputSummary?.slice(0, 2000) ?? null,
    output_json: payload.outputJson ?? null,
    output_text: payload.outputText ?? null,
    model: AI_MODEL,
    usage: payload.usage ?? null,
    cost_usd: payload.costUsd ?? null,
    created_by: userId,
  }]);
  if (error) console.error("saveAiOutput failed:", kind, error);
}

// ── 記録の整形（Web版 formatDayRecords / formatRecordsForChat と同一） ──
interface FormatHelpers {
  cropName: (id: number) => string;
  userName: (id: number) => string;
  pesticides: Pesticide[];
}

function pesticideLine(r: Report, pesticides: Pesticide[]): string {
  const pests = (r.pesticides_used && r.pesticides_used.length > 0)
    ? r.pesticides_used
    : (r.pesticide_id ? [{ id: r.pesticide_id, amount: r.pesticide_amount ?? null }] : []);
  if (pests.length === 0) return "";
  return pests.map(u => {
    const ps = pesticides.find(p => p.id === u.id);
    return ps ? `${ps.name}${u.amount ? `(${u.amount})` : ""}` : "";
  }).filter(Boolean).join("、");
}

export function formatDayRecords(reports: Report[], date: string, h: FormatHelpers): string {
  const dayReports = reports.filter(r => r.date === date);
  if (dayReports.length === 0) return "";
  return dayReports.map(r => {
    const parts = [`【${h.cropName(r.crop_id)}${r.field ? "・" + r.field : ""}】`];
    if (r.work_type) parts.push(`作業:${r.work_type}`);
    if (r.quantity) parts.push(`数量:${r.quantity}`);
    if (r.work_time) parts.push(`作業時間:${r.work_time}`);
    const names = pesticideLine(r, h.pesticides);
    if (names) parts.push(`農薬:${names}`);
    if (r.soil_ph != null) parts.push(`土壌pH:${r.soil_ph}`);
    if (r.note) parts.push(`メモ:${r.note}`);
    parts.push(`担当:${h.userName(r.user_id)}`);
    return parts.join(" / ");
  }).join("\n");
}

export function formatRecordsForChat(reports: Report[], h: FormatHelpers, limitsBlock = ""): { text: string; count: number } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const target = reports.filter(r => r.date >= cutoffStr)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 200);
  const lines = target.map(r => {
    const parts = [`${r.date} 【${h.cropName(r.crop_id)}${r.field ? "・" + r.field : ""}】`];
    if (r.work_type) parts.push(`作業:${r.work_type}`);
    if (r.quantity) parts.push(`数量:${r.quantity}`);
    const names = pesticideLine(r, h.pesticides);
    if (names) parts.push(`農薬:${names}`);
    if (r.soil_ph != null) parts.push(`土壌pH:${r.soil_ph}`);
    if (r.note) parts.push(`メモ:${r.note}`);
    parts.push(`担当:${h.userName(r.user_id)}`);
    return parts.join(" / ");
  });
  // API側が records 20000文字までしか受け付けないため、農薬の登録上限ブロックを先に確保し、
  // 残りの予算に収まるぶんだけ記録を新しい順に詰める（Web版 formatRecordsForChat と同一）
  const budget = 19000 - limitsBlock.length;
  const out: string[] = [];
  let total = 0;
  for (const line of lines) {
    if (total + line.length + 1 > budget) break;
    out.push(line);
    total += line.length + 1;
  }
  return { text: out.join("\n") + limitsBlock, count: out.length };
}

// ── 防除助言用の天気予報テキスト（Web版 fetchPestControlForecast と同一） ──
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export async function fetchPestControlForecast(lat: number, lng: number): Promise<string> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
    `&wind_speed_unit=ms&timezone=Asia%2FTokyo&past_days=7&forecast_days=7`;
  const res = await fetch(url);
  const data = await res.json();
  const days: string[] = data.daily?.time ?? [];
  const codes: number[] = data.daily?.weather_code ?? [];
  const tMax: number[] = data.daily?.temperature_2m_max ?? [];
  const tMin: number[] = data.daily?.temperature_2m_min ?? [];
  const rainSum: number[] = data.daily?.precipitation_sum ?? [];
  const rainProb: number[] = data.daily?.precipitation_probability_max ?? [];
  const windMax: number[] = data.daily?.wind_speed_10m_max ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const line = (d: string, i: number): string => {
    const dt = new Date(d + "T00:00:00+09:00");
    const label = `${d.slice(5).replace("-", "/")}(${WEEKDAY_JA[dt.getDay()]})`;
    const parts = [
      `天気${wmoToLabel(codes[i])}`,
      `最高${Math.round(tMax[i])}℃・最低${Math.round(tMin[i])}℃`,
      `降水量${(rainSum[i] ?? 0).toFixed(1)}mm`,
      `最大風速${Math.round(windMax[i] ?? 0)}m/s`,
    ];
    if (d >= today && rainProb[i] != null) parts.splice(2, 0, `降水確率${Math.round(rainProb[i])}%`);
    return `${label}: ${parts.join(" / ")}`;
  };

  const past = days.map((d, i) => (d < today ? line(d, i) : "")).filter(Boolean);
  const future = days.map((d, i) => (d >= today ? line(d, i) : "")).filter(Boolean);
  return [
    "【直近7日の実績】",
    ...(past.length > 0 ? past : ["（実績を取得できませんでした）"]),
    "",
    "【今日からの予報】",
    ...future,
  ].join("\n");
}

// ── API呼び出し（Web版の fetch("/api/...") と同一ボディ） ──
async function callApi<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (d as { error?: string }).error || "生成に失敗しました。" };
    return { ok: true, data: d as T };
  } catch {
    return { ok: false, error: "通信に失敗しました。ネットワークをご確認ください。" };
  }
}

export const generateReportApi = (records: string, date: string) =>
  callApi<{ report: string; usage?: unknown; costUsd?: number }>("/api/generate-report", { records, date });

export const searchChatApi = (question: string, records: string, recordCount: number) =>
  callApi<{ answer: string }>("/api/search-chat", { question, records, recordCount });

// sprayHistory はその農場自身の防除記録（lib/pesticideUsage.ts の formatSprayHistoryForPrompt の出力）。
// 天気だけの助言は汎用の生成AIでもできるため、ここを渡すことが本機能の存在理由になる。
// 散布記録が無ければ空文字が来るので、その場合は送らない（API側は未指定として扱う）。
export const pestControlAdviceApi = (forecast: string, lat: number, lng: number, sprayHistory?: string) =>
  callApi<{ advice: string; usage?: unknown; costUsd?: number }>("/api/pest-control-advice", {
    forecast, lat, lng, registrations: [],
    ...(sprayHistory && sprayHistory.trim() ? { sprayHistory } : {}),
  });

// ── 作物ごとの相談（api/advise.ts / 農業エージェント）──
// searchChatApi とは目的が違う。あちらは記録の検索（記録に無いことは答えない）で、
// こちらは知識の補填（記録がゼロでも成立する）。農薬の値は advice の文章ではなく
// registrationFacts（FAMIC原文）を画面に出す。
//
// 会話として続けるため messages（これまでのやりとり）を、前に言ったことを踏まえるため
// adviceHistory（過去の助言＋照合結果 / lib/adviceMatch.ts が整形）を渡す。
// 保存先は crop_advice_messages / crop_advice_actions（APIは Supabase に触らない）。
export interface AdviseRegistrationFact {
  productName: string;
  cropName: string;
  pestName: string;
  dilution: string;
  usageTiming: string;
  usageCount: string;
  totalCount: string;
  application: string;
  hasBlankLimit: boolean;
}
/** 助言から切り出した「やること」。そのまま crop_advice_actions に保存する。
 *  workType は作業記録と突き合わせるキーで、**null は「照合できない」**（未実施ではない）。
 *  API 側で語彙の完全一致だけを通しているので、ここに来る値はそのまま照合に使える。 */
export interface AdviseAction {
  title: string;
  workType: string | null;
  when: string;
  dueFrom: string | null;
  dueTo: string | null;
  why: string;
  sortOrder: number;
}
export interface AdviseResult {
  advice: {
    /** 利用者への返答（会話文）。これをスレッドの assistant 発言として保存する */
    reply: string;
    actions: AdviseAction[];
    watchPoints: string[];
    unknowns: string[];
  };
  registrationFacts: AdviseRegistrationFact[];
  sources: string[];
  limits: string[];
  usage?: unknown;
  costUsd?: number;
}
export interface AdviseRegistrationInput {
  product_name?: string;
  crop_name?: string;
  pest_name?: string;
  dilution?: string;
  usage_timing?: string;
  usage_count?: string;
  total_count?: string;
  application?: string;
}
export const adviseApi = (body: {
  crop: { name: string; famic_crop_name?: string | null; start_date?: string | null };
  today?: string;
  forecast?: string;
  registrations?: AdviseRegistrationInput[];
  records?: string;
  question?: string;
  region?: string;
  /** これまでのやりとり（古い順）。直近12件までがプロンプトに乗る */
  messages?: { role: "user" | "assistant"; content: string }[];
  /** 過去の助言＋作業記録との照合結果（formatAdviceHistoryForPrompt の出力） */
  adviceHistory?: string;
  /** 照合に使える作業種別の語彙。渡さないと workType が全て null になる */
  workTypes?: string[];
}) => callApi<AdviseResult>("/api/advise", body);

export const diagnoseImageApi = (imageUrl: string, cropName?: string) =>
  callApi<{ diagnosis: DiagnosisResult; usage?: unknown; costUsd?: number }>("/api/diagnose-image", cropName ? { imageUrl, cropName } : { imageUrl });

// 音声メモの構造化（Web版 /api/structure-voice と同一ボディ）。
// 文字起こし自体は iOS キーボードの音声入力（無料）を使い、構造化のみAPIに投げる
// —— Web版が Web Speech API（無料）+ 構造化API という分担なのと同じ構成。
export interface StructuredVoice {
  field: string | null;
  work_category: string | null;
  pesticide_names: string[];
  quantity_value: number | null;
  quantity_unit: string | null;
  soil_ph: number | null;
  note: string;
}
export const structureVoiceApi = (transcript: string, fields: string[], workCategories: string[], pesticides: string[]) =>
  callApi<StructuredVoice>("/api/structure-voice", { transcript, fields, workCategories, pesticides });
