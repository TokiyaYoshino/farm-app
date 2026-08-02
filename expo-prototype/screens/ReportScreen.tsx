import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, workTypeColor, cropColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import CalendarView from "./CalendarView";
import ReportDetailSheet from "./ReportDetailSheet";
import Picker from "../ui/Picker";
import { useStore } from "../lib/store";
import { canUseAiFeature } from "../lib/ai";
import { DailyReportSheet, SearchChatSheet, PhotoDiagnosisSheet } from "./AiSheets";
import { WORK_TEMPLATES, type Report } from "../lib/types";

// ─── 作業記録（src/App.tsx tab==="report" ブロックの移植・実データ）──────
// 表示モード切替・検索バー・フィルタチップ・記録カード・未報告リスト。
export default function ReportScreen() {
  const { reports, schedules, crops, fields, users, pesticides, cropName, userName, commentCountOf } = useStore();

  const [reportView, setReportView] = useState<"calendar" | "list">("calendar");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [query, setQuery] = useState("");
  const [filterCrop, setFilterCrop] = useState(0);
  const [filterField, setFilterField] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterUser, setFilterUser] = useState(0);
  const [pickerFor, setPickerFor] = useState<"crop" | "field" | "work" | "user" | null>(null);
  const [aiSheet, setAiSheet] = useState<"report" | "chat" | "diag" | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const filterActive = !!(query || filterCrop || filterField || filterWorkType || filterUser);
  const filtered = reports.filter(r =>
    (!query || [r.note, cropName(r.crop_id), r.field, r.work_type].join(" ").includes(query)) &&
    (!filterCrop || r.crop_id === filterCrop) &&
    (!filterField || r.field === filterField) &&
    (!filterWorkType || r.work_type === filterWorkType) &&
    (!filterUser || r.user_id === filterUser)
  );

  const scheduleTitle = (s: typeof schedules[number]) => (s.title && s.title !== s.work_type ? s.title : "");

  // 予定と実績のマッチング（Web版 matchReportToSchedule と同一の緩い判定）
  const matchReport = (s: typeof schedules[number]) =>
    reports.find(r => r.user_id === (s.assigned_user_id ?? s.user_id) && r.date === s.date) ?? null;

  const todayScheds = schedules.filter(s => s.date === todayStr);
  const unreported = schedules.filter(s => s.date < todayStr && !matchReport(s));

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

  const workers = users.filter(u => u.role !== "viewer");

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

          {/* 今日の予定 */}
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
                </View>
              );
            })}
          </View>

          {/* 未報告の作業 */}
          {unreported.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.warning, marginBottom: 8 }}>未報告の作業</Text>
              <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingHorizontal: 16 }}>
                {unreported.map((s, i) => {
                  const assignedUser = users.find(u => u.id === (s.assigned_user_id ?? s.user_id));
                  return (
                    <View key={s.id} style={{ paddingVertical: 14, borderBottomWidth: i === unreported.length - 1 ? 0 : 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
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
                    </View>
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

          {/* フィルタチップ（タップでピッカー） */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            <Pressable onPress={() => setPickerFor("crop")} style={chip(!!filterCrop)}>
              <Text style={chipText(!!filterCrop)}>作物：{filterCrop ? cropName(filterCrop) : "すべて"}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerFor("field")} style={chip(!!filterField)}>
              <Text style={chipText(!!filterField)}>圃場：{filterField || "すべて"}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerFor("work")} style={chip(!!filterWorkType)}>
              <Text style={chipText(!!filterWorkType)}>作業：{filterWorkType || "すべて"}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerFor("user")} style={chip(!!filterUser)}>
              <Text style={chipText(!!filterUser)}>担当：{filterUser ? userName(filterUser) : "すべて"}</Text>
            </Pressable>
          </ScrollView>

          {/* 件数＋クリア＋AI機能ボタン群（Web版と同一の並び） */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, minHeight: 28, gap: 8 }}>
            <Text style={{ fontSize: 12, color: C.textMuted }}>{filtered.length}件の記録</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
              {filterActive && (
                <Btn variant="tertiary" size="sm" onPress={() => { setQuery(""); setFilterCrop(0); setFilterField(""); setFilterWorkType(""); setFilterUser(0); }}>条件をクリア</Btn>
              )}
              <Btn variant="secondary" size="sm" onPress={() => setAiSheet("report")} icon={<Feather name="star" size={13} color={C.text} />}>AI日報</Btn>
              {canUseAiFeature("recordSearchChat") && (
                <Btn variant="secondary" size="sm" onPress={() => setAiSheet("chat")} icon={<Feather name="message-square" size={13} color={C.text} />}>AI検索</Btn>
              )}
              {canUseAiFeature("pestDiagnosis") && (
                <Btn variant="secondary" size="sm" onPress={() => setAiSheet("diag")} icon={<Feather name="camera" size={13} color={C.text} />}>AI画像診断</Btn>
              )}
            </ScrollView>
          </View>

          {/* 結果 */}
          {filtered.length === 0 ? (
            <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center" }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {filterActive ? "条件に一致する記録がありません" : "まだ作業報告がありません"}
              </Text>
            </View>
          ) : filtered.slice(0, 100).map(r => {
            const wc = r.work_type ? workTypeColor(r.work_type) : null;
            const meta = [
              r.quantity ? `${r.quantity}${r.quantity_unit || "kg"}` : "",
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
                </View>
              </View>
            );
          })}
        </>
      )}

      <ReportDetailSheet report={selectedReport} onClose={() => setSelectedReport(null)} />
      <DailyReportSheet open={aiSheet === "report"} onClose={() => setAiSheet(null)} />
      <SearchChatSheet open={aiSheet === "chat"} onClose={() => setAiSheet(null)} />
      <PhotoDiagnosisSheet open={aiSheet === "diag"} onClose={() => setAiSheet(null)} />

      {/* フィルタピッカー */}
      <Picker
        open={pickerFor === "crop"}
        title="作物で絞り込み"
        options={[{ key: "0", label: "すべて" }, ...crops.map(c => ({ key: String(c.id), label: c.name }))]}
        value={String(filterCrop)}
        onSelect={v => setFilterCrop(Number(v))}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "field"}
        title="圃場で絞り込み"
        options={[{ key: "", label: "すべて" }, ...fields.map(f => ({ key: f.name, label: f.name }))]}
        value={filterField}
        onSelect={setFilterField}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "work"}
        title="作業で絞り込み"
        options={[{ key: "", label: "すべて" }, ...WORK_TEMPLATES.map(t => ({ key: t, label: t }))]}
        value={filterWorkType}
        onSelect={setFilterWorkType}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "user"}
        title="担当で絞り込み"
        options={[{ key: "0", label: "すべて" }, ...workers.map(u => ({ key: String(u.id), label: u.name }))]}
        value={String(filterUser)}
        onSelect={v => setFilterUser(Number(v))}
        onClose={() => setPickerFor(null)}
      />
    </ScrollView>
  );
}
