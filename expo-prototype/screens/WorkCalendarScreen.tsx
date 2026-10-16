import { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, RADIUS, SHADOW } from "../ui/tokens";
import { useStore } from "../lib/store";
import { isPesticideWorkType, type Report } from "../lib/types";
import { dispName } from "../lib/text";
import { todayStr } from "../lib/date";
import Picker from "../ui/Picker";
import { AdviseSheet } from "./AiSheets";
import { summarizeAfter, harvestQty } from "../lib/metrics";
import { digestByMonth } from "../lib/monthDigest";
import { lastYearAround, compareThisYear } from "../lib/lastYear";

// ─── 作業暦（去年の今ごろ → 作物ごとの記録の流れ）─────────────────────
// 1人の農家が去年の自分と答え合わせする場所（docs/decisions/20261012-solo-learning-loop.md の ③）。
// ・先頭は「去年の今ごろ」（参考: Day One「On This Day」）。開いた瞬間に去年の同じ時期の作業と判断が出る。
//   各行に今年とのずれ（今年は◯日早い／まだ）を添える（参考: Strava の前の週との比較）
// ・作物を開くと、その作物の記録を月ごとの流れで読む（参考: Gardenize の記録の流れ）。
//   1年分を全部並べると読めないので、1件ずつ出すのは判断メモと散布だけ。ふだんの作業は月ごとに
//   「収穫 3回（計106kg）・草刈り 2回」の1行にまとめ、押したときだけ開く（lib/monthDigest.ts）。
//   上の12か月の帯を押すと、その月へ飛ぶ
// 「なぜ」は相談から記録した判断メモ（note が「判断メモ」で始まる）。判断メモには、そのあと30日に記録で
// 起きたこと（summarizeAfter）を並べる。良し悪しは言わない。散布の判定は isPesticideWorkType を通す。

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const monthOf = (r: Report) => Number(r.date.slice(5, 7));
const mdLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const isJudgment = (r: Report) => !!r.note?.trim().startsWith("判断メモ");
const AFTER_DAYS = 30;
const AROUND_DAYS = 7;
const AROUND_PREVIEW = 6;

const cardStyle = {
  backgroundColor: C.card,
  borderRadius: RADIUS.card,
  paddingHorizontal: 16,
  marginBottom: 12,
  ...SHADOW.card,
};

