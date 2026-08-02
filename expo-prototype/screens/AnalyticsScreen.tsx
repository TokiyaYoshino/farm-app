import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS } from "../ui/tokens";
import { harvestQty, isCountableHarvest, excludedHarvestCount, workMinutes, toHours, pctDiff } from "../lib/metrics";
import { ComboChart, HBarChart, MultiLineChart, ScatterPlot, Legend, CHART_COLORS } from "../ui/charts";
import { reports, crops, users, gddMonthly, TODAY, userName, type Report } from "../mock";

// ─── 分析（src/components/AnalyticsView.tsx の移植）────────────────────
// 年/作物切替 → KPI(well+KpiTile) → 収穫グラフ → 作業時間内訳 → GDD → さらに掘る。
// AI出力履歴・病害虫傾向はSupabase由来のためプレースホルダ表示。
// recharts は ui/charts.tsx の軽量SVGチャートで代替(見た目の要点は同一)。

const GDD_BASE_TEMP = 10;

function KpiTile({ label, value, unit, sub, subTone }: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  subTone?: "up" | "down" | "flat";
}) {
  const subColor = subTone === "up" ? C.ink : subTone === "down" ? C.danger : C.textMuted;
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderRadius: RADIUS.row, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: "700", color: C.text, lineHeight: 25 }}>
        {value}
        {unit && <Text style={{ fontSize: 12, fontWeight: "400", color: C.textMuted }}> {unit}</Text>}
      </Text>
      <Text style={{ fontSize: 11, color: subColor, marginTop: 4, minHeight: 14 }}>{sub ?? ""}</Text>
    </View>
  );
}

function SecTitle({ icon, children }: { icon: keyof typeof Feather.glyphMap; children: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 10 }}>
      <Feather name={icon} size={14} color={C.textSub} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.textSub, letterSpacing: 0.5 }}>{children}</Text>
    </View>
  );
}

const cardStyle = {
  backgroundColor: C.card,
  borderRadius: RADIUS.card,
  padding: 16,
  marginBottom: 12,
  ...SHADOW.card,
};

const chip = (active: boolean) => ({
  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
  backgroundColor: active ? C.inkSoft : C.well,
  marginRight: 8,
});
const chipText = (active: boolean) => ({
  fontSize: 13, fontWeight: "600" as const, color: active ? C.ink : C.textSub,
});

