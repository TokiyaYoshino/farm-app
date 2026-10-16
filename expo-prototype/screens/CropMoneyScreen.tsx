import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C, RADIUS, SHADOW } from "../ui/tokens";
import { harvestQty, workMinutes, toHours } from "../lib/metrics";
import { useStore } from "../lib/store";
import type { Report } from "../lib/types";
import { todayMmDd } from "../lib/date";
import BottomSheet from "../ui/BottomSheet";
import Btn from "../ui/Btn";

// ─── 収支（作物ごとの今年の見込み）──────────────────────────────
// 見込み手取り = 見込み収量 × 単価 − 経費。収量・作業時間は既存の集計（metrics）を通す。
// 単価・経費は DB に列がまだ無いため、当面は端末内（AsyncStorage）に作物ごとに保存する仮置き。
// 本採用時は crops に列を足して組織で共有する（docs/decisions/20261011-tacit-knowledge-analytics.md）。
// 予測は言い切らない（農薬の「OK・安全とは言わない」原則と同じ扱い）。

const COST_KEYS = ["農薬・資材", "肥料", "苗・種", "その他"] as const;
// 何を入れる欄かを入力シートで一行だけ言う（欄名だけだと「何の合計か」で迷う）
const HINTS: Record<"price" | typeof COST_KEYS[number], string> = {
  price: "出荷したときの1kgあたりの手取り単価",
  "農薬・資材": "この作物に使った農薬・マルチ・ひもなどの今年の合計",
  "肥料": "この作物に使った肥料の今年の合計",
  "苗・種": "この作物の苗・種の今年の合計",
  "その他": "上に入らない、この作物にかかったお金の今年の合計",
};
type CostKey = typeof COST_KEYS[number];
interface MoneyInput { price: string; costs: Record<CostKey, string> }
const EMPTY: MoneyInput = { price: "", costs: { "農薬・資材": "", "肥料": "", "苗・種": "", "その他": "" } };