export default function WorkCalendarScreen() {
  const { reports, crops, pesticides, userName, cropName } = useStore();
  const today = todayStr();
  const thisYear = Number(today.slice(0, 4));

  const dataYears = Array.from(new Set(reports.map(r => Number(r.date.slice(0, 4)))))
    .filter(y => Number.isFinite(y))
    .sort((a, b) => b - a);
  const [year, setYear] = useState<number | null>(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const safeYear = year != null && dataYears.includes(year) ? year : (dataYears[0] ?? thisYear);

  const [cropId, setCropId] = useState<number | null>(null);
  const [openRoutine, setOpenRoutine] = useState<number[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const monthY = useRef<Record<number, number>>({});
  const [showAllAround, setShowAllAround] = useState(false);
  const [adviseOpen, setAdviseOpen] = useState(false);

  const crop = crops.find(c => c.id === cropId) ?? null;
  const ofCrop = (id: number, y: number) =>
    reports.filter(r => r.crop_id === id && r.date.startsWith(String(y)))
      .sort((a, b) => a.date.localeCompare(b.date));

  const pesticideNames = (r: Report): string => {
    const ids = r.pesticides_used?.length ? r.pesticides_used.map(p => p.id) : r.pesticide_id ? [r.pesticide_id] : [];
    return ids.map(id => pesticides.find(p => p.id === id)?.name).filter(Boolean).map(n => dispName(n as string)).join("、");
  };
  const workLabel = (r: Report) => {
    const pn = isPesticideWorkType(r.work_type) ? pesticideNames(r) : "";
    return `${r.work_type || "未設定"}${pn ? `（${pn}）` : ""}`;
  };

  // 判断のあと30日に記録で起きたこと（事実だけ）
  const afterLine = (r: Report) => {
    const a = summarizeAfter(reports, r.crop_id, r.date, AFTER_DAYS, isPesticideWorkType);
    const parts = [`作業${a.works}件`, `散布${a.sprays}回`, ...(a.harvestKg > 0 ? [`収穫${a.harvestKg}kg`] : [])];
    return `その後${AFTER_DAYS}日（〜${mdLabel(a.until)}）: ${parts.join("・")}`;
  };
  const noteBox = (r: Report) => {
    if (isJudgment(r)) {
      return (
        <View style={{ backgroundColor: C.well, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9, marginTop: 6 }}>
          <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 18 }}>{r.note.trim()}</Text>
          <Text style={{ fontSize: 12, color: C.ink, fontWeight: "600", marginTop: 4 }}>{afterLine(r)}</Text>
        </View>
      );
    }
    if (!r.note?.trim()) return null;
    return (
      <View style={{ backgroundColor: C.well, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9, marginTop: 6 }}>
        <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 18 }}>メモ: {r.note.trim()}</Text>
      </View>
    );
  };

  // ── A 去年の今ごろ ──
  const aroundView = () => {
    const around = lastYearAround(reports, today, AROUND_DAYS);
    const thisYearRows = reports.filter(r => r.date.startsWith(String(thisYear)));
    const shown = showAllAround ? around : around.slice(0, AROUND_PREVIEW);
    const shift = (d: number) => {
      const x = new Date(`${today}T00:00:00Z`);
      x.setUTCDate(x.getUTCDate() + d);
      return mdLabel(x.toISOString().slice(0, 10));
    };
    return (
      <View style={[cardStyle, { paddingVertical: 14 }]}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>去年の今ごろ</Text>
        <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{thisYear - 1}年 {shift(-AROUND_DAYS)}〜{shift(AROUND_DAYS)}</Text>
        {/* 1年目は去年の記録が無い。空で終わらせず、相談（一般の知識と国の防除マニュアルで答える）へ渡す。
            相談の返答は「この判断で記録する」で記録に残り、翌年からこの欄に並ぶ（docs/decisions/20261012-solo-learning-loop.md） */}
        {around.length === 0 && (
          <>
            <Text style={{ fontSize: 13, color: C.textSub, marginTop: 10 }}>去年のこの時期の記録はありません</Text>
            <Pressable onPress={() => setAdviseOpen(true)}
              style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.inkSoft }}>
              <Feather name="message-circle" size={14} color={C.ink} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink }}>この時期にやることを相談する</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 16 }}>
              相談の答えを「この判断で記録する」で残すと、来年のこの欄に並びます
            </Text>
          </>
        )}
        {shown.map((r, i) => {
          const cmp = compareThisYear(r, thisYearRows, today);
          const late = cmp.startsWith("今年はまだ");
          return (
            <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline, marginTop: i === 0 ? 8 : 0 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.text }}>{cropName(r.crop_id)} {workLabel(r)}</Text>
                <Text style={{ fontSize: 12, color: C.textMuted }}>{mdLabel(r.date)}</Text>
              </View>
              <Text style={{ fontSize: 12, color: late ? C.warning : C.textSub, fontWeight: late ? "600" : "400", marginTop: 2 }}>{cmp}</Text>
              {noteBox(r)}
            </View>
          );
        })}
        {around.length > AROUND_PREVIEW && !showAllAround && (
          <Pressable onPress={() => setShowAllAround(true)} style={{ paddingTop: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink }}>残り{around.length - AROUND_PREVIEW}件を表示</Text>
          </Pressable>
        )}
        {around.length > 0 && !around.some(isJudgment) && (
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 16 }}>
            相談の返答の「この判断で記録する」から記録すると、来年のこの欄に、なぜそうしたかとその後が並びます
          </Text>
        )}
      </View>
    );
  };

  // ── 作物の一覧（押すと B の記録の流れ） ──
  const cropList = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: C.textSub }}>作物ごとの記録の流れ</Text>
        <Pressable onPress={() => setShowYearPicker(true)} accessibilityLabel="対象年を選ぶ"
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.hairline, borderRadius: RADIUS.pill, paddingVertical: 5, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{safeYear}年</Text>
          <Feather name="chevron-down" size={14} color={C.textSub} />
        </Pressable>
      </View>
      <View style={cardStyle}>
        {crops.length === 0 && (
          <Text style={{ paddingVertical: 20, color: C.textMuted, fontSize: 13, textAlign: "center" }}>作物を登録すると、ここに作物ごとの一年が並びます</Text>
        )}
        {crops.map((c, i) => {
          const rs = ofCrop(c.id, safeYear);
          const months = new Set(rs.map(monthOf));
          const ms = [...months].sort((a, b) => a - b);
          const judgments = rs.filter(isJudgment).length;
          return (
            <Pressable key={c.id} onPress={() => { setCropId(c.id); setOpenRoutine([]); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{c.name}</Text>
                  <Text style={{ fontSize: 12, color: C.textSub }}>{ms.length === 0 ? "記録なし" : ms.length === 1 ? `${ms[0]}月` : `${ms[0]}月〜${ms[ms.length - 1]}月`}</Text>
                </View>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  作業 {rs.length}件 ・ 散布 {rs.filter(r => isPesticideWorkType(r.work_type)).length}回{judgments ? ` ・ 判断メモ ${judgments}件` : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 2, marginTop: 8 }}>
                  {MONTHS.map(m => (
                    <View key={m} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: months.has(m) ? C.ink : C.well,
                      borderWidth: safeYear === thisYear && m === Number(today.slice(5, 7)) ? 1 : 0, borderColor: C.text }} />
                  ))}
                </View>
                {/* 帯が何月かを読めるように、端と真ん中だけ月を書く */}
                <View style={{ flexDirection: "row", gap: 2, marginTop: 3 }}>
                  {MONTHS.map(m => (
                    <Text key={m} style={{ flex: 1, fontSize: 10, color: C.textMuted, textAlign: "center" }}>{m === 1 || m === 6 || m === 12 ? `${m}月` : ""}</Text>
                  ))}
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={C.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </>
  );

  // ── B 作物ごとの記録の流れ（月ごと） ──
  const isImportant = (r: Report) => isJudgment(r) || isPesticideWorkType(r.work_type);
  const dotColor = (r: Report) => (isJudgment(r) ? C.warning : C.pesticide);
  const nowMonth = safeYear === thisYear ? Number(today.slice(5, 7)) : null;
  const cropMonths = () => (crop ? digestByMonth(ofCrop(crop.id, safeYear), isImportant, harvestQty) : []);
  // 12か月の帯は画面上部に貼り付ける（月へ飛んだ先でも帯が見えるように）。ScrollView の直下の子にする
  const STRIP_H = 44;
  const monthStrip = () => {
    const has = new Set(cropMonths().map(m => m.month));
    const jump = (m: number) => {
      const y = monthY.current[m];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - STRIP_H - 8), animated: true });
    };
    return (
      <View style={{ backgroundColor: C.bg, paddingBottom: 8 }}>
        {/* 12か月の帯。記録のある月を緑、今月を枠で示し、押すとその月へ飛ぶ */}
        <View style={{ flexDirection: "row", gap: 3, height: STRIP_H - 8 }}>
          {MONTHS.map(m => (
            <Pressable key={m} onPress={() => jump(m)} disabled={!has.has(m)} accessibilityLabel={`${m}月へ`}
              style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8,
                backgroundColor: has.has(m) ? C.inkSoft : C.well,
                borderWidth: nowMonth === m ? 1.5 : 0, borderColor: C.ink }}>
              <Text style={{ fontSize: 11, fontWeight: has.has(m) ? "700" : "400", color: has.has(m) ? C.ink : C.textMuted }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };
  const timeline = () => {
    if (!crop) return null;
    const months = cropMonths();
    const row = (r: Report, dot: string | null, last: boolean) => (
      <View key={r.id} style={{ flexDirection: "row", paddingTop: 10, paddingBottom: last ? 4 : 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.hairline }}>
        <View style={{ width: 16, paddingTop: 5 }}>
          {dot && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{mdLabel(r.date)} {workLabel(r)}</Text>
            {/* 色だけに頼らず札で言う（説明を読まなくても分かるように） */}
            {isJudgment(r) && (
              <View style={{ backgroundColor: C.warningBg, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.warning }}>判断</Text>
              </View>
            )}
            {isPesticideWorkType(r.work_type) && (
              <View style={{ backgroundColor: C.pesticideBg, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.pesticide }}>散布</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {r.field || "圃場未設定"} ・ 記録: {userName(r.user_id)}{r.quantity ? ` ・ ${r.quantity}${r.quantity_unit ?? ""}` : ""}
          </Text>
          {noteBox(r)}
        </View>
      </View>
    );
    return (
      <>
        {months.length === 0 && (
          <View style={[cardStyle, { paddingVertical: 16 }]}>
            <Text style={{ fontSize: 13, color: C.textSub }}>{safeYear}年の{crop.name}の記録はありません</Text>
          </View>
        )}
        {months.map(md => {
          const open = openRoutine.includes(md.month);
          return (
            <View key={md.month} onLayout={e => { monthY.current[md.month] = e.nativeEvent.layout.y; }}
              style={[cardStyle, { paddingVertical: 12 }]}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>{md.month}月</Text>
                {nowMonth === md.month && <Text style={{ fontSize: 11, fontWeight: "700", color: C.ink }}>今月</Text>}
              </View>
              {md.important.map((r, i) => row(r, dotColor(r), i === md.important.length - 1 && !md.summary))}
              {!!md.summary && (
                <>
                  <Pressable onPress={() => setOpenRoutine(open ? openRoutine.filter(x => x !== md.month) : [...openRoutine, md.month])}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, paddingBottom: 2 }}
                    accessibilityLabel={`${md.month}月のふだんの作業を${open ? "閉じる" : "開く"}`}>
                    <Text style={{ flex: 1, fontSize: 13, color: C.textSub, lineHeight: 19 }}>{md.summary}</Text>
                    <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={C.textMuted} />
                  </Pressable>
                  {open && md.routine.map((r, i) => row(r, null, i === md.routine.length - 1))}
                </>
              )}
            </View>
          );
        })}
      </>
    );
  };

  return (
    <ScrollView ref={scrollRef} stickyHeaderIndices={crop ? [1] : undefined} style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}>
      {crop ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28, marginBottom: 10 }}>
          <Pressable onPress={() => setCropId(null)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessibilityLabel="作業暦の先頭に戻る">
            <Feather name="chevron-left" size={16} color={C.ink} />
            <Text style={{ fontSize: 14, color: C.ink, fontWeight: "600" }}>作業暦</Text>
          </Pressable>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{crop.name}</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setShowYearPicker(true)} accessibilityLabel="対象年を選ぶ"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.hairline, borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{safeYear}年</Text>
            <Feather name="chevron-down" size={14} color={C.textSub} />
          </Pressable>
        </View>
      ) : null}
      {crop ? monthStrip() : null}
      {crop ? timeline() : <>{aroundView()}{cropList}</>}
      <AdviseSheet open={adviseOpen} onClose={() => setAdviseOpen(false)} entryPoint="work_calendar" cropId={null} />
      <Picker
        open={showYearPicker}
        title="対象年"
        options={(dataYears.length ? dataYears : [safeYear]).map(y => ({ key: String(y), label: `${y}年` }))}
        value={String(safeYear)}
        onSelect={v => { setYear(Number(v)); setOpenRoutine([]); }}
        onClose={() => setShowYearPicker(false)}
      />
    </ScrollView>
  );
}
