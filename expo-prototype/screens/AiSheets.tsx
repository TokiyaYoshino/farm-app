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
import { formatPesticideUsageForPrompt, formatSprayHistoryForPrompt } from "../lib/pesticideUsage";
import { formatWorkCountsForPrompt } from "../lib/metrics";
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

// 注意書きの折りたたみ（Web版 src/ui/Disclosure.tsx と同じ方針）。
// 結論は常時・前提は畳む。消すのではなく分ける —— どこまでが公的な情報で
// どこからが AI の一般知識かを利用者が区別できなくなるため、注意書き自体は必ず付ける
// （docs/decisions/20260829-ai-output-structure.md）
function Notes({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setOpen(v => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Feather name={open ? "chevron-down" : "chevron-right"} size={13} color={C.textMuted} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: C.textMuted }}>
          {open ? "注意を閉じる" : `注意（${items.length}件）を見る`}
        </Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 6, backgroundColor: C.card, borderRadius: RADIUS.well, padding: 10 }}>
          {items.map((n, i) => (
            <Text key={i} style={{ fontSize: 12, lineHeight: 19, color: C.textMuted }}>· {n}</Text>
          ))}
        </View>
      )}
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
      <SheetHeader title="その日の作業を日報にまとめる" onClose={onClose} />
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
export function SearchChatSheet({ open, onClose, initialQuestion }: {
  open: boolean; onClose: () => void;
  /** 相談から「記録を調べる」で渡された検索語。入力欄に入れるだけで自動送信はしない
   *  —— 利用者が押していない課金呼び出しを起こさないため */
  initialQuestion?: string;
}) {
  const { reports, crops, pesticides, cropName, userName, prefetchAllRegistrations } = useStore();
  // assistant 行は結論（content）と根拠・注意を分けて持つ。api/search-chat.ts が
  // スキーマで分けて返すので、自由文を目視で切っているわけではない（Web版と同一）
  const [messages, setMessages] = useState<{
    role: "user" | "assistant"; content: string;
    evidence?: { date: string; detail: string }[];
    notes?: string[];
    answerable?: boolean;
  }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && initialQuestion) { setInput(initialQuestion); setError(""); }
  }, [open, initialQuestion]);

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
    if (res.ok) setMessages(m => [...m, {
      role: "assistant", content: res.data.answer,
      evidence: res.data.evidence ?? [], notes: res.data.notes ?? [],
      answerable: res.data.answerable !== false,
    }]);
    else setError(res.error);
    setLoading(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.85}>
      <SheetHeader title="記録に聞く" onClose={onClose} />
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
                <Text style={{
                  fontSize: m.role === "assistant" ? 14 : 13, lineHeight: 20,
                  fontWeight: m.role === "assistant" ? "600" : "400",
                  color: m.role === "user" ? "#fff" : C.text,
                }}>{m.content}</Text>
                {/* 根拠にした記録。3件までは畳まずに出す（結論の裏付けなので） */}
                {m.answerable && m.evidence && m.evidence.length > 0 && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.hairline }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted, marginBottom: 4 }}>根拠にした記録</Text>
                    {m.evidence.slice(0, 3).map((e, j) => (
                      <Text key={j} style={{ fontSize: 12, color: C.textSub, lineHeight: 19 }}>
                        <Text style={{ fontWeight: "700", color: C.text }}>{e.date}</Text> — {e.detail}
                      </Text>
                    ))}
                  </View>
                )}
                {/* 注意書きはサーバー固定文言。結論の隣に常時出すと結論が埋もれる */}
                {m.notes && m.notes.length > 0 && <Notes items={m.notes} />}
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
  const { weatherCoords, currentUser, reports, crops, pesticides } = useStore();
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
      // 自農場の防除実績。天気だけの助言は汎用の生成AIでもできるので、
      // 「自分の記録を読んだうえでの助言」にするための中核の材料
      const sprayHistory = formatSprayHistoryForPrompt({ reports, crops, pesticides });
      const res = await pestControlAdviceApi(fc, lat, lng, sprayHistory);
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
      <SheetHeader title="次の散布はいつ？" onClose={onClose} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 19, marginBottom: 12 }}>
          直近7日の実績と今後7日の予報（{weatherCoords?.name ?? ""}）に加えて、この農場の防除記録（前回の散布からの日数・同じ薬剤の繰り返し・昨年同時期）も踏まえて提案します。最終判断は現地の状況と製品ラベルに従ってください。
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

