import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import { useStore } from "../lib/store";
import type { Project } from "../lib/types";

// ─── 計画（src/components/GanttChart.tsx の移植・実データ）──────────────
// 3ヶ月ビュー・左固定ラベル列・日付グリッド・プロジェクトバー。
// 横画面対応: 回転するとラベル列が広がり一覧性が上がる。縦では横向きのヒントを表示。
// 見やすさ: 今日へ自動スクロール・今日の縦ライン・行の縞・バータップで詳細シート。
const COL_W = 28;
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
const fmtMd = (s?: string) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : "");

export default function GanttScreen() {
  const { projects, cropName } = useStore();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // 横画面ではラベル列を広げて計画名を読み切れるように
  const labelW = isLandscape ? 220 : 132;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewStart, setViewStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const viewEnd = endOfMonth(viewStart.getFullYear(), viewStart.getMonth() + 2);
  const totalDays = diffDays(viewStart, viewEnd) + 1;
  const [detail, setDetail] = useState<Project | null>(null);

  const dayList: { day: number; isToday: boolean; isWeekend: boolean; isMonthStart: boolean }[] = [];
  const monthGroups: { label: string; count: number }[] = [];
  {
    let cur = new Date(viewStart);
    for (let i = 0; i < totalDays; i++) {
      const dow = cur.getDay();
      dayList.push({
        day: cur.getDate(),
        isToday: cur.getTime() === today.getTime(),
        isWeekend: dow === 0 || dow === 6,
        isMonthStart: cur.getDate() === 1,
      });
      const mLabel = `${cur.getFullYear()}年${cur.getMonth() + 1}月`;
      const lastM = monthGroups[monthGroups.length - 1];
      if (!lastM || lastM.label !== mLabel) monthGroups.push({ label: mLabel, count: 1 });
      else lastM.count++;
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
  }

  const activeProjects = projects.filter(p => p.status === "active");
  const todayIdx = diffDays(viewStart, today);

  // 今日が表示期間内なら、開いた時に今日が画面中央付近に来るよう自動スクロール
  const gridRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (todayIdx < 0 || todayIdx >= totalDays) return;
    const visibleW = width - labelW - 32;
    const target = Math.max(0, todayIdx * COL_W - visibleW / 3);
    const t = setTimeout(() => gridRef.current?.scrollTo({ x: target, animated: false }), 50);
    return () => clearTimeout(t);
  }, [viewStart, width, labelW]);

  const bar = (p: Project) => {
    if (!p.start_date || !p.end_date) return null;
    const startIdx = diffDays(viewStart, parseISO(p.start_date));
    const endIdx = diffDays(viewStart, parseISO(p.end_date));
    if (endIdx < 0 || startIdx >= totalDays) return null;
    const visStart = Math.max(startIdx, 0);
    const visEnd = Math.min(endIdx, totalDays - 1);
    return {
      left: visStart * COL_W + 2,
      width: (visEnd - visStart + 1) * COL_W - 4,
      color: p.color ?? "#4CAF50",
      clippedStart: startIdx < 0,
      clippedEnd: endIdx > totalDays - 1,
    };
  };

  const shiftMonth = (n: number) =>
    setViewStart(d => new Date(d.getFullYear(), d.getMonth() + n, 1));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 12 }}>
      {/* 期間ナビ */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 }}>
        <Pressable onPress={() => shiftMonth(-1)} style={{ width: 34, height: 34, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
          <Feather name="chevron-left" size={16} color={C.textSub} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontWeight: "700", fontSize: 15, color: C.text }}>
            {monthGroups[0]?.label} 〜 {monthGroups[monthGroups.length - 1]?.label}
          </Text>
          {(todayIdx < 0 || todayIdx >= totalDays) && (
            <Pressable
              onPress={() => setViewStart(new Date(today.getFullYear(), today.getMonth(), 1))}
              style={{ backgroundColor: C.inkSoft, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 }}
            >
              <Text style={{ color: C.ink, fontSize: 11, fontWeight: "700" }}>今日へ</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => shiftMonth(1)} style={{ width: 34, height: 34, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
          <Feather name="chevron-right" size={16} color={C.textSub} />
        </Pressable>
      </View>

      {/* 縦持ちのときだけ横向きのヒント */}
      {!isLandscape && activeProjects.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 16, marginBottom: 8, backgroundColor: C.infoBg, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 }}>
          <Feather name="rotate-cw" size={13} color={C.info} />
          <Text style={{ fontSize: 12, color: C.info, fontWeight: "600" }}>横向きにすると期間全体が見やすくなります</Text>
        </View>
      )}

      {activeProjects.length === 0 ? (
        <View style={{ marginHorizontal: 16, backgroundColor: C.card, borderRadius: 20, ...SHADOW.card, alignItems: "center", paddingVertical: 40, gap: 8 }}>
          <Feather name="calendar" size={28} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 13 }}>進行中の計画がありません</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 150 }}>
          <View style={{ marginHorizontal: 16, backgroundColor: C.card, borderRadius: 20, overflow: "hidden", ...SHADOW.card }}>
            <View style={{ flexDirection: "row" }}>
              {/* 左固定ラベル列 */}
              <View style={{ width: labelW, borderRightWidth: 1, borderRightColor: C.border }}>
                <View style={{ height: MONTH_H + DAY_H, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: "center", paddingHorizontal: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted }}>計画（{activeProjects.length}件）</Text>
                </View>
                {activeProjects.map((p, i) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setDetail(p)}
                    style={{ height: ROW_H, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: "center", paddingHorizontal: 10, backgroundColor: i % 2 === 1 ? C.bg : "transparent" }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: p.color ?? "#4CAF50" }} />
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: C.text, flex: 1 }}>{p.name}</Text>
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: 10, color: C.textMuted, marginTop: 2, marginLeft: 14 }}>
                      {[
                        p.crop_id ? cropName(p.crop_id) : "",
                        p.field,
                        isLandscape ? `${fmtMd(p.start_date)}〜${fmtMd(p.end_date)}` : "",
                      ].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* 右スクロールグリッド */}
              <ScrollView ref={gridRef} horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ width: totalDays * COL_W }}>
                  {/* 月ヘッダー */}
                  <View style={{ flexDirection: "row", height: MONTH_H }}>
                    {monthGroups.map(m => (
                      <View key={m.label} style={{ width: m.count * COL_W, borderBottomWidth: 1, borderBottomColor: C.border, borderRightWidth: 1.5, borderRightColor: C.hairline, justifyContent: "center", backgroundColor: C.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSub, paddingLeft: 6 }}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                  {/* 日ヘッダー */}
                  <View style={{ flexDirection: "row", height: DAY_H }}>
                    {dayList.map((d, i) => (
                      <View key={i} style={{
                        width: COL_W, alignItems: "center", justifyContent: "center",
                        borderBottomWidth: 1, borderBottomColor: C.border,
                        borderLeftWidth: d.isMonthStart && i > 0 ? 1.5 : 0, borderLeftColor: C.textMuted,
                        backgroundColor: d.isToday ? C.ink : d.isWeekend ? C.bg : "transparent",
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: d.isToday ? "800" : "400", color: d.isToday ? "#fff" : C.textMuted }}>{d.day}</Text>
                      </View>
                    ))}
                  </View>
                  {/* プロジェクト行 */}
                  {activeProjects.map((p, rowIdx) => {
                    const b = bar(p);
                    return (
                      <Pressable key={p.id} onPress={() => setDetail(p)} style={{ height: ROW_H, borderBottomWidth: 1, borderBottomColor: C.border }}>
                        <View style={{ flexDirection: "row", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                          {dayList.map((d, i) => (
                            <View key={i} style={{
                              width: COL_W,
                              backgroundColor: d.isWeekend ? C.bg : rowIdx % 2 === 1 ? "rgba(0,0,0,0.015)" : "transparent",
                              borderRightWidth: 1, borderRightColor: C.hairline,
                              borderLeftWidth: d.isMonthStart && i > 0 ? 1.5 : 0, borderLeftColor: C.textMuted,
                            }} />
                          ))}
                        </View>
                        {/* 今日の縦ライン */}
                        {todayIdx >= 0 && todayIdx < totalDays && (
                          <View style={{ position: "absolute", left: todayIdx * COL_W + COL_W / 2 - 1, top: 0, bottom: 0, width: 2, backgroundColor: C.ink, opacity: 0.35 }} />
                        )}
                        {b && (
                          <View style={{
                            position: "absolute", left: b.left, width: b.width,
                            top: ROW_H / 2 - 11, height: 22,
                            borderTopLeftRadius: b.clippedStart ? 3 : 999, borderBottomLeftRadius: b.clippedStart ? 3 : 999,
                            borderTopRightRadius: b.clippedEnd ? 3 : 999, borderBottomRightRadius: b.clippedEnd ? 3 : 999,
                            backgroundColor: b.color, justifyContent: "center",
                            shadowColor: "#101114", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
                          }}>
                            <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: "700", color: "#fff", paddingHorizontal: 8 }}>
                              {b.width > 90 ? `${p.name}（${fmtMd(p.start_date)}〜${fmtMd(p.end_date)}）` : p.name}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>

          <Text style={{ fontSize: 11, color: C.textMuted, paddingHorizontal: 16, marginTop: 10 }}>
            バーをタップすると詳細を表示します。計画の追加・編集はWeb版から行えます
          </Text>
        </ScrollView>
      )}

      {/* 計画詳細シート */}
      <BottomSheet open={!!detail} onClose={() => setDetail(null)} heightRatio={0.5}>
        {detail && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingTop: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: detail.color ?? "#4CAF50" }} />
                <Text numberOfLines={2} style={{ fontWeight: "700", fontSize: 17, color: C.text, flex: 1 }}>{detail.name}</Text>
              </View>
              <Pressable onPress={() => setDetail(null)} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={16} color={C.textSub} />
              </Pressable>
            </View>
            <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="calendar" size={14} color={C.textSub} />
                <Text style={{ fontSize: 14, color: C.text, fontWeight: "600" }}>
                  {detail.start_date} 〜 {detail.end_date}
                  {detail.start_date && detail.end_date && (
                    <Text style={{ color: C.textMuted, fontWeight: "400" }}>
                      {`（${diffDays(parseISO(detail.start_date), parseISO(detail.end_date)) + 1}日間）`}
                    </Text>
                  )}
                </Text>
              </View>
              {!!detail.crop_id && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="feather" size={14} color={C.textSub} />
                  <Text style={{ fontSize: 14, color: C.text }}>{cropName(detail.crop_id)}</Text>
                </View>
              )}
              {!!detail.field && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="map-pin" size={14} color={C.textSub} />
                  <Text style={{ fontSize: 14, color: C.text }}>{detail.field}</Text>
                </View>
              )}
              {detail.start_date && detail.end_date && (() => {
                const total = diffDays(parseISO(detail.start_date), parseISO(detail.end_date)) + 1;
                const elapsed = Math.min(total, Math.max(0, diffDays(parseISO(detail.start_date), today) + 1));
                const pct = Math.round((elapsed / total) * 100);
                return (
                  <View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 11, color: C.textMuted }}>期間の経過</Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSub }}>{pct}%</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 999, backgroundColor: C.card, overflow: "hidden" }}>
                      <View style={{ width: `${pct}%`, height: 8, backgroundColor: detail.color ?? C.ink }} />
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}