const num = (s: string) => {
  const v = Number(s.replace(/[,，円\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 去年の実績を今年のペースで伸ばした見込み。根拠の文言も一緒に返す */
function project(curYtd: number, prevYtd: number, prevTotal: number, fallback: number | null, unit: string) {
  if (prevTotal > 0 && prevYtd > 0) {
    const ratio = curYtd / prevYtd;
    const pct = Math.round((ratio - 1) * 100);
    return { value: Math.max(prevTotal * ratio, curYtd), basis: `去年 ${Math.round(prevTotal).toLocaleString()}${unit} × 今年のペース（前年同時期比 ${pct >= 0 ? "+" : ""}${pct}%）` };
  }
  if (prevTotal > 0) return { value: Math.max(prevTotal, curYtd), basis: `去年の実績 ${Math.round(prevTotal).toLocaleString()}${unit}（今年はまだ比べられる記録がありません）` };
  if (fallback) return { value: Math.max(fallback, curYtd), basis: `目標 ${fallback.toLocaleString()}${unit}（去年の記録がありません）` };
  return { value: curYtd, basis: `今年これまでの実績（去年の記録・目標がありません）` };
}

/** 欄の1行。押すと数字ボタンのシートが開く（キーボードを出さない） */
function MoneyRow({ label, value, unit, onPress, first }: {
  label: string; value: string; unit: string; onPress: () => void; first?: boolean;
}) {
  const v = num(value);
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${label}を入れる`}
      style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: RADIUS.row, paddingHorizontal: 14, minHeight: 52, marginTop: first ? 0 : 6 }}>
      <Text style={{ flex: 1, fontSize: 14, color: C.text }}>{label}</Text>
      {v > 0
        ? <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>{v.toLocaleString("ja-JP")}<Text style={{ fontSize: 12, fontWeight: "400", color: C.textMuted }}> {unit}</Text></Text>
        : <Text style={{ fontSize: 13, color: C.textMuted }}>未入力</Text>}
      <Feather name="chevron-right" size={16} color={C.textMuted} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"] as const;

/** 数字ボタンで金額を入れるシート。大きな表示と押しやすいボタンで、桁区切りも見える */
function NumberPadSheet({ open, title, hint, unit, initial, onSave, onClose }: {
  open: boolean; title: string; hint: string; unit: string; initial: string;
  onSave: (v: string) => void; onClose: () => void;
}) {
  const [digits, setDigits] = useState("");
  useEffect(() => { if (open) setDigits(String(num(initial) || "")); }, [open, initial]);
  const press = (k: typeof PAD[number]) => {
    if (k === "back") { setDigits(d => d.slice(0, -1)); return; }
    setDigits(d => (d + k).replace(/^0+/, "").slice(0, 9));
  };
  const shown = digits ? Number(digits).toLocaleString("ja-JP") : "0";
  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.85}>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>{hint}</Text>
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, paddingVertical: 18, paddingHorizontal: 18, marginTop: 14, flexDirection: "row", alignItems: "baseline", justifyContent: "flex-end" }}>
          <Text style={{ fontSize: 36, fontWeight: "700", color: digits ? C.text : C.textMuted }}>{shown}</Text>
          <Text style={{ fontSize: 15, color: C.textSub, marginLeft: 6 }}>{unit}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {PAD.map(k => (
            <Pressable key={k} onPress={() => press(k)} accessibilityLabel={k === "back" ? "1文字消す" : k}
              style={({ pressed }) => ({ width: "31.5%", flexGrow: 1, height: 56, borderRadius: RADIUS.row, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? C.hairline : C.well })}>
              {k === "back"
                ? <Feather name="delete" size={22} color={C.text} />
                : <Text style={{ fontSize: 22, fontWeight: "600", color: C.text }}>{k}</Text>}
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="lg" onPress={() => setDigits("")} style={{ flex: 1 }}>0にする</Btn>
          <Btn variant="primary" size="lg" onPress={() => { onSave(digits); onClose(); }} style={{ flex: 2 }}>保存</Btn>
        </View>
      </View>
    </BottomSheet>
  );
}

export default function CropMoneyScreen() {
  const { reports, crops, currentUser } = useStore();
  const orgId = currentUser?.organization_id ?? "local";
  const [cropId, setCropId] = useState<number | null>(null);
  const crop = crops.find(c => c.id === cropId) ?? crops[0] ?? null;

  const storageKey = crop ? `cropMoney_${orgId}_${crop.id}` : null;
  const [input, setInput] = useState<MoneyInput>(EMPTY);
  const [editing, setEditing] = useState<"price" | CostKey | null>(null);
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then(v => { if (!cancelled) setInput(v ? { ...EMPTY, ...JSON.parse(v) } : EMPTY); })
      .catch(() => { if (!cancelled) setInput(EMPTY); });
    return () => { cancelled = true; };
  }, [storageKey]);
  const save = (next: MoneyInput) => {
    setInput(next);
    if (storageKey) void AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  };

  if (!crop) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.textMuted, fontSize: 13 }}>作物を登録すると、作物ごとの見込みが出ます</Text>
      </View>
    );
  }

  const year = new Date().getFullYear();
  const mmdd = todayMmDd();
  const ofCrop = (y: number, ytd: boolean) =>
    reports.filter((r: Report) => r.crop_id === crop.id && r.date.startsWith(String(y)) && (!ytd || r.date.slice(5) <= mmdd));
  const sumQty = (rs: Report[]) => rs.reduce((s, r) => s + harvestQty(r), 0);
  const sumMin = (rs: Report[]) => rs.reduce((s, r) => s + workMinutes(r), 0);

  const yieldP = project(sumQty(ofCrop(year, true)), sumQty(ofCrop(year - 1, true)), sumQty(ofCrop(year - 1, false)), crop.target_yield ?? null, "kg");
  const hoursP = project(toHours(sumMin(ofCrop(year, true))), toHours(sumMin(ofCrop(year - 1, true))), toHours(sumMin(ofCrop(year - 1, false))), null, "時間");

  const price = num(input.price);
  const cost = COST_KEYS.reduce((s, k) => s + num(input.costs[k]), 0);
  const sales = yieldP.value * price;
  const net = sales - cost;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
      {/* ── 作物の切り替え ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ paddingBottom: 4 }}>
        {crops.map(c => {
          const on = c.id === crop.id;
          return (
            <Pressable key={c.id} onPress={() => setCropId(c.id)}
              style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.inkSoft : C.well, marginRight: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: on ? C.ink : C.textSub }}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── 見込み手取り ── */}
      <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, padding: 16, marginBottom: 12, ...SHADOW.card }}>
        {/* 経費が1つも入っていないと売上＝手取りに見えてしまうので、そのときは「見込み売上」と言う */}
        <Text style={{ fontSize: 11, color: C.textMuted }}>{year}年の{price > 0 && cost === 0 ? "見込み売上" : "見込み手取り"}（{crop.name}）</Text>
        {price > 0 ? (
          <>
            <Text style={{ fontSize: 30, fontWeight: "700", color: net >= 0 ? C.text : C.danger, marginTop: 4 }}>{yen(net)}</Text>
            {cost === 0 ? (
              <Text style={{ fontSize: 12, color: C.warning, marginTop: 2 }}>経費を入れると手取りになります</Text>
            ) : (
              <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
                {hoursP.value > 0 ? `1時間あたり ${yen(net / hoursP.value)}（作業 ${Math.round(hoursP.value)}時間の見込み）` : "作業時間の記録がありません"}
              </Text>
            )}
            <View style={{ height: 1, backgroundColor: C.hairline, marginVertical: 12 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: C.text }}>見込み売上</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{yen(sales)}</Text>
            </View>
            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>見込み収量 {Math.round(yieldP.value).toLocaleString()}kg × 単価 {price.toLocaleString()}円</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ fontSize: 13, color: C.textSub }}>経費</Text>
              <Text style={{ fontSize: 13, color: C.text }}>−{yen(cost)}</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 15, fontWeight: "600", color: C.text, marginTop: 8 }}>単価が未入力です</Text>
            <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>出荷の単価（1kgあたり）を入れると、見込み収量 {Math.round(yieldP.value).toLocaleString()}kg から計算します</Text>
            <Btn variant="soft" size="md" onPress={() => setEditing("price")} style={{ marginTop: 12, alignSelf: "flex-start" }}>単価を入れる</Btn>
          </>
        )}
      </View>

      {/* ── 根拠 ── */}
      <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, padding: 16, marginBottom: 12, ...SHADOW.card }}>
        <Text style={{ fontSize: 11, color: C.textMuted }}>見込み収量の根拠</Text>
        <Text style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{yieldP.basis}</Text>
        <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 10 }}>作業時間の根拠</Text>
        <Text style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{hoursP.basis}</Text>
      </View>

      {/* ── 単価・経費の入力 ── */}
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.textSub, marginTop: 4, marginBottom: 8 }}>出荷の単価（{crop.name}）</Text>
      <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 8 }}>
        <MoneyRow label="出荷の単価" value={input.price} unit="円/kg" onPress={() => setEditing("price")} first />
      </View>
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.textSub, marginTop: 16, marginBottom: 8 }}>経費（今年の合計）</Text>
      <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 8 }}>
        {COST_KEYS.map((k, i) => (
          <MoneyRow key={k} label={k} value={input.costs[k]} unit="円" onPress={() => setEditing(k)} first={i === 0} />
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
          <Text style={{ fontSize: 13, color: C.textSub }}>経費の合計</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{yen(cost)}</Text>
        </View>
      </View>
      <NumberPadSheet
        open={editing != null}
        title={editing === "price" ? "出荷の単価（1kgあたり）" : editing ?? ""}
        hint={editing ? HINTS[editing] : ""}
        unit={editing === "price" ? "円/kg" : "円"}
        initial={editing === "price" ? input.price : editing ? input.costs[editing] : ""}
        onSave={v => {
          if (editing === "price") save({ ...input, price: v });
          else if (editing) save({ ...input, costs: { ...input.costs, [editing]: v } });
        }}
        onClose={() => setEditing(null)}
      />
      <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 8, marginHorizontal: 4, lineHeight: 16 }}>
        見込みは記録と入力した単価・経費からの計算です。天候や相場で変わります。単価と経費は今はこの端末にだけ保存されます。
      </Text>
    </ScrollView>
  );
}
