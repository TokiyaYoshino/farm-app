import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, workTypeColor, cropColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import CalendarView from "./CalendarView";
import ReportDetailSheet from "./ReportDetailSheet";
import {
  reports, schedules, crops, fields, users, pesticides, TODAY,
  cropName, userName, commentCountOf, scheduleTitle, WORK_TEMPLATES,
  type Report,
} from "../mock";

// ─── 作業記録（src/App.tsx tab==="report" ブロックの移植）──────────────
// 表示モード切替・検索バー・フィルタチップ・記録カードの構成は Web 版と同一。
// フィルタチップは Web の <select> の代わりにタップでローテーション（試作のため簡略、見た目は同一）
export default function ReportScreen() {
  const [reportView, setReportView] = useState<"calendar" | "list">("list");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [query, setQuery] = useState("");
  const [filterCrop, setFilterCrop] = useState(0);
  const [filterField, setFilterField] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterUser, setFilterUser] = useState(0);

  const filterActive = !!(query || filterCrop || filterField || filterWorkType || filterUser);
  const filtered = reports.filter(r =>
    (!query || [r.note, cropName(r.crop_id), r.field, r.work_type].join(" ").includes(query)) &&
    (!filterCrop || r.crop_id === filterCrop) &&
    (!filterField || r.field === filterField) &&
    (!filterWorkType || r.work_type === filterWorkType) &&
    (!filterUser || r.user_id === filterUser)
  );

  const cycleCrop = () => setFilterCrop(p => {
    const ids = [0, ...crops.map(c => c.id)];
    return ids[(ids.indexOf(p) + 1) % ids.length];
  });
  const cycleField = () => setFilterField(p => {
    const names = ["", ...fields.map(f => f.name)];
    return names[(names.indexOf(p) + 1) % names.length];
  });
  const cycleWorkType = () => setFilterWorkType(p => {
    const types = ["", ...WORK_TEMPLATES];
    return types[(types.indexOf(p) + 1) % types.length];
  });
  const cycleUser = () => setFilterUser(p => {
    const ids = [0, ...users.filter(u => u.role !== "viewer").map(u => u.id)];
    return ids[(ids.indexOf(p) + 1) % ids.length];
  });

  const chip = (active: boolean) => ({
    backgroundColor: active ? C.inkSoft : C.well,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  });
  const chipText = (active: boolean) => ({
    fontSize: 12,
    fontWeight: "600" as const,
    color: active ? C.ink : C.textSub,
  });

  const todayScheds = schedules.filter(s => s.date === TODAY);
  const unreported = schedules.filter(s =>
    s.date < TODAY && !reports.some(r => r.user_id === (s.assigned_user_id ?? s.user_id) && r.date === s.date)
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}>
      {/* 表示モード切替 */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        {([["calendar", "カレンダー", "calendar"], ["list", "記録一覧", "search"]] as const).map(([key, label, icon]) => (
          <Pressable
            key={key}
            onPress={() => setReportView(key)}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              paddingVertical: 10, borderRadius: 8, borderWidth: 1.5,
              borderColor: reportView === key ? C.primary : C.border,
              backgroundColor: reportView === key ? C.primary : C.card,
            }}
          >
            <Feather name={icon} size={15} color={reportView === key ? "#fff" : C.textSub} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: reportView === key ? "#fff" : C.textSub }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {reportView === "calendar" && (
        <>
          <CalendarView />

          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 8, letterSpacing: 0.4, textTransform: "uppercase" }}>今日の予定</Text>
            {todayScheds.length === 0 ? (
              <View style={{ paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card }}>
                <Text style={{ fontSize: 13, color: C.textMuted }}>今日の予定はありません</Text>
              </View>
            ) : todayScheds.map(s => {
              const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
              const meta = [s.crop, s.field, assignedUser?.name].filter(Boolean).join(" · ");
              const wc = s.work_type ? workTypeColor(s.work_type) : null;
              return (
                <View key={s.id} style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {wc && (
                    <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: wc.fg }}>{s.work_type}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {!!scheduleTitle(s) && <Text style={{ fontWeight: "600", fontSize: 14, color: C.text }}>{scheduleTitle(s)}</Text>}
                    {!!meta && (
                      <Text style={{
                        fontSize: scheduleTitle(s) ? 12 : 14,
                        fontWeight: scheduleTitle(s) ? "400" : "600",
                        color: scheduleTitle(s) ? C.textMuted : C.text,
                        marginTop: scheduleTitle(s) ? 3 : 0,
                      }}>{meta}</Text>
                    )}
                  </View>
                  <Btn variant="secondary" size="sm" icon={<Feather name="clipboard" size={13} color={C.text} />}>実績にする</Btn>
                </View>
              );
            })}
          </View>

          {unreported.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.warning, marginBottom: 8 }}>未報告の作業</Text>
              <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingHorizontal: 16 }}>
                {unreported.map((s, i) => {
                  const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                  return (
                    <Pressable key={s.id} style={{ paddingVertical: 14, borderBottomWidth: i === unreported.length - 1 ? 0 : 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 13, color: C.text, flex: 1 }}>{scheduleTitle(s) || s.work_type}</Text>
                          {commentCountOf("schedule", s.id) > 0 && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="message-square" size={11} color={C.ink} />
                              <Text style={{ fontSize: 11, fontWeight: "600", color: C.ink }}>{commentCountOf("schedule", s.id)}</Text>
                            </View>
                          )}
                          <Text style={{ fontSize: 11, fontWeight: "600", color: C.warning }}>未報告</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>
                          {[s.date, s.crop, assignedUser?.name].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={C.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {reportView === "list" && (
        <>
          {/* 検索バー */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10 }}>
            <Feather name="search" size={16} color={C.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="メモ・作物・圃場・作業で検索"
              placeholderTextColor={C.textMuted}
              style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.text, padding: 0 }}
            />
            {!!query && (
              <Pressable onPress={() => setQuery("")}>
                <Feather name="x" size={15} color={C.textMuted} />
              </Pressable>
            )}
          </View>

          {/* フィルタチップ */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            <Pressable onPress={cycleCrop} style={chip(!!filterCrop)}>
              <Text style={chipText(!!filterCrop)}>作物：{filterCrop ? cropName(filterCrop) : "すべて"}</Text>
            </Pressable>
            <Pressable onPress={cycleField} style={chip(!!filterField)}>
              <Text style={chipText(!!filterField)}>圃場：{filterField || "すべて"}</Text>
            </Pressable>
            <Pressable onPress={cycleWorkType} style={chip(!!filterWorkType)}>
              <Text style={chipText(!!filterWorkType)}>作業：{filterWorkType || "すべて"}</Text>
            </Pressable>
            <Pressable onPress={cycleUser} style={chip(!!filterUser)}>
              <Text style={chipText(!!filterUser)}>担当：{filterUser ? userName(filterUser) : "すべて"}</Text>
            </Pressable>
          </ScrollView>

          {/* 件数＋クリア＋帳票出力 */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, minHeight: 28, gap: 8 }}>
            <Text style={{ fontSize: 12, color: C.textMuted }}>{filtered.length}件の記録</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
              {filterActive && (
                <Btn variant="tertiary" size="sm" onPress={() => { setQuery(""); setFilterCrop(0); setFilterField(""); setFilterWorkType(""); setFilterUser(0); }}>条件をクリア</Btn>
              )}
              <Btn variant="secondary" size="sm" icon={<Feather name="star" size={13} color={C.text} />}>AI日報</Btn>
              <Btn variant="secondary" size="sm" icon={<Feather name="message-square" size={13} color={C.text} />}>AI検索</Btn>
              <Btn variant="secondary" size="sm" icon={<Feather name="download" size={13} color={C.text} />}>帳票出力</Btn>
            </ScrollView>
          </View>

          {/* 結果 */}
          {filtered.length === 0 ? (
            <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center" }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {filterActive ? "条件に一致する記録がありません" : "まだ作業報告がありません"}
              </Text>
            </View>
          ) : filtered.map(r => {
            const wc = r.work_type ? workTypeColor(r.work_type) : null;
            const meta = [
              r.quantity ? `${r.quantity}kg` : "",
              (r.work_start && r.work_end) ? `${r.work_start}〜${r.work_end}` : r.work_time ? `${r.work_time}h` : "",
              r.pesticide_id ? (pesticides.find(p => p.id === r.pesticide_id)?.name ?? "") : "",
              userName(r.user_id),
              r.weather ? `${r.weather}${r.temp ? ` ${r.temp}°C` : ""}` : "",
            ].filter(Boolean).join("  ·  ");
            return (
              <View key={r.id} style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, ...SHADOW.card }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: cropColor(r.crop_id) }} />
                    <Text style={{ fontWeight: "700", fontSize: 14, color: C.text }}>{cropName(r.crop_id)}</Text>
                    {!!r.field && <Text numberOfLines={1} style={{ fontSize: 12, color: C.textMuted }}>· {r.field}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {wc && (
                      <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: wc.fg }}>{r.work_type}</Text>
                      </View>
                    )}
                    {commentCountOf("report", r.id) > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.inkSoft, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 }}>
                        <Feather name="message-square" size={11} color={C.ink} />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: C.ink }}>{commentCountOf("report", r.id)}</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 11, color: C.textMuted }}>{r.date}</Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: C.border, marginTop: 8, marginBottom: 12 }} />
                <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{meta}</Text>
                {!!r.note && (
                  <View style={{ marginTop: 8, borderLeftWidth: 2, borderLeftColor: C.border, paddingLeft: 10 }}>
                    <Text style={{ fontSize: 12, color: C.textSub }}>{r.note}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Btn variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setSelectedReport(r)}>詳細を見る</Btn>
                  <Btn variant="soft" size="sm" style={{ flex: 1 }} icon={<Feather name="copy" size={12} color={C.ink} />}>コピーして作成</Btn>
                </View>
              </View>
            );
          })}
        </>
      )}
      <ReportDetailSheet report={selectedReport} onClose={() => setSelectedReport(null)} />
    </ScrollView>
  );
}
