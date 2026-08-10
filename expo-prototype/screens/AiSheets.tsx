import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Platform, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { C, RADIUS } from "../ui/tokens";
import Btn from "../ui/Btn";
import BottomSheet from "../ui/BottomSheet";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import {
  formatDayRecords, formatRecordsForChat, fetchPestControlForecast,
  generateReportApi, searchChatApi, pestControlAdviceApi, diagnoseImageApi,
  adviseApi, saveAiOutput, type DiagnosisResult,
} from "../lib/ai";
import { formatPesticideUsageForPrompt } from "../lib/pesticideUsage";
import {
  matchActions, countMatches, statusLabel, matchDetail, formatAdviceHistoryForPrompt,
  type AdviceAction, type ActionMatch, type MatchStatus,
} from "../lib/adviceMatch";
import { WORK_TEMPLATES, type CropAdviceMessage } from "../lib/types";

// ─── AI機能シート群（src/App.tsx のAI系ボトムシートの移植）────────────────
// AI日報生成 / 記録検索チャット / 防除タイミング助言 / 画像診断（単体）。
// APIはWeb版本番(Vercel)の /api/* を直接呼ぶ。出力は ai_outputs に保存。

const lbl = { fontSize: 12, fontWeight: "600" as const, color: C.textSub, marginBottom: 5 };

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name="star" size={16} color={C.ink} />
        <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>{title}</Text>
      </View>
      <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
        <Feather name="x" size={16} color={C.textSub} />
      </Pressable>
    </View>
  );
}

function ResultBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: C.well, borderRadius: RADIUS.row, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 13, color: C.text, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

function ErrorText({ msg }: { msg: string }) {
  return msg ? <Text style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>{msg}</Text> : null;
}

// ── ① AI日報生成 ──
export function DailyReportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reports, pesticides, cropName, userName, currentUser } = useStore();
  const organizationId = currentUser?.organization_id ?? null;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true); setError(""); setResult("");
    const records = formatDayRecords(reports, date, { cropName, userName, pesticides });
    if (!records) { setError("その日の作業記録がありません。"); setLoading(false); return; }
    const res = await generateReportApi(records, date);
    if (res.ok) {
      setResult(res.data.report);
      void saveAiOutput(organizationId, currentUser?.id ?? null, "daily_report", {
        targetDate: date, inputSummary: records,
        outputText: res.data.report, usage: res.data.usage, costUsd: res.data.costUsd,
      });
    } else {
      setError(res.error);
    }
    setLoading(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader title="AI日報" onClose={onClose} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text style={lbl}>対象日</Text>
        <Pressable onPress={() => setShowDatePicker(true)} style={{ backgroundColor: C.well, borderRadius: RADIUS.row, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 15, color: C.text, fontWeight: "600" }}>{date}</Text>
          <Feather name="calendar" size={15} color={C.textMuted} />
        </Pressable>
        <ErrorText msg={error} />
        {!!result && <ResultBox text={result} />}
        <Btn variant="primary" size="lg" onPress={generate} icon={loading ? undefined : <Feather name="star" size={15} color="#fff" />}>
          {loading ? "生成中..." : result ? "もう一度生成" : "日報を生成"}
        </Btn>
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={new Date(date + "T00:00:00")}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            setShowDatePicker(false);
            if (event.type === "dismissed" || !selected) return;
            setDate(selected.toISOString().slice(0, 10));
            setResult(""); setError("");
          }}
        />
      )}
    </BottomSheet>
  );
}