export default function AnalyticsScreen() {
  const currentYear = 2026;
  const [year, setYear] = useState(currentYear);
  const [cropId, setCropId] = useState<number | "all">("all");
  const [showDeep, setShowDeep] = useState(false);
  const [d2Axis, setD2Axis] = useState<"temp" | "rain">("temp");

  const dataYears = Array.from(new Set(reports.map(r => Number(r.date.slice(0, 4))))).sort((a, b) => b - a);
  const yearOptions = dataYears.includes(currentYear) ? dataYears : [currentYear, ...dataYears];
  const safeYear = yearOptions.includes(year) ? year : yearOptions[0];

  const todayMmdd = TODAY.slice(5);
  const truncate = safeYear === currentYear;
  const inCrop = (r: Report) => cropId === "all" || r.crop_id === cropId;
  const inYear = (r: Report, y: number) =>
    r.date.startsWith(String(y)) && (!truncate || r.date.slice(5) <= todayMmdd);

  const cur = reports.filter(r => inCrop(r) && inYear(r, safeYear));
  const prev = reports.filter(r => inCrop(r) && inYear(r, safeYear - 1));

  // ── KPI ──
  const sum = (rs: Report[]) => rs.reduce((s, r) => s + harvestQty(r), 0);
  const curHarvest = sum(cur);
  const prevHarvest = sum(prev);
  const skipped = excludedHarvestCount(cur);

  const targetCrops = crops.filter(c => cropId === "all" || c.id === cropId);
  const targetYield = targetCrops.reduce((s, c) => s + (c.target_yield ?? 0), 0);
  const achieved = targetYield > 0 ? Math.round((curHarvest / targetYield) * 100) : null;

  const curHours = toHours(cur.reduce((s, r) => s + workMinutes(r), 0));
  const prevHours = toHours(prev.reduce((s, r) => s + workMinutes(r), 0));

  const curSpray = cur.filter(r => r.work_type === "防除").length;
  const prevSpray = prev.filter(r => r.work_type === "防除").length;

  const pctLabel = (v: number | null) =>
    v === null ? "前年データなし" : `前年${truncate ? "同時期" : ""}比 ${v >= 0 ? "+" : ""}${v}%`;
  const tone = (v: number | null): "up" | "down" | "flat" =>
    v === null ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat";

  // ── 収穫量: 月別 今年 vs 前年 vs 目標 ──
  const monthlySum = (y: number) => {
    const m = Array<number>(12).fill(0);
    reports
      .filter(r => inCrop(r) && r.date.startsWith(String(y)))
      .forEach(r => { m[Number(r.date.slice(5, 7)) - 1] += harvestQty(r); });
    return m;
  };
  const curMonths = monthlySum(safeYear);
  const prevMonths = monthlySum(safeYear - 1);
  const monthTarget = targetYield > 0 ? Math.round((targetYield / 12) * 10) / 10 : null;
  const hasHarvestData = curMonths.some(v => v > 0) || prevMonths.some(v => v > 0);
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

  // ── 作業時間の内訳 ──
  const groupHours = (rs: Report[], key: (r: Report) => string) => {
    const m: Record<string, number> = {};
    rs.forEach(r => {
      const min = workMinutes(r);
      if (min <= 0) return;
      const k = key(r);
      m[k] = (m[k] ?? 0) + min;
    });
    return m;
  };
  const buildBars = (key: (r: Report) => string) => {
    const c = groupHours(cur, key);
    const p = groupHours(prev, key);
    return Object.keys(c)
      .sort((a, b) => c[b] - c[a])
      .slice(0, 8)
      .map(name => ({ name, cy: toHours(c[name]), py: toHours(p[name] ?? 0) }));
  };
  const hoursByType = buildBars(r => r.work_type || "未設定");
  const hoursByUser = buildBars(r => userName(r.user_id));

  // ── 積算温度(GDD) ── モックの月次データから累積を組む
  const gddYears = Object.keys(gddMonthly).sort();
  const gddSeries = gddYears.map((y, i) => {
    let cum = 0;
    const values = gddMonthly[y].map(v => {
      if (v <= 0 && cum > 0) return null; // データ未到達月
      cum += v;
      return Math.round(cum);
    });
    return { name: y, color: CHART_COLORS[i % CHART_COLORS.length], values };
  });

  // ── さらに掘る ──
  const harvestRows = reports.filter(isCountableHarvest);
  const d2Points = harvestRows.flatMap(r => {
    const q = harvestQty(r);
    const x = parseFloat((d2Axis === "temp" ? r.temp : r.rain) ?? "");
    if (q <= 0 || isNaN(x)) return [];
    return [{ x, y: q }];
  });
  const d3Points = reports.flatMap(r => {
    const min = workMinutes(r);
    const q = harvestQty(r);
    if (min <= 0 || q <= 0) return [];
    return [{ x: toHours(min), y: q }];
  });

  const emptyBox = (icon: keyof typeof Feather.glyphMap, msg: string) => (
    <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
      <Feather name={icon} size={28} color={C.textMuted} />
      <Text style={{ color: C.textMuted, fontSize: 13 }}>{msg}</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}>
      {/* ── 対象年・作物の切り替え ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {yearOptions.map(y => (
          <Pressable key={y} onPress={() => setYear(y)} style={chip(safeYear === y)}>
            <Text style={chipText(safeYear === y)}>{y}年</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setCropId("all")} style={chip(cropId === "all")}>
          <Text style={chipText(cropId === "all")}>すべての作物</Text>
        </Pressable>
        {crops.map(c => (
          <Pressable key={c.id} onPress={() => setCropId(c.id)} style={chip(cropId === c.id)}>
            <Text style={chipText(cropId === c.id)}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── KPI ── */}
      <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 8, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <KpiTile
            label={`${safeYear}年の収穫量`}
            value={curHarvest > 0 ? String(Math.round(curHarvest * 10) / 10) : "—"}
            unit={curHarvest > 0 ? "kg" : undefined}
            sub={pctLabel(pctDiff(curHarvest, prevHarvest))}
            subTone={tone(pctDiff(curHarvest, prevHarvest))}
          />
          <KpiTile
            label="目標達成率"
            value={achieved != null ? String(achieved) : "—"}
            unit={achieved != null ? "%" : undefined}
            sub={targetYield > 0 ? `年間目標 ${targetYield}kg` : "目標が未設定です"}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <KpiTile
            label="総作業時間"
            value={curHours > 0 ? String(curHours) : "—"}
            unit={curHours > 0 ? "h" : undefined}
            sub={pctLabel(pctDiff(curHours, prevHours))}
            subTone={tone(pctDiff(curHours, prevHours))}
          />
          <KpiTile
            label="防除回数"
            value={String(curSpray)}
            unit="回"
            sub={prevSpray > 0 ? `前年${truncate ? "同時期" : ""} ${prevSpray}回` : "前年データなし"}
          />
        </View>
        {skipped > 0 && (
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6, paddingHorizontal: 6 }}>
            単位がkg以外の収穫記録{skipped}件を収穫量から除外しています
          </Text>
        )}
      </View>

      {/* ── 収穫量: 今年 vs 前年 vs 目標 ── */}
      <SecTitle icon="target">{`収穫量 ${safeYear}年 vs ${safeYear - 1}年`}</SecTitle>
      <View style={cardStyle}>
        {!hasHarvestData ? emptyBox("feather", "収穫の記録がまだありません") : (
          <>
            <ComboChart
              labels={monthLabels}
              bars={curMonths}
              line={prevMonths}
              dashed={monthTarget != null ? Array(12).fill(monthTarget) : undefined}
              height={210}
              unit="kg"
            />
            <Legend items={[
              { label: `${safeYear}年`, color: C.ink },
              { label: `${safeYear - 1}年`, color: C.info, line: true },
              ...(monthTarget != null ? [{ label: "月別目標", color: C.textMuted, line: true, dashed: true }] : []),
            ]} />
          </>
        )}
      </View>

      {/* ── 作業時間の内訳 ── */}
      <SecTitle icon="clock">作業時間の内訳</SecTitle>
      <View style={cardStyle}>
        {hoursByType.length === 0 ? emptyBox("clock", "作業時間の記録がまだありません") : (
          <>
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub, marginBottom: 6 }}>作業種別ごと</Text>
            <HBarChart rows={hoursByType} />
            {hoursByUser.length > 1 && (
              <>
                <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub, marginTop: 14, marginBottom: 6 }}>担当者ごと</Text>
                <HBarChart rows={hoursByUser} />
              </>
            )}
            <Legend items={[
              { label: `${safeYear}年`, color: C.ink },
              { label: `${safeYear - 1}年`, color: C.inkSoft },
            ]} />
            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
              作業時間は、記録した開始・終了時刻（無い場合は手入力の作業時間）から算出しています。
            </Text>
          </>
        )}
      </View>

      {/* ── 積算温度(GDD) ── */}
      <SecTitle icon="thermometer">積算温度（GDD）の年次比較</SecTitle>
      <View style={cardStyle}>
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.row, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 }}>
          <Text style={{ fontSize: 13, color: C.textSub, lineHeight: 21 }}>
            8/1 時点の積算温度は <Text style={{ fontWeight: "700", color: C.text }}>1,300℃・日</Text>。
            2025年が同じ値に達したのは 8/10 で、<Text style={{ fontWeight: "700", color: C.ink }}>今年は9日早い</Text>ペースです。
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 19, marginBottom: 10 }}>
          日平均気温から基準温度{GDD_BASE_TEMP}℃を引いた有効積算温度の、年初からの累積です。
          年ごとに比べると生育の進み方の早い・遅いが読めます（基準温度は暫定値）。
        </Text>
        <MultiLineChart labels={monthLabels} series={gddSeries} />
        <Legend items={gddSeries.map(s => ({ label: `${s.name}年`, color: s.color, line: true }))} />
      </View>

      {/* ── 病害虫診断の発生傾向(Supabase由来のためプレースホルダ) ── */}
      <SecTitle icon="alert-circle">病害虫診断の発生傾向</SecTitle>
      <View style={cardStyle}>
        <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 19, marginBottom: 10 }}>
          AI画像診断の結果のうち、確信度が「高」のものだけを集計しています。
          <Text style={{ fontWeight: "700", color: C.textSub }}>AIの推定であり確定診断ではありません。</Text>
        </Text>
        {emptyBox("alert-circle", "確信度「高」の診断結果がまだありません")}
      </View>

      {/* ── さらに掘る ── */}
      <SecTitle icon="bar-chart-2">さらに掘る</SecTitle>
      <View style={[cardStyle, !showDeep && { paddingVertical: 4 }]}>
        <Pressable
          onPress={() => setShowDeep(v => !v)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>相関を探す（気象・作業時間・防除タイミング）</Text>
          <Feather name={showDeep ? "chevron-up" : "chevron-down"} size={16} color={C.textSub} />
        </Pressable>
        {showDeep && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.hairline, paddingTop: 4 }}>
            {/* 気象×収穫 */}
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub, marginTop: 16, marginBottom: 8 }}>気象条件と収穫量の相関</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <Pressable onPress={() => setD2Axis("temp")} style={chip(d2Axis === "temp")}>
                <Text style={chipText(d2Axis === "temp")}>気温</Text>
              </Pressable>
              <Pressable onPress={() => setD2Axis("rain")} style={chip(d2Axis === "rain")}>
                <Text style={chipText(d2Axis === "rain")}>雨量</Text>
              </Pressable>
            </View>
            {d2Points.length === 0 ? emptyBox("cloud-rain", "データがまだありません") : (
              <ScatterPlot points={d2Points} color={C.ink} xUnit={d2Axis === "temp" ? "°C" : "mm"} yUnit="" />
            )}

            {/* 作業時間×収穫 */}
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub, marginTop: 16, marginBottom: 8 }}>作業時間と収穫量の関係</Text>
            {d3Points.length === 0 ? emptyBox("clock", "データがまだありません") : (
              <ScatterPlot points={d3Points} color={C.info} xUnit="h" yUnit="" />
            )}
          </View>
        )}
      </View>

      {/* ── AI出力の履歴(Supabase由来のためプレースホルダ) ── */}
      <SecTitle icon="star">AIの出力履歴</SecTitle>
      <View style={[cardStyle, { marginBottom: 32 }]}>
        {emptyBox("star", "AIの出力がまだありません")}
      </View>
    </ScrollView>
  );
}
