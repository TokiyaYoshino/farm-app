import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW } from "../ui/tokens";
import { useStore } from "../lib/store";

// ─── 計画（src/components/GanttChart.tsx の移植・実データ）──────────────
// 3ヶ月ビュー・左固定ラベル列・日付グリッド・プロジェクトバー。
// 計画の追加/編集は本実装フェーズ2（チーム機能拡充）で対応予定（閲覧のみ）。
const COL_W = 28;
const LABEL_W = 150;
const ROW_H = 56;
const MONTH_H = 28;
const DAY_H = 24;

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function diffDays(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
function endOfMonth(y: number, m: number): Date {
  return new Date(y, m + 1, 0);
}

export default function GanttScreen() {
  const { projects, cropName } = useStore();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewStart, setViewStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const viewEnd = endOfMonth(viewStart.getFullYear(), viewStart.getMonth() + 2);
  const totalDays = diffDays(viewStart, viewEnd) + 1;

  const dayList: { day: number; isToday: boolean; isWeekend: boolean }[] = [];
  const monthGroups: { label: string; count: number }[] = [];
  {
    let cur = new Date(viewStart);
    for (let i = 0; i < totalDays; i++) {
      const dow = cur.getDay();
      dayList.push({
        day: cur.getDate(),
        isToday: cur.getTime() === today.getTime(),
        isWeekend: dow === 0 || dow === 6,
      });
      const mLabel = `${cur.getFullYear()}年${cur.getMonth() + 1}月`;
      const lastM = monthGroups[monthGroups.length - 1];
      if (!lastM || lastM.label !== mLabel) monthGroups.push({ label: mLabel, count: 1 });
      else lastM.count++;
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
  }

  const activeProjects = projects.filter(p => p.status === "active");

  const bar = (p: typeof projects[number]) => {
    if (!p.start_date || !p.end_date) return null;
    const startIdx = diffDays(viewStart, parseISO(p.start_date));
    const endIdx = diffDays(viewStart, parseISO(p.end_date));
    if (endIdx < 0 || startIdx >= totalDays) return null;
    const visStart = Math.max(startIdx, 0);
    const visEnd = Math.min(endIdx, totalDays - 1);
    return { left: visStart * COL_W + 2, width: (visEnd - visStart + 1) * COL_W - 4, color: p.color ?? "#4CAF50" };
  };

  const shiftMonth = (n: number) =>
    setViewStart(d => new Date(d.getFullYear(), d.getMonth() + n, 1));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 16 }}>
      {/* 期間ナビ */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 }}>
        <Pressable onPress={() => shiftMonth(-1)} style={{ width: 34, height: 34, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
          <Feather name="chevron-left" size={16} color={C.textSub} />
        </Pressable>
        <Text style={{ fontWeight: "700", fontSize: 15, color: C.text }}>
          {monthGroups[0]?.label} 〜 {monthGroups[monthGroups.length - 1]?.label}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} style={{ width: 34, height: 34, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
          <Feather name="chevron-right" size={16} color={C.textSub} />
        </Pressable>
      </View>

      {activeProjects.length === 0 ? (
        <View style={{ marginHorizontal: 16, backgroundColor: C.card, borderRadius: 20, ...SHADOW.card, alignItems: "center", paddingVertical: 40, gap: 8 }}>
          <Feather name="calendar" size={28} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 13 }}>進行中の計画がありません</Text>
        </View>
      ) : (
        <View style={{ marginHorizontal: 16, backgroundColor: C.card, borderRadius: 20, overflow: "hidden", ...SHADOW.card }}>
          <View style={{ flexDirection: "row" }}>
            {/* 左固定ラベル列 */}
            <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: C.border }}>
              <View style={{ height: MONTH_H + DAY_H, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: "center", paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted }}>計画</Text>
              </View>
              {activeProjects.map(p => (
                <View key={p.id} style={{ height: ROW_H, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: "center", paddingHorizontal: 10 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: C.text }}>{p.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                    {[p.crop_id ? cropName(p.crop_id) : "", p.field].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              ))}
            </View>

            {/* 右スクロールグリッド */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ width: totalDays * COL_W }}>
                <View style={{ flexDirection: "row", height: MONTH_H }}>
                  {monthGroups.map(m => (
                    <View key={m.label} style={{ width: m.count * COL_W, borderBottomWidth: 1, borderBottomColor: C.border, borderRightWidth: 1, borderRightColor: C.border, justifyContent: "center" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSub, paddingLeft: 6 }}>{m.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", height: DAY_H }}>
                  {dayList.map((d, i) => (
                    <View key={i} style={{ width: COL_W, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: d.isToday ? C.inkSoft : d.isWeekend ? C.bg : "transparent" }}>
                      <Text style={{ fontSize: 10, fontWeight: d.isToday ? "800" : "400", color: d.isToday ? C.ink : C.textMuted }}>{d.day}</Text>
                    </View>
                  ))}
                </View>
                {activeProjects.map(p => {
                  const b = bar(p);
                  return (
                    <View key={p.id} style={{ height: ROW_H, borderBottomWidth: 1, borderBottomColor: C.border }}>
                      <View style={{ flexDirection: "row", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                        {dayList.map((d, i) => (
                          <View key={i} style={{ width: COL_W, backgroundColor: d.isToday ? C.inkSoft : d.isWeekend ? C.bg : "transparent", borderRightWidth: 1, borderRightColor: C.hairline }} />
                        ))}
                      </View>
                      {b && (
                        <View style={{ position: "absolute", left: b.left, width: b.width, top: ROW_H / 2 - 10, height: 20, borderRadius: 999, backgroundColor: b.color, justifyContent: "center" }}>
                          <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: "700", color: "#fff", paddingHorizontal: 8 }}>{p.name}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      <Text style={{ fontSize: 11, color: C.textMuted, paddingHorizontal: 16, marginTop: 10 }}>
        計画の追加・編集はWeb版から行えます（アプリは閲覧のみ・チーム機能拡充フェーズで対応予定）
      </Text>
    </View>
  );
}