/**
 * 写真診断の結果を相談へ渡す形に整える。画面に出している項目と同じものを使うので、
 * AI が見ているものと利用者が見ているものが食い違わない。
 * label は「何を送るか」を相談シートに出すための短い見出し。
 */
export const diagnosisForAdvise = (d: DiagnosisResult): { text: string; label: string } => {
  const rows = d.possibilities.map(p => `- ${p.name}（${p.category} / 確信度 ${p.confidence}%）: ${p.reason}`);
  const text = [
    ...(d.inconclusive ? ["写真だけでは判断が難しいとのことです。"] : []),
    ...rows,
    ...(d.note?.trim() ? [d.note.trim()] : []),
  ].join("\n").slice(0, 800);
  const first = d.possibilities[0]?.name;
  const label = !first ? "候補なし"
    : d.possibilities.length > 1 ? `${first} ほか${d.possibilities.length - 1}件`
    : first;
  return { text, label };
};

/**
 * 保存する assistant 発言の本文。聞き返しは本文の最後の段落として同じ吹き出しに入れる。
 * 別列を足さないのは、利用者にとっては返答の一部（会話）であり、分けても表示上の利点が無いため。
 */
const adviceContent = (a: { reply: string; followUpQuestion?: string | null }): string =>
  [a.reply, a.followUpQuestion].filter(Boolean).join("\n\n");

