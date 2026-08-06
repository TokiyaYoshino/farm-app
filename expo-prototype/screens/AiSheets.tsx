import { useEffect, useState } from "react";
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
  saveAiOutput, type DiagnosisResult,
} from "../lib/ai";
import { formatPesticideUsageForPrompt } from "../lib/pesticideUsage";

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

// ── ④ AI画像診断（単体・写真から直接） ──
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