// ── ② 記録検索チャット ──
export function SearchChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reports, crops, pesticides, cropName, userName, prefetchAllRegistrations } = useStore();
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setMessages(m => [...m, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    setError("");
    // 農薬の登録上限と使用実績も一緒に渡すため、未取得ぶんを先読みする（Web版と同一）。
    // 画面表示と同じ summarizeUsage を通すので、AI の回答と画面の数字が食い違わない
    const regs = await prefetchAllRegistrations();
    const limitsBlock = formatPesticideUsageForPrompt({
      pesticides, crops, reports, registrationsByPesticide: regs,
    });
    const { text: records, count } = formatRecordsForChat(reports, { cropName, userName, pesticides }, limitsBlock);
    if (!records) {
      setError("対象の作業記録がありません。");
      setLoading(false);
      return;
    }
    const res = await searchChatApi(question, records, count);
    if (res.ok) setMessages(m => [...m, { role: "assistant", content: res.data.answer }]);
    else setError(res.error);
    setLoading(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.85}>
      <SheetHeader title="AI検索（記録に質問）" onClose={onClose} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {messages.length === 0 && (
          <Text style={{ fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 12 }}>
            直近180日の作業記録をもとに答えます。{"\n"}例:「前回A圃場に防除したのはいつ？」「今月の収穫量は？」
          </Text>
        )}
        <View style={{ gap: 8, marginBottom: 12 }}>
          {messages.map((m, i) => (
            <View key={i} style={{ flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
              <View style={{
                maxWidth: "85%",
                paddingVertical: 8, paddingHorizontal: 11,
                borderRadius: 12,
                backgroundColor: m.role === "user" ? C.ink : C.well,
              }}>
                <Text style={{ fontSize: 13, lineHeight: 20, color: m.role === "user" ? "#fff" : C.text }}>{m.content}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={{ flexDirection: "row" }}>
              <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.well }}>
                <ActivityIndicator size="small" color={C.textMuted} />
              </View>
            </View>
          )}
        </View>
        <ErrorText msg={error} />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, fontSize: 14, backgroundColor: C.well, color: C.text }}
            placeholder="記録について質問..."
            placeholderTextColor={C.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
          />
          <Pressable
            onPress={send}
            style={{ width: 42, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: input.trim() ? C.ink : C.well }}
          >
            <Feather name="send" size={15} color={input.trim() ? "#fff" : C.textMuted} />
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ── ③ 防除タイミング助言 ──
// Web版と同一の制約: 1日1回。開くたびに生成すると ai_outputs に重複が溜まるため、
// 当日ぶんが無いときだけ生成し、あれば保存済みの結果を読み込んで表示する。
export function PestAdviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { weatherCoords, currentUser } = useStore();
  const organizationId = currentUser?.organization_id ?? null;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [forecast, setForecast] = useState("");
  const [error, setError] = useState("");
  const [showForecast, setShowForecast] = useState(false);
  const [savedToday, setSavedToday] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("ai_outputs")
        .select("output_text")
        .eq("organization_id", organizationId)
        .eq("kind", "pest_advice")
        .eq("target_date", today)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const saved = data?.[0]?.output_text as string | undefined;
      if (saved) { setResult(saved); setSavedToday(true); }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [open, organizationId]);

  const generate = async () => {
    const lat = weatherCoords?.lat;
    const lng = weatherCoords?.lng;
    if (lat == null || lng == null) { setError("位置情報が取得できません。"); return; }
    setLoading(true); setError(""); setResult("");
    try {
      const fc = await fetchPestControlForecast(lat, lng);
      if (!fc) { setError("天気予報を取得できませんでした。"); setLoading(false); return; }
      setForecast(fc);
      const res = await pestControlAdviceApi(fc, lat, lng);
      if (res.ok) {
        setResult(res.data.advice);
        setSavedToday(true);
        void saveAiOutput(organizationId, currentUser?.id ?? null, "pest_advice", {
          inputSummary: fc,
          outputText: res.data.advice, usage: res.data.usage, costUsd: res.data.costUsd,
        });
      } else {
        setError(res.error);
      }
    } catch {
      setError("通信に失敗しました。");
    }
    setLoading(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.85}>
      <SheetHeader title="防除タイミング助言" onClose={onClose} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 19, marginBottom: 12 }}>
          直近7日の実績と今後7日の予報（{weatherCoords?.name ?? ""}）から、散布に適したタイミングをAIが提案します。最終判断は現地の状況と製品ラベルに従ってください。
        </Text>
        <ErrorText msg={error} />
        {!!result && <ResultBox text={result} />}
        {!!forecast && result && (
          <Pressable onPress={() => setShowForecast(v => !v)} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: C.info, fontWeight: "600" }}>
              {showForecast ? "▲ 使用した天気データを閉じる" : "▼ 使用した天気データを見る"}
            </Text>
          </Pressable>
        )}
        {showForecast && !!forecast && (
          <View style={{ backgroundColor: C.bg, borderRadius: RADIUS.row, padding: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: C.textSub, lineHeight: 17, fontVariant: ["tabular-nums"] }}>{forecast}</Text>
          </View>
        )}
        {checking ? (
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <ActivityIndicator size="small" color={C.textMuted} />
          </View>
        ) : savedToday ? (
          <Text style={{ fontSize: 12, color: C.textMuted, textAlign: "center" }}>
            本日分の助言は生成済みです（1日1回）。明日また生成できます。
          </Text>
        ) : (
          <Btn variant="primary" size="lg" onPress={generate} icon={loading ? undefined : <Feather name="wind" size={15} color="#fff" />}>
            {loading ? "生成中..." : "助言を生成"}
          </Btn>
        )}
      </View>
    </BottomSheet>
  );
}