export function AdviseSheet({ open, onClose, cropId, photoDiagnosis, onAskRecords, onAskPhoto }: {
  open: boolean; onClose: () => void;
  /** 相談対象の作付け。null / 未指定は「作物を指定しない畑全体の相談」
   *  （docs/decisions/20260906-general-advice-entry.md） */
  cropId?: number | null;
  /** 写真診断の結果を持ち込むときの添付。1ターンだけ送って消す
   *  （docs/decisions/20260908-advice-handoff.md） */
  photoDiagnosis?: { text: string; label: string } | null;
  /** 「記録を調べる」を押したときに記録検索シートを開く。渡さなければボタンを出さない */
  onAskRecords?: (query: string) => void;
  /** 「写真で調べる」を押したときに画像診断シートを開く。渡さなければボタンを出さない */
  onAskPhoto?: () => void;
}) {
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
  /** 写真診断の結果を相談へ持ち込むときの添付。1ターンだけ送って消す */
  const [photo, setPhoto] = useState<{ text: string; label: string } | null>(null);

  // 開くたびに呼び出し元の指定に合わせる。未指定は畑全体の相談。
  // 以前は先頭の作付けに寄せていたが、それだと「畑全体で相談する」入口が作れない
  useEffect(() => {
    if (!open) return;
    setSelectedCropId(cropId ?? null);
    setPhoto(photoDiagnosis ?? null);
  }, [open, cropId, photoDiagnosis]);

  const crop = crops.find(c => c.id === selectedCropId) ?? null;

  // 作付けを切り替えるたびに、その作付けのスレッドを読み直す（作物ごとに溜まる）
  useEffect(() => {
    if (!open) { setMessages([]); setActions([]); return; }
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
    () => matchActions(
      actions,
      selectedCropId == null ? reports : reports.filter(r => r.crop_id === selectedCropId),
    ),
    [actions, reports, selectedCropId],
  );
  const counts = useMemo(() => countMatches(matches), [matches]);
  // 作業記録と突き合わせられる作業種別の語彙。これに無い作業は API 側で null に落ちる
  const workTypeVocab = useMemo(() => {
    const names = [...WORK_TEMPLATES.filter(w => w !== "その他"), ...workCategories.map(c => c.name)];
    return [...new Set(names.filter(n => n && n.trim() !== ""))];
  }, [workCategories]);

  const send = async () => {
    // 写真を添えたときは、何も打たずに送れる方が自然（屋外・手袋での利用）。
    // API は question を会話の最後の user メッセージとして使うので空にはしない
    const question = input.trim()
      || (photo ? "この写真の結果について、次にどうすればいい？" : "");
    // crop が null なら畑全体の相談。作物を1件も登録していなくても成立する
    if (!question || loading) return;
    setLoading(true); setError("");
    // 送信した質問はすぐ画面に出す（保存の成否を待たせない）。保存できたら本物の行に差し替える
    const pendingId = `pending-${messages.length}`;
    setMessages(prev => [...prev, {
      id: pendingId, crop_id: selectedCropId, role: "user", content: question,
      created_at: new Date().toISOString(),
    }]);
    setInput("");
    // 添付は1ターンだけ。毎ターン送ると12ターンの窓と文字数の予算を食い続け、
    // 会話が古い写真に引きずられる
    setPhoto(null);
    try {
      // 天気は取れなければ無しで続ける（API側も未取得を前提にした指示を出す）
      let forecast: string | undefined;
      if (weatherCoords) {
        forecast = await fetchPestControlForecast(weatherCoords.lat, weatherCoords.lng).catch(() => undefined);
      }
      // 作付けの相談はその作付けの記録だけ、畑全体の相談は全作物の記録を渡す
      const targetReports = crop ? reports.filter(r => r.crop_id === crop.id) : reports;
      const records = targetReports.length > 0
        ? formatRecordsForChat(targetReports, { cropName, userName, pesticides }).text.slice(0, 7500)
        : undefined;
      // 数えるのはコード、言い換えるのが LLM。画面・防除助言と同じ関数を通すので、
      // AI の言うことと画面の数字が食い違わない
      // （docs/decisions/20260906-advice-reply-tone.md）
      const AGG_MAX = 4000;
      const workCounts = formatWorkCountsForPrompt(targetReports, 2000);
      const sprayBudget = Math.max(0, AGG_MAX - workCounts.length - 2);
      const aggregates = [
        formatSprayHistoryForPrompt({ reports: targetReports, crops, pesticides, maxChars: sprayBudget }),
        workCounts,
      ].filter(x => x.trim() !== "").join("\n\n");
      // 適用情報の照合と使用実績の集計で同じものを見るので、1回だけ引いて使い回す
      const regsByPesticide = await prefetchAllRegistrations();
      // 農薬の使用実績（あと何回使えるか）。作付けの相談ではその作物だけを数える
      // —— 他の作付けの実績を混ぜると誤帰属を招く。適用行（ラベル原文）は載せない
      // （docs/decisions/20260908-advice-handoff.md）
      const pesticideUsage = formatPesticideUsageForPrompt({
        pesticides,
        crops: crop ? [crop] : crops,
        reports: targetReports,
        registrationsByPesticide: regsByPesticide,
        maxChars: 2400,
        includeLabelRows: false,
      });
      // 登録済み農薬の適用行。1商品で200行を超えることがあるので、送る前にこの作付けに
      // 適用のある行だけに絞る（サーバー側も同じ完全一致で絞り直す。二重でも結果は同じ）。
      // famic_crop_name 未設定なら1件も送らない ＝ API 側は「照合できていない」扱いになる。
      // 畑全体の相談も作物が定まらないため、同じ理由で常に空になる
      const famic = crop?.famic_crop_name?.trim() || null;
      const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
      const registrations = famic
        ? Object.values(regsByPesticide).flat()
            .filter(r => norm(r.crop_name ?? "") === norm(famic))
            .map(r => ({
              product_name: r.product_name, crop_name: r.crop_name, pest_name: r.pest_name,
              dilution: r.dilution, usage_timing: r.usage_timing, usage_count: r.usage_count,
              total_count: r.total_count, application: r.application,
            }))
        : [];

      const res = await adviseApi({
        // crop を省くと api/advise.ts 側が畑全体の相談として扱う
        crop: crop
          ? { name: crop.name, famic_crop_name: crop.famic_crop_name ?? null, start_date: crop.start_date ?? null }
          : undefined,
        today: new Date().toISOString().slice(0, 10),
        forecast,
        registrations,
        records,
        aggregates: aggregates || undefined,
        pesticideUsage: pesticideUsage || undefined,
        photoDiagnosis: photo?.text,
        question,
        region: weatherCoords?.name,
        // 会話として続ける（今の質問は question で渡すので履歴には入れない）
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        // 前に出した助言と、その実施状況。画面のバッジと同じ matchActions を通すので
        // AI の言うことと画面が食い違わない
        adviceHistory: formatAdviceHistoryForPrompt(matches, 20, crop ? "crop" : "farm").slice(0, 6000),
        workTypes: workTypeVocab,
      });
      if (!res.ok) {
        setError(res.error);
        setMessages(prev => prev.filter(m => m.id !== pendingId));
        setInput(question);
        setLoading(false);
        return;
      }

      const saved = await saveCropAdviceTurn(selectedCropId, question, res.data);
      if (saved) {
        // 仮表示を保存済みの行に差し替える
        setMessages(prev => [...prev.filter(m => m.id !== pendingId), ...saved.messages]);
        setActions(prev => [...prev, ...saved.actions]);
      } else {
        // 保存できなくても回答は見せる（相談自体を無駄にしない）。溜まらないことは明示する
        setMessages(prev => [...prev, {
          id: `local-${prev.length}`, crop_id: selectedCropId, role: "assistant",
          content: adviceContent(res.data.advice), sources: res.data.sources, limits: res.data.limits,
          watch_points: res.data.advice.watchPoints, unknowns: res.data.advice.unknowns,
          record_search_query: res.data.advice.recordSearchQuery ?? null,
          registration_facts: res.data.registrationFacts, created_at: new Date().toISOString(),
        }]);
        setError("回答は表示していますが、保存できませんでした（次回この相談は残りません）。");
      }
      void saveAiOutput(organizationId, currentUser?.id ?? null, "advice", {
        cropId: selectedCropId,
        inputSummary: [
          ...(crop ? [`作物:${crop.name}`, `作付け:${crop.start_date ?? "未登録"}`] : ["対象:畑全体"]),
          `記録:${targetReports.length}件`,
          ...(photo ? ["写真候補:あり"] : []),
          `やりとり:${messages.length}件`, `質問:${question}`,
        ].join(" / "),
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
      <SheetHeader title={`${crop ? crop.name : "畑全体"}の相談`} onClose={onClose} />
      <ScrollView style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* 相談する対象。入口は1つで、対象の選択はシートの中で行う
            （docs/decisions/20260906-general-advice-entry.md）。
            作物を1件も登録していなくても「畑全体」で成立する */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {[{ id: null as number | null, name: "畑全体" }, ...crops.map(c => ({ id: c.id as number | null, name: c.name }))].map(o => {
            const on = o.id === selectedCropId;
            return (
              <Pressable key={o.id ?? "farm"} onPress={() => setSelectedCropId(o.id)}
                style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.ink : C.well }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: on ? "#fff" : C.textSub }}>{o.name}</Text>
              </Pressable>
            );
          })}
        </View>

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
            {crop ? (
              <>
                この作付けについて聞いてください。やりとりはこの作付けに残ります。{"\n"}
                例:「{crop.name}、これどうしたらいい？」「今週やることは？」{"\n\n"}
              </>
            ) : (
              <>
                畑全体について聞いてください。やりとりは畑全体の相談として残ります。{"\n"}
                例:「今の時期、畑全体で気をつけることは？」「そろそろ何をすればいい？」{"\n"}
                農薬を具体的に知りたいときは、上で作物を選んでください。{"\n\n"}
              </>
            )}
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
                      {/* 見ておくこと。結論の一部なので畳まない（最大3件） */}
                      {!!m.watch_points?.length && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.hairline }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted, marginBottom: 4 }}>見ておくこと</Text>
                          {m.watch_points.slice(0, 3).map((w, i) => (
                            <Text key={i} style={{ fontSize: 12, color: C.textSub, lineHeight: 19 }}>· {w}</Text>
                          ))}
                        </View>
                      )}
                      {/* 相談が見ている記録は直近60件だけ。その外を数える質問は答えようがないので、
                          記録検索へ検索語を添えて渡す（docs/decisions/20260908-advice-handoff.md）。
                          押した時点では開くだけで送信はしない */}
                      {!!m.record_search_query && onAskRecords && (
                        <Pressable
                          onPress={() => onAskRecords(m.record_search_query!)}
                          style={{ marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
                            paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.card,
                            borderWidth: 1, borderColor: C.hairline }}
                        >
                          <Feather name="message-square" size={12} color={C.ink} />
                          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: C.ink, maxWidth: 200 }}>
                            記録を調べる:「{m.record_search_query}」
                          </Text>
                        </Pressable>
                      )}
                      {!!m.unknowns?.length && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted, marginBottom: 4 }}>判断できないこと</Text>
                          {m.unknowns.slice(0, 3).map((u, i) => (
                            <Text key={i} style={{ fontSize: 12, color: C.textSub, lineHeight: 19 }}>· {u}</Text>
                          ))}
                        </View>
                      )}
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

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}>
        {/* 何を送るのかを見せる。写真そのものではなく「写真から絞り込んだ候補」を渡す */}
        {photo && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.well,
            borderRadius: RADIUS.row, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 }}>
            <Feather name="camera" size={13} color={C.textSub} />
            <Text style={{ flex: 1, fontSize: 12, color: C.textSub, lineHeight: 18 }}>
              写真の結果を添えて相談します（{photo.label}）
            </Text>
            <Pressable onPress={() => setPhoto(null)} hitSlop={8}>
              <Feather name="x" size={14} color={C.textMuted} />
            </Pressable>
          </View>
        )}

        {/* 写真の用事も同じ窓から始められるようにする。診断そのものは既存のシートに任せる */}
        {onAskPhoto && !photo && (
          <Pressable
            onPress={onAskPhoto}
            style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, paddingVertical: 4 }}
          >
            <Feather name="camera" size={13} color={C.textSub} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub }}>写真で調べる</Text>
          </Pressable>
        )}

        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, fontSize: 14, backgroundColor: C.well, color: C.text }}
            placeholder={photo ? "気になることがあれば書く（空でも送れます）"
              : crop ? `${crop.name}について聞く...` : "畑全体について聞く..."}
            placeholderTextColor={C.textMuted}
            value={input}
            onChangeText={setInput}
            editable={!loading}
            onSubmitEditing={() => void send()}
          />
          {/* 写真を添えているときは、何も打たなくても送れる（屋外・手袋での利用） */}
          <Pressable
            onPress={() => void send()}
            style={{ width: 42, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center",
              backgroundColor: (input.trim() || photo) && !loading ? C.ink : C.well }}
          >
            <Feather name="send" size={15} color={(input.trim() || photo) && !loading ? "#fff" : C.textMuted} />
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ── ⑤ AI画像診断（単体・写真から直接） ──
export function PhotoDiagnosisSheet({ open, onClose, onAdvise }: {
  open: boolean; onClose: () => void;
  /** 診断結果を相談へ引き渡す。渡さなければボタンを出さない */
  onAdvise?: (d: DiagnosisResult) => void;
}) {
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
      <SheetHeader title="写真で病害虫を絞り込む" onClose={onClose} />
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

        {/* 診断だけで終わらせず、次の一手の相談へ渡す。記録を介さない単体診断なので
            作付けは分からない ＝ 畑全体の相談に入れ、作物を選んだ方がよい場面は
            相談側が促す（docs/decisions/20260908-advice-handoff.md） */}
        {result && onAdvise && (
          <View style={{ marginBottom: 12 }}>
            <Btn variant="secondary" size="md" onPress={() => onAdvise(result)}
              icon={<Feather name="message-circle" size={14} color={C.ink} />}>
              この結果をもとに相談する
            </Btn>
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