// ── ④ 作物ごとの相談（api/advise.ts / 農業エージェント）──
//
// SearchChatSheet とは別物。あちらは記録の検索で、記録が無ければ「分かりません」しか返らない。
// こちらは知識の補填なので、記録ゼロの作付けでも成立する（記録は「あれば渡す」扱い）。
//
// エージェントとして成立させるために3つを揃える:
//   1. **会話** …… 聞くと答えが返り、続けて聞ける（messages を渡して文脈を保つ）
//   2. **溜まる** …… 作付けごとに crop_advice_messages / crop_advice_actions に保存し、
//      開き直すと前の相談が残っている
//   3. **記録と照合** …… 助言した作業を作業記録と突き合わせ、実施済み／未実施を出す。
//      照合結果は保存せず lib/adviceMatch.ts で毎回計算する（記録は後から増えるため）
//
// 農薬の希釈倍数・使用時期・回数は AI の文章ではなく registrationFacts（FAMIC原文）を
// そのまま表に出す。AI の文章に混ざった数字を根拠にさせないため。

/** 照合状態のバッジ色。「未実施」と「照合できません」を別色にする（同じ色だと同じ意味に見える） */
function statusStyle(s: MatchStatus): { fg: string; bg: string } {
  switch (s) {
    case "done": return { fg: C.ink, bg: C.inkSoft };
    case "overdue": return { fg: C.danger, bg: C.dangerBg };
    case "pending": return { fg: C.warning, bg: C.warningBg };
    // 照合できないものは警告色にしない。催促ではなく「分からない」なので中立で出す
    case "unmatchable": return { fg: C.textSub, bg: C.well };
    case "dismissed": return { fg: C.textMuted, bg: C.well };
  }
}

/** 助言から切り出した「やること」1件。照合の根拠（見た期間・該当した記録）を必ず併記する */
function ActionRow({ m, onToggleDismiss }: { m: ActionMatch; onToggleDismiss: () => void }) {
  const st = statusStyle(m.status);
  const a = m.action;
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 10, padding: 11 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Text style={{
          fontSize: 13, fontWeight: "700", flex: 1,
          color: m.status === "dismissed" ? C.textMuted : C.text,
          textDecorationLine: m.status === "dismissed" ? "line-through" : "none",
        }}>{a.title}</Text>
        <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: st.fg }}>{statusLabel(m.status)}</Text>
        </View>
      </View>
      {!!a.when_text && <Text style={{ fontSize: 12, fontWeight: "600", color: C.ink, marginTop: 5 }}>{a.when_text}</Text>}
      {!!a.why && <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 18, marginTop: 3 }}>{a.why}</Text>}
      {/* 何を見てその判定になったかを必ず出す。書かないと利用者が結果を検証できない */}
      <Text style={{ fontSize: 10, color: C.textMuted, lineHeight: 16, marginTop: 5 }}>{matchDetail(m)}</Text>
      <Pressable onPress={onToggleDismiss} style={{ alignSelf: "flex-start", marginTop: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted }}>
          {m.status === "dismissed" ? "やることに戻す" : "これはやらない"}
        </Text>
      </Pressable>
    </View>
  );
}

/** 出典と限界。assistant の発言ごとに、生成当時のものを畳んで持たせる */
function SourcesBlock({ sources, limits }: { sources: string[]; limits: string[] }) {
  const [openBlock, setOpenBlock] = useState(false);
  if (sources.length === 0 && limits.length === 0) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setOpenBlock(v => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Feather name={openBlock ? "chevron-down" : "chevron-right"} size={12} color={C.textMuted} />
        <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted }}>出典とこの助言の限界</Text>
      </Pressable>
      {openBlock && (
        <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 10, marginTop: 6, gap: 8 }}>
          {sources.length > 0 && (
            <View>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.textSub, marginBottom: 3 }}>出典</Text>
              {sources.map((s, i) => <Text key={i} style={{ fontSize: 10, color: C.textMuted, lineHeight: 16 }}>・{s}</Text>)}
            </View>
          )}
          {limits.length > 0 && (
            <View>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.textSub, marginBottom: 3 }}>この助言の限界</Text>
              {limits.map((s, i) => <Text key={i} style={{ fontSize: 10, color: C.textMuted, lineHeight: 16 }}>・{s}</Text>)}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** 農薬の適用情報。**必ず原文のまま**出す（AI の文章の数字を根拠にさせない） */
function RegistrationFactsBlock({ facts }: { facts: NonNullable<CropAdviceMessage["registration_facts"]> }) {
  if (facts.length === 0) return null;
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: C.textSub }}>登録のある農薬（農薬登録情報の原文）</Text>
      {facts.map((f, i) => (
        <View key={i} style={{ backgroundColor: C.card, borderRadius: 10, padding: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: C.text, flex: 1 }}>{f.productName}</Text>
            <View style={{ backgroundColor: C.pesticideBg, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.pesticide }}>{f.pestName}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: C.textSub, lineHeight: 18 }}>
            希釈 {f.dilution} / 使用時期 {f.usageTiming}{"\n"}
            本剤の使用回数 {f.usageCount} / 総使用回数 {f.totalCount}{"\n"}
            使用方法 {f.application}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AdviseSheet({ open, onClose, cropId }: { open: boolean; onClose: () => void; cropId?: number }) {
  const {
    crops, reports, pesticides, workCategories, cropName, userName, weatherCoords, currentUser,
    prefetchAllRegistrations, loadCropAdvice, saveCropAdviceTurn, dismissAdviceAction,
  } = useStore();
  const organizationId = currentUser?.organization_id ?? null;
  const [selectedCropId, setSelectedCropId] = useState<number | null>(cropId ?? null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [messages, setMessages] = useState<CropAdviceMessage[]>([]);
  const [actions, setActions] = useState<AdviceAction[]>([]);
  const [error, setError] = useState("");

  // 開くたびに呼び出し元の作物に合わせる。未指定なら先頭の作付け
  useEffect(() => {
    if (!open) return;
    setSelectedCropId(cropId ?? crops[0]?.id ?? null);
  }, [open, cropId, crops]);

  const crop = crops.find(c => c.id === selectedCropId) ?? null;

  // 作付けを切り替えるたびに、その作付けのスレッドを読み直す（作物ごとに溜まる）
  useEffect(() => {
    if (!open || selectedCropId == null) { setMessages([]); setActions([]); return; }
    let alive = true;
    setThreadLoading(true); setError(""); setMessages([]); setActions([]);
    void loadCropAdvice(selectedCropId).then(data => {
      if (!alive) return;
      if (data) { setMessages(data.messages); setActions(data.actions); }
      else setError("これまでの相談を読み込めませんでした。");
      setThreadLoading(false);
    });
    return () => { alive = false; };
  }, [open, selectedCropId, loadCropAdvice]);

  // 照合は毎回計算する（保存しない）。作業記録が後から増えても表示が実態とずれない
  const matches = useMemo(
    () => (selectedCropId == null ? [] : matchActions(actions, reports.filter(r => r.crop_id === selectedCropId))),
    [actions, reports, selectedCropId],
  );
  const counts = useMemo(() => countMatches(matches), [matches]);
  // 作業記録と突き合わせられる作業種別の語彙。これに無い作業は API 側で null に落ちる
  const workTypeVocab = useMemo(() => {
    const names = [...WORK_TEMPLATES.filter(w => w !== "その他"), ...workCategories.map(c => c.name)];
    return [...new Set(names.filter(n => n && n.trim() !== ""))];
  }, [workCategories]);

  const send = async () => {
    const question = input.trim();
    if (!crop || !question || loading) return;
    setLoading(true); setError("");
    // 送信した質問はすぐ画面に出す（保存の成否を待たせない）。保存できたら本物の行に差し替える
    const pendingId = `pending-${messages.length}`;
    setMessages(prev => [...prev, {
      id: pendingId, crop_id: crop.id, role: "user", content: question,
      created_at: new Date().toISOString(),
    }]);
    setInput("");
    try {
      // 天気は取れなければ無しで続ける（API側も未取得を前提にした指示を出す）
      let forecast: string | undefined;
      if (weatherCoords) {
        forecast = await fetchPestControlForecast(weatherCoords.lat, weatherCoords.lng).catch(() => undefined);
      }
      // その作付けに紐づく記録だけを渡す。件数ゼロでも成立する
      const cropReports = reports.filter(r => r.crop_id === crop.id);
      const records = cropReports.length > 0
        ? formatRecordsForChat(cropReports, { cropName, userName, pesticides }).text.slice(0, 7500)
        : undefined;
      // 登録済み農薬の適用行。1商品で200行を超えることがあるので、送る前にこの作付けに
      // 適用のある行だけに絞る（サーバー側も同じ完全一致で絞り直す。二重でも結果は同じ）。
      // famic_crop_name 未設定なら1件も送らない ＝ API 側は「照合できていない」扱いになる。
      const famic = crop.famic_crop_name?.trim() || null;
      const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
      const registrations = famic
        ? Object.values(await prefetchAllRegistrations()).flat()
            .filter(r => norm(r.crop_name ?? "") === norm(famic))
            .map(r => ({
              product_name: r.product_name, crop_name: r.crop_name, pest_name: r.pest_name,
              dilution: r.dilution, usage_timing: r.usage_timing, usage_count: r.usage_count,
              total_count: r.total_count, application: r.application,
            }))
        : [];

      const res = await adviseApi({
        crop: { name: crop.name, famic_crop_name: crop.famic_crop_name ?? null, start_date: crop.start_date ?? null },
        today: new Date().toISOString().slice(0, 10),
        forecast,
        registrations,
        records,
        question,
        region: weatherCoords?.name,
        // 会話として続ける（今の質問は question で渡すので履歴には入れない）
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        // 前に出した助言と、その実施状況。画面のバッジと同じ matchActions を通すので
        // AI の言うことと画面が食い違わない
        adviceHistory: formatAdviceHistoryForPrompt(matches).slice(0, 6000),
        workTypes: workTypeVocab,
      });
      if (!res.ok) {
        setError(res.error);
        setMessages(prev => prev.filter(m => m.id !== pendingId));
        setInput(question);
        setLoading(false);
        return;
      }

      const saved = await saveCropAdviceTurn(crop.id, question, res.data);
      if (saved) {
        // 仮表示を保存済みの行に差し替える
        setMessages(prev => [...prev.filter(m => m.id !== pendingId), ...saved.messages]);
        setActions(prev => [...prev, ...saved.actions]);
      } else {
        // 保存できなくても回答は見せる（相談自体を無駄にしない）。溜まらないことは明示する
        setMessages(prev => [...prev, {
          id: `local-${prev.length}`, crop_id: crop.id, role: "assistant",
          content: res.data.advice.reply, sources: res.data.sources, limits: res.data.limits,
          registration_facts: res.data.registrationFacts, created_at: new Date().toISOString(),
        }]);
        setError("回答は表示していますが、保存できませんでした（次回この相談は残りません）。");
      }
      void saveAiOutput(organizationId, currentUser?.id ?? null, "advice", {
        cropId: crop.id,
        inputSummary: [`作物:${crop.name}`, `作付け:${crop.start_date ?? "未登録"}`,
          `記録:${cropReports.length}件`, `やりとり:${messages.length}件`, `質問:${question}`].join(" / "),
        outputJson: { advice: res.data.advice, registrationFacts: res.data.registrationFacts,
          sources: res.data.sources, limits: res.data.limits },
        usage: res.data.usage, costUsd: res.data.costUsd,
      });
    } catch {
      setError("通信に失敗しました。");
      setMessages(prev => prev.filter(m => m.id !== pendingId));
      setInput(question);
    }
    setLoading(false);
  };

  const toggleDismiss = async (a: AdviceAction) => {
    const next = a.dismissed_at ? null : new Date().toISOString();
    // 楽観更新。失敗したら戻す
    setActions(prev => prev.map(x => x.id === a.id ? { ...x, dismissed_at: next } : x));
    const ok = await dismissAdviceAction(a.id, next !== null);
    if (!ok) {
      setActions(prev => prev.map(x => x.id === a.id ? { ...x, dismissed_at: a.dismissed_at } : x));
      setError("更新できませんでした。");
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.92}>
      <SheetHeader title={crop ? `${crop.name}の相談` : "作物の相談"} onClose={onClose} />
      <ScrollView style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* 呼び出し元が作物を指定していないときだけ選ばせる */}
        {cropId == null && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {crops.length === 0 ? (
              <Text style={{ fontSize: 13, color: C.textMuted }}>作物が登録されていません。管理タブから登録してください。</Text>
            ) : crops.map(c => {
              const on = c.id === selectedCropId;
              return (
                <Pressable key={c.id} onPress={() => setSelectedCropId(c.id)}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.ink : C.well }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: on ? "#fff" : C.textSub }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {crop && (
          <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
            作付け {crop.start_date || "未登録"}
            {crop.famic_crop_name ? ` / 農薬登録上の作物名「${crop.famic_crop_name}」` : " / 農薬登録上の作物名は未設定"}
          </Text>
        )}

        {/* やること一覧。作業記録と照合した結果をここに集約する */}
        {matches.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <Text style={{ ...lbl, marginBottom: 0 }}>これまでに出たやること</Text>
              <Text style={{ fontSize: 11, color: C.textMuted }}>
                実施済み {counts.done} / 未実施 {counts.pending + counts.overdue}
                {counts.unmatchable > 0 ? ` / 照合不可 ${counts.unmatchable}` : ""}
              </Text>
            </View>
            <View style={{ backgroundColor: C.well, borderRadius: RADIUS.row, padding: 10, gap: 8 }}>
              {matches.map(m => (
                <ActionRow key={m.action.id} m={m} onToggleDismiss={() => void toggleDismiss(m.action)} />
              ))}
            </View>
            {counts.unmatchable > 0 && (
              <Text style={{ fontSize: 10, color: C.textMuted, lineHeight: 16, marginTop: 5 }}>
                「記録と照合できません」は未実施という意味ではありません。作業記録の作業種別に対応しない助言のため、実施したかを判断できないものです。
              </Text>
            )}
          </View>
        )}

        {/* スレッド本体 */}
        {threadLoading ? (
          <ActivityIndicator size="small" color={C.textMuted} style={{ marginVertical: 20 }} />
        ) : messages.length === 0 ? (
          <Text style={{ fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 12 }}>
            この作付けについて聞いてください。やりとりはこの作付けに残ります。{"\n"}
            例:「{crop?.name ?? "この作物"}、これどうしたらいい？」「今週やることは？」{"\n\n"}
            答えは作業の<Text style={{ fontWeight: "700", color: C.textSub }}>目安</Text>です。
            農薬の使用時期・回数は農薬登録情報の原文をそのまま表示します。
          </Text>
        ) : (
          <View style={{ gap: 10, marginBottom: 12 }}>
            {messages.map(m => (
              <View key={m.id} style={{ flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                <View style={{
                  maxWidth: m.role === "user" ? "85%" : "95%",
                  paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
                  backgroundColor: m.role === "user" ? C.ink : C.well,
                }}>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: m.role === "user" ? "#fff" : C.text }}>{m.content}</Text>
                  {m.role === "assistant" && (
                    <>
                      {!!m.registration_facts?.length && <RegistrationFactsBlock facts={m.registration_facts} />}
                      <SourcesBlock sources={m.sources ?? []} limits={m.limits ?? []} />
                    </>
                  )}
                </View>
              </View>
            ))}
            {loading && (
              <View style={{ flexDirection: "row" }}>
                <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.well }}>
                  <ActivityIndicator size="small" color={C.textMuted} />
                </View>
              </View>
            )}
          </View>
        )}

        <ErrorText msg={error} />
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, fontSize: 14, backgroundColor: C.well, color: C.text }}
          placeholder={crop ? `${crop.name}について聞く...` : "作付けを選んでください"}
          placeholderTextColor={C.textMuted}
          value={input}
          onChangeText={setInput}
          editable={!!crop && !loading}
          onSubmitEditing={() => void send()}
        />
        <Pressable
          onPress={() => void send()}
          style={{ width: 42, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: input.trim() && crop && !loading ? C.ink : C.well }}
        >
          <Feather name="send" size={15} color={input.trim() && crop && !loading ? "#fff" : C.textMuted} />
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// ── ⑤ AI画像診断（単体・写真から直接） ──
export function PhotoDiagnosisSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser } = useStore();
  const organizationId = currentUser?.organization_id ?? null;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState("");

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("写真ライブラリへのアクセスが許可されていません"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      setResult(null);
      setError("");
    }
  };

  // 診断APIは公開URLを要求するため、一度 Storage に上げてから渡す（Web版と同じ流れ）
  const diagnose = async () => {
    if (!imageUri || loading) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const ext = imageUri.split(".").pop()?.split("?")[0] || "jpg";
      const path = `diag-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const resp = await fetch(imageUri);
      const buf = await resp.arrayBuffer();
      const { error: upErr } = await supabase.storage.from("report-images").upload(path, buf, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
      });
      if (upErr) { setError(upErr.message); setLoading(false); return; }
      const imageUrl = supabase.storage.from("report-images").getPublicUrl(path).data.publicUrl;

      const res = await diagnoseImageApi(imageUrl);
      if (res.ok) {
        setResult(res.data.diagnosis);
        void saveAiOutput(organizationId, currentUser?.id ?? null, "diagnosis", {
          inputSummary: `写真:${imageUrl}`,
          outputJson: res.data.diagnosis, usage: res.data.usage, costUsd: res.data.costUsd,
        });
      } else {
        setError(res.error);
      }
    } catch {
      setError("診断に失敗しました。");
    }
    setLoading(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.85}>
      <SheetHeader title="AI画像診断" onClose={onClose} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 19, marginBottom: 12 }}>
          葉や果実の写真から病害虫の可能性をAIが推定します。
          <Text style={{ fontWeight: "700", color: C.textSub }}>確定診断ではありません。</Text>
          防除の判断は現物の確認と指導機関の情報にもとづいて行ってください。
        </Text>

        {imageUri ? (
          <View style={{ position: "relative", marginBottom: 12 }}>
            <Image source={{ uri: imageUri }} style={{ width: "100%", height: 220, borderRadius: 10 }} resizeMode="cover" />
            <Pressable
              onPress={() => { setImageUri(null); setResult(null); }}
              style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Feather name="x" size={12} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>削除</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickImage} style={{ alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 2, borderStyle: "dashed", borderColor: C.border, borderRadius: 10, paddingVertical: 28, marginBottom: 12, backgroundColor: C.bg }}>
            <Feather name="camera" size={26} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 13 }}>タップして写真を選択</Text>
          </Pressable>
        )}

        <ErrorText msg={error} />

        {result && (
          <View style={{ backgroundColor: C.well, borderRadius: RADIUS.row, padding: 14, marginBottom: 12, gap: 10 }}>
            {result.inconclusive ? (
              <Text style={{ fontSize: 13, color: C.textSub }}>この写真からは判断できませんでした。{result.note}</Text>
            ) : (
              <>
                {result.possibilities.map((p, i) => (
                  <View key={i} style={{ backgroundColor: C.card, borderRadius: 10, padding: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{p.name}</Text>
                      <View style={{ backgroundColor: C.pesticideBg, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: C.pesticide }}>{p.category}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: C.textMuted, marginLeft: "auto" }}>確信度 {p.confidence}%</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 18 }}>{p.reason}</Text>
                  </View>
                ))}
                {!!result.note && <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 18 }}>{result.note}</Text>}
              </>
            )}
          </View>
        )}

        {imageUri && (
          <Btn variant="primary" size="lg" onPress={diagnose} icon={loading ? undefined : <Feather name="search" size={15} color="#fff" />}>
            {loading ? "診断中..." : result ? "もう一度診断" : "診断する"}
          </Btn>
        )}
      </View>
    </BottomSheet>
  );
}
