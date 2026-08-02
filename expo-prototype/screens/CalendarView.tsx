import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, Image, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, SHADOW, workTypeColor } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import CommentThread from "../ui/CommentThread";
import Picker from "../ui/Picker";
import { useStore } from "../lib/store";
import { WORK_TEMPLATES, type Report, type Schedule } from "../lib/types";

// ─── カレンダー（src/components/CalendarView.tsx の移植・実データ）───────
// 月/週グリッド・フィルタ/並替・日別ボトムシート・詳細ビュー・予定CRUD。
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const shortName = (name: string) => name.slice(0, 2);

type DetailItem = { kind: "report"; data: Report } | { kind: "schedule"; data: Schedule };

export default function CalendarView() {
  const {
    reports, schedules, users, crops, pesticides,
    currentUser, isAdmin, cropName, userName,
    addSchedule, updateSchedule, deleteSchedule, deleteReport,
  } = useStore();
  const currentUserId = currentUser?.id ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ assignedUserId: 0, workType: "収穫", note: "", crop: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editForm, setEditForm] = useState({ date: "", assignedUserId: 0, workType: "収穫", note: "", crop: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  const [currentFilter, setCurrentFilter] = useState<"all" | "reports" | "schedules" | "user">("all");
  const [filterUserId, setFilterUserId] = useState(0);
  const [currentSort, setCurrentSort] = useState<"date-desc" | "date-asc" | "user" | "work_type">("date-desc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [calView, setCalView] = useState<"week" | "month">("month");
  const [weekStart, setWeekStart] = useState<string>(() => {
    const d = new Date();
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((dow + 6) % 7));
    return mon.toISOString().slice(0, 10);
  });
  const [pickerFor, setPickerFor] = useState<"formWorker" | "formWork" | "formCrop" | "editWorker" | "editWork" | "editCrop" | null>(null);

  const goPrev = () => {
    if (calView === "week") {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() - 7);
      setWeekStart(d.toISOString().slice(0, 10));
    } else if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (calView === "week") {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 7);
      setWeekStart(d.toISOString().slice(0, 10));
    } else if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const weekDays = useMemo(() => {
    const days: string[] = [];
    const start = new Date(weekStart + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }, [weekStart]);

  const days = useMemo((): (string | null)[] => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const grid: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [viewYear, viewMonth]);

  const byDateR = useMemo(() => {
    const m: Record<string, Report[]> = {};
    reports.forEach(r => { (m[r.date] ??= []).push(r); });
    return m;
  }, [reports]);
  const byDateS = useMemo(() => {
    const m: Record<string, Schedule[]> = {};
    schedules.forEach(s => { (m[s.date] ??= []).push(s); });
    return m;
  }, [schedules]);

  const pesticideName = (id?: string) => (id ? pesticides.find(p => p.id === id)?.name ?? "" : "");
  const scheduleTitle = (s: Schedule) => (s.title && s.title !== s.work_type ? s.title : "");

  const closePopup = () => {
    setSelectedDate(null);
    setShowForm(false);
    setForm({ assignedUserId: 0, workType: "収穫", note: "", crop: "" });
    setAddError("");
    setDetail(null);
    setEditingSchedule(false);
  };
  const backToList = () => { setDetail(null); setEditingSchedule(false); };

  const handleAdd = async () => {
    if (!selectedDate || !form.workType) return;
    setAdding(true);
    setAddError("");
    const ok = await addSchedule(selectedDate, form.note.trim(), form.crop, form.assignedUserId || null, form.workType);
    setAdding(false);
    if (ok) {
      setForm({ assignedUserId: 0, workType: "収穫", note: "", crop: "" });
      setShowForm(false);
    } else {
      setAddError("追加に失敗しました。もう一度お試しください。");
    }
  };

  const saveEdit = async () => {
    if (detail?.kind !== "schedule" || savingEdit) return;
    setSavingEdit(true);
    const ok = await updateSchedule(detail.data.id, editForm.date, editForm.note, editForm.crop, editForm.assignedUserId || null, editForm.workType);
    setSavingEdit(false);
    if (ok) { setEditingSchedule(false); backToList(); }
  };

  const confirmDeleteReport = (id: number) => {
    Alert.alert("確認", "この作業報告を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: async () => {
        const err = await deleteReport(id);
        if (err) Alert.alert("削除に失敗しました", err);
        else backToList();
      } },
    ]);
  };
  const confirmDeleteSchedule = (id: string) => {
    Alert.alert("確認", "この予定を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: async () => {
        const err = await deleteSchedule(id);
        if (err) Alert.alert("削除に失敗しました", err);
        else backToList();
      } },
    ]);
  };

  const sortReports = (items: Report[]) => [...items].sort((a, b) => {
    switch (currentSort) {
      case "date-asc": return a.id - b.id;
      case "user": return userName(a.user_id).localeCompare(userName(b.user_id), "ja");
      case "work_type": return a.work_type.localeCompare(b.work_type, "ja");
      default: return b.id - a.id;
    }
  });
  const sortSchedules = (items: Schedule[]) => [...items].sort((a, b) => {
    switch (currentSort) {
      case "date-asc": return a.created_at.localeCompare(b.created_at);
      case "user": return userName(a.assigned_user_id ?? a.user_id).localeCompare(userName(b.assigned_user_id ?? b.user_id), "ja");
      case "work_type": return (a.work_type || a.title).localeCompare(b.work_type || b.title, "ja");
      default: return b.created_at.localeCompare(a.created_at);
    }
  });

  const baseReports = selectedDate ? (byDateR[selectedDate] ?? []) : [];
  const baseSchedules = selectedDate ? (byDateS[selectedDate] ?? []) : [];
  const dayReports = sortReports(
    currentFilter === "schedules" ? [] :
    currentFilter === "user" && filterUserId ? baseReports.filter(r => r.user_id === filterUserId) :
    baseReports
  );
  const daySchedules = sortSchedules(
    currentFilter === "reports" ? [] :
    currentFilter === "user" && filterUserId ? baseSchedules.filter(s => (s.assigned_user_id ?? s.user_id) === filterUserId) :
    baseSchedules
  );
  const isEmpty = dayReports.length === 0 && daySchedules.length === 0;

  const cellItems = (date: string | null) => {
    if (!date) return { items: [] as Array<{ type: "r" | "s"; label: string }>, extra: 0 };
    const all: Array<{ type: "r" | "s"; label: string }> = [];
    (byDateR[date] ?? []).filter(r => {
      if (currentFilter === "schedules") return false;
      if (currentFilter === "user" && filterUserId && r.user_id !== filterUserId) return false;
      return true;
    }).forEach(r => all.push({ type: "r", label: `${shortName(userName(r.user_id))} ${r.work_type}` }));
    (byDateS[date] ?? []).filter(s => {
      if (currentFilter === "reports") return false;
      if (currentFilter === "user" && filterUserId && (s.assigned_user_id ?? s.user_id) !== filterUserId) return false;
      return true;
    }).forEach(s => all.push({ type: "s", label: `${shortName(userName(s.assigned_user_id ?? s.user_id))} ${s.work_type || s.title}` }));
    return { items: all.slice(0, 2), extra: Math.max(0, all.length - 2) };
  };

  const DayCell = ({ date, minHeight }: { date: string | null; minHeight: number }) => {
    const isToday = date === today;
    const isSel = date === selectedDate;
    const dow = date ? new Date(date + "T00:00:00").getDay() : 0;
    const { items, extra } = cellItems(date);
    return (
      <Pressable
        onPress={() => date && setSelectedDate(isSel ? null : date)}
        style={{ flex: 1, backgroundColor: isSel ? C.inkSoft : C.card, minHeight, paddingTop: 4, paddingHorizontal: 2, paddingBottom: 3, overflow: "hidden" }}
      >
        {date && (
          <>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: isToday ? C.primary : "transparent", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: isToday ? "800" : "500", color: isToday ? "#fff" : dow === 0 ? C.danger : dow === 6 ? C.blue : C.text }}>
                {parseInt(date.slice(8), 10)}
              </Text>
            </View>
            {items.map((it, i) => (
              <View key={i} style={{ backgroundColor: it.type === "r" ? C.inkSoft : C.infoBg, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, marginBottom: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: "700", color: it.type === "r" ? C.ink : C.info }}>{it.label}</Text>
              </View>
            ))}
            {extra > 0 && <Text style={{ fontSize: 9, color: C.textMuted, textAlign: "center" }}>+{extra}</Text>}
          </>
        )}
      </Pressable>
    );
  };

  const filterChip = (active: boolean) => ({
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999,
    backgroundColor: active ? C.inkSoft : C.well,
  });
  const filterChipText = (active: boolean) => ({
    fontSize: 11, fontWeight: active ? "700" as const : "500" as const,
    color: active ? C.ink : C.textSub,
  });

  const formSelectRow = (label: string, value: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 16, color: value ? C.text : C.textMuted }}>{value || label}</Text>
      <Feather name="chevron-down" size={14} color={C.textMuted} />
    </Pressable>
  );

  const workers = users.filter(u => u.role !== "viewer");

  return (
    <>
      {/* ── カレンダー本体 ── */}
      <View style={{ backgroundColor: C.card, borderRadius: 20, overflow: "hidden", marginBottom: 14, ...SHADOW.card }}>
        <View style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={goPrev} style={{ width: 34, height: 34, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
            <Feather name="chevron-left" size={16} color={C.textSub} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontWeight: "700", fontSize: 15, color: C.text }}>
              {calView === "week"
                ? `${weekDays[0].slice(5).replace("-", "/")} 〜 ${weekDays[6].slice(5).replace("-", "/")}`
                : `${viewYear}年${viewMonth + 1}月`}
            </Text>
            <Pressable onPress={() => setCalView(v => v === "week" ? "month" : "week")}
              style={{ backgroundColor: C.well, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 }}>
              <Text style={{ color: C.textSub, fontSize: 11, fontWeight: "700" }}>{calView === "week" ? "週表示" : "月表示"}</Text>
            </Pressable>
          </View>
          <Pressable onPress={goNext} style={{ width: 34, height: 34, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
            <Feather name="chevron-right" size={16} color={C.textSub} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row" }}>
          {DOW.map(d => (
            <Text key={d} style={{ flex: 1, textAlign: "center", paddingVertical: 5, fontSize: 11, fontWeight: "600", letterSpacing: 1, color: C.textMuted }}>{d}</Text>
          ))}
        </View>

        {calView === "week" && (
          <View style={{ flexDirection: "row", gap: 1, backgroundColor: C.border }}>
            {weekDays.map(date => <DayCell key={date} date={date} minHeight={80} />)}
          </View>
        )}

        {calView === "month" && (
          <View style={{ gap: 1, backgroundColor: C.border }}>
            {Array.from({ length: days.length / 7 }, (_, w) => (
              <View key={w} style={{ flexDirection: "row", gap: 1 }}>
                {days.slice(w * 7, w * 7 + 7).map((date, i) => <DayCell key={i} date={date} minHeight={60} />)}
              </View>
            ))}
          </View>
        )}

        {/* フィルタ行 */}
        <View style={{ borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 10 }}>
            {(["all", "reports", "schedules", "user"] as const).map(f => {
              const label = f === "all" ? "全表示" : f === "reports" ? "報告済み" : f === "schedules" ? "予定一覧" : "担当者別";
              return (
                <Pressable key={f} onPress={() => { setCurrentFilter(f); setShowSortMenu(false); }} style={filterChip(currentFilter === f)}>
                  <Text style={filterChipText(currentFilter === f)}>{label}</Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setShowSortMenu(s => !s)} style={[filterChip(showSortMenu), { flexDirection: "row", alignItems: "center", gap: 3 }]}>
              <Feather name="repeat" size={12} color={showSortMenu ? C.ink : C.textSub} />
              <Text style={filterChipText(showSortMenu)}>並替</Text>
            </Pressable>
          </View>
          {currentFilter === "user" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 7 }} contentContainerStyle={{ paddingHorizontal: 10, gap: 5 }}>
              {[{ id: 0, name: "全員" }, ...workers].map(u => (
                <Pressable key={u.id} onPress={() => setFilterUserId(u.id)} style={filterChip(filterUserId === u.id)}>
                  <Text style={filterChipText(filterUserId === u.id)}>{u.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {showSortMenu && (
            <View style={{ paddingHorizontal: 10, paddingBottom: 7, flexDirection: "row", gap: 5, flexWrap: "wrap" }}>
              {([
                { key: "date-desc" as const, label: "新しい順" },
                { key: "date-asc" as const, label: "古い順" },
                { key: "user" as const, label: "担当者名" },
                { key: "work_type" as const, label: "作業種別" },
              ]).map(({ key, label }) => (
                <Pressable key={key} onPress={() => { setCurrentSort(key); setShowSortMenu(false); }} style={filterChip(currentSort === key)}>
                  <Text style={filterChipText(currentSort === key)}>{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ── 日別ボトムシート ── */}
      <BottomSheet open={!!selectedDate} onClose={closePopup}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {detail ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Pressable onPress={backToList} style={{ backgroundColor: C.well, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="chevron-left" size={14} color={C.textSub} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSub }}>戻る</Text>
                </Pressable>
                <Text style={{ fontWeight: "700", fontSize: 14, color: C.text, flex: 1 }}>
                  {detail.kind === "report"
                    ? `${userName(detail.data.user_id)} の作業報告`
                    : `${userName(detail.data.assigned_user_id ?? detail.data.user_id)} の予定`}
                </Text>
                {detail.kind === "schedule" && !editingSchedule && (isAdmin || detail.data.user_id === currentUserId || detail.data.assigned_user_id === currentUserId) && (
                  <Pressable
                    onPress={() => {
                      const s = detail.data;
                      setEditForm({ date: s.date, assignedUserId: s.assigned_user_id ?? 0, workType: s.work_type || s.title, note: s.note ?? "", crop: s.crop ?? "" });
                      setEditingSchedule(true);
                    }}
                    style={{ width: 32, height: 32, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}
                  >
                    <Feather name="edit-2" size={14} color={C.textMuted} />
                  </Pressable>
                )}
                <Pressable onPress={closePopup} style={{ width: 32, height: 32, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="x" size={15} color={C.textMuted} />
                </Pressable>
              </View>

              {/* 報告詳細 */}
              {detail.kind === "report" && (() => {
                const r = detail.data;
                const wc = workTypeColor(r.work_type);
                return (
                  <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: wc.fg }}>{r.work_type}</Text>
                      </View>
                      {!!r.field && (
                        <View style={{ backgroundColor: C.card, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
                          <Text style={{ fontSize: 12, color: C.textSub, fontWeight: "600" }}>{r.field}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 12, color: C.textMuted, marginLeft: "auto" }}>{r.date}</Text>
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Feather name="user" size={12} color={C.textSub} />
                        <Text style={{ fontSize: 12, color: C.textSub }}>{userName(r.user_id)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Feather name="feather" size={12} color={C.textSub} />
                        <Text style={{ fontSize: 12, color: C.textSub }}>{cropName(r.crop_id)}</Text>
                      </View>
                      {!!r.quantity && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="package" size={12} color={C.textSub} />
                          <Text style={{ fontSize: 12, color: C.textSub }}>{r.quantity}{r.quantity_unit || "kg"}</Text>
                        </View>
                      )}
                      {(r.work_start && r.work_end) ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="clock" size={12} color={C.textSub} />
                          <Text style={{ fontSize: 12, color: C.textSub }}>{r.work_start}〜{r.work_end}</Text>
                        </View>
                      ) : r.work_time ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="clock" size={12} color={C.textSub} />
                          <Text style={{ fontSize: 12, color: C.textSub }}>{r.work_time}h</Text>
                        </View>
                      ) : null}
                    </View>
                    {(r.pesticides_used?.length ? r.pesticides_used : r.pesticide_id ? [{ id: r.pesticide_id, amount: r.pesticide_amount ?? null }] : []).map(pu => (
                      <View key={pu.id} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.pesticideBg, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 8, alignSelf: "flex-start" }}>
                        <Feather name="droplet" size={12} color={C.pesticide} />
                        <Text style={{ fontSize: 12, color: C.pesticide }}>
                          {pesticideName(pu.id)}{pu.amount ? ` / ${pu.amount}` : ""}
                        </Text>
                      </View>
                    ))}
                    {!!r.weather && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <Text style={{ fontSize: 12, color: C.textMuted }}>{r.weather}{r.temp ? ` ${r.temp}°C` : ""}</Text>
                        {!!r.humidity && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Feather name="droplet" size={11} color={C.info} />
                            <Text style={{ fontSize: 12, color: C.textMuted }}>{r.humidity}%</Text>
                          </View>
                        )}
                        {!!r.rain && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Feather name="cloud-rain" size={11} color={C.rain} />
                            <Text style={{ fontSize: 12, color: C.textMuted }}>{r.rain}mm</Text>
                          </View>
                        )}
                      </View>
                    )}
                    {!!r.note && (
                      <View style={{ backgroundColor: C.card, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
                        <Text style={{ fontSize: 12, color: C.textSub }}>{r.note}</Text>
                      </View>
                    )}
                    {!!r.image_url && (
                      <Image source={{ uri: r.image_url }} style={{ width: "100%", height: 240, borderRadius: 10, marginTop: 8 }} resizeMode="cover" />
                    )}
                    {(isAdmin || r.user_id === currentUserId) && (
                      <Pressable onPress={() => confirmDeleteReport(r.id)} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}>
                        <Feather name="trash-2" size={12} color={C.danger} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.danger }}>この記録を削除</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })()}

              {/* 予定編集フォーム */}
              {detail.kind === "schedule" && editingSchedule && (
                <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  {formSelectRow("日付", editForm.date, () => setShowEditDatePicker(true))}
                  {formSelectRow("作業者（任意）", editForm.assignedUserId ? userName(editForm.assignedUserId) : "", () => setPickerFor("editWorker"))}
                  {formSelectRow("作業種別", editForm.workType, () => setPickerFor("editWork"))}
                  {formSelectRow("作物（任意）", editForm.crop, () => setPickerFor("editCrop"))}
                  <TextInput
                    placeholder="メモ（任意）"
                    placeholderTextColor={C.textMuted}
                    value={editForm.note}
                    onChangeText={v => setEditForm(f => ({ ...f, note: v }))}
                    style={{ backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, marginBottom: 10 }}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={() => setEditingSchedule(false)} style={{ flex: 1, paddingVertical: 11, borderRadius: 8, backgroundColor: C.card, alignItems: "center" }}>
                      <Text style={{ color: C.textSub, fontSize: 14, fontWeight: "700" }}>キャンセル</Text>
                    </Pressable>
                    <Pressable onPress={saveEdit} style={{ flex: 1, paddingVertical: 11, borderRadius: 8, backgroundColor: savingEdit ? C.border : C.info, alignItems: "center" }}>
                      <Text style={{ color: savingEdit ? C.textMuted : "#fff", fontSize: 14, fontWeight: "700" }}>{savingEdit ? "保存中..." : "保存"}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* 予定詳細 */}
              {detail.kind === "schedule" && !editingSchedule && (() => {
                const s = detail.data;
                const wc = workTypeColor(s.work_type || s.title);
                return (
                  <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: wc.fg }}>{s.work_type || s.title}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: C.textMuted, marginLeft: "auto" }}>{s.date}</Text>
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {!!s.assigned_user_id && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="user" size={12} color={C.textSub} />
                          <Text style={{ fontSize: 12, color: C.textSub }}>{userName(s.assigned_user_id)}</Text>
                        </View>
                      )}
                      {!!s.crop && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="feather" size={12} color={C.textSub} />
                          <Text style={{ fontSize: 12, color: C.textSub }}>{s.crop}</Text>
                        </View>
                      )}
                    </View>
                    {!!s.note && (
                      <View style={{ backgroundColor: C.card, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: C.textSub }}>{s.note}</Text>
                      </View>
                    )}
                    {(isAdmin || s.user_id === currentUserId || s.assigned_user_id === currentUserId) && (
                      <Pressable onPress={() => confirmDeleteSchedule(s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}>
                        <Feather name="trash-2" size={12} color={C.danger} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.danger }}>この予定を削除</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })()}

              <CommentThread
                targetType={detail.kind}
                targetId={detail.kind === "report" ? String(detail.data.id) : detail.data.id}
              />
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>{selectedDate}</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable
                    onPress={() => setShowForm(f => !f)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: showForm ? C.well : C.ink, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}
                  >
                    <Feather name={showForm ? "x" : "plus"} size={13} color={showForm ? C.textSub : "#fff"} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: showForm ? C.textSub : "#fff" }}>{showForm ? "キャンセル" : "予定を追加"}</Text>
                  </Pressable>
                  <Pressable onPress={closePopup} style={{ width: 32, height: 32, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={15} color={C.textMuted} />
                  </Pressable>
                </View>
              </View>

              {showForm && (
                <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSub, marginBottom: 10 }}>新しい予定</Text>
                  {formSelectRow("作業者（任意）", form.assignedUserId ? userName(form.assignedUserId) : "", () => setPickerFor("formWorker"))}
                  {formSelectRow("作業種別", form.workType, () => setPickerFor("formWork"))}
                  {formSelectRow("作物（任意）", form.crop, () => setPickerFor("formCrop"))}
                  <TextInput
                    placeholder="メモ（任意）"
                    placeholderTextColor={C.textMuted}
                    value={form.note}
                    onChangeText={v => setForm(f => ({ ...f, note: v }))}
                    style={{ backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, marginBottom: 10 }}
                  />
                  {!!addError && <Text style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>{addError}</Text>}
                  <Pressable onPress={handleAdd} style={{ paddingVertical: 11, borderRadius: 8, backgroundColor: adding ? C.border : C.info, alignItems: "center" }}>
                    <Text style={{ color: adding ? C.textMuted : "#fff", fontSize: 14, fontWeight: "700" }}>{adding ? "追加中..." : "追加する"}</Text>
                  </Pressable>
                </View>
              )}

              {dayReports.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <Feather name="clipboard" size={13} color={C.textMuted} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSub }}>作業報告 {dayReports.length}件</Text>
                  </View>
                  {dayReports.map(r => {
                    const wc = workTypeColor(r.work_type);
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setDetail({ kind: "report", data: r })}
                        style={{ backgroundColor: C.well, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 7 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                            <Text style={{ fontWeight: "700", fontSize: 11, color: wc.fg }}>{r.work_type}</Text>
                          </View>
                          {!!r.field && (
                            <View style={{ backgroundColor: C.card, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                              <Text style={{ fontSize: 11, color: C.textSub, fontWeight: "600" }}>{r.field}</Text>
                            </View>
                          )}
                          <Text style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>{cropName(r.crop_id)}</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Feather name="user" size={10} color={C.textMuted} />
                            <Text style={{ fontSize: 11, color: C.textMuted }}>{userName(r.user_id)}</Text>
                          </View>
                          {!!r.quantity && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="package" size={10} color={C.textMuted} />
                              <Text style={{ fontSize: 11, color: C.textMuted }}>{r.quantity}{r.quantity_unit || "kg"}</Text>
                            </View>
                          )}
                          {(r.work_start && r.work_end) ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="clock" size={10} color={C.textMuted} />
                              <Text style={{ fontSize: 11, color: C.textMuted }}>{r.work_start}〜{r.work_end}</Text>
                            </View>
                          ) : r.work_time ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="clock" size={10} color={C.textMuted} />
                              <Text style={{ fontSize: 11, color: C.textMuted }}>{r.work_time}h</Text>
                            </View>
                          ) : null}
                          {!!r.image_url && <Text style={{ fontSize: 11, color: C.textSub }}>📷 写真あり</Text>}
                        </View>
                        {!!r.note && (
                          <View style={{ backgroundColor: C.card, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7, marginTop: 5 }}>
                            <Text numberOfLines={1} style={{ fontSize: 11, color: C.textSub }}>{r.note}</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {daySchedules.length > 0 && (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <Feather name="calendar" size={13} color={C.textMuted} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSub }}>予定 {daySchedules.length}件</Text>
                  </View>
                  {daySchedules.map(s => {
                    const wc = workTypeColor(s.work_type || s.title);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setDetail({ kind: "schedule", data: s })}
                        style={{ backgroundColor: C.well, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 7 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                            <Text style={{ fontWeight: "700", fontSize: 11, color: wc.fg }}>{s.work_type || s.title}</Text>
                          </View>
                          {!!s.assigned_user_id && (
                            <View style={{ backgroundColor: C.card, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="user" size={10} color={C.textSub} />
                              <Text style={{ fontSize: 11, color: C.textSub, fontWeight: "600" }}>{userName(s.assigned_user_id)}</Text>
                            </View>
                          )}
                        </View>
                        {!!s.crop && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name="feather" size={10} color={C.textMuted} />
                            <Text style={{ fontSize: 11, color: C.textMuted }}>{s.crop}</Text>
                          </View>
                        )}
                        {!!s.note && <Text numberOfLines={1} style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>{s.note}</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {isEmpty && !showForm && (
                <Text style={{ textAlign: "center", paddingVertical: 24, color: C.textMuted, fontSize: 13 }}>
                  この日の記録はありません
                </Text>
              )}
            </>
          )}
        </View>
      </BottomSheet>

      {/* ピッカー群 */}
      <Picker
        open={pickerFor === "formWorker" || pickerFor === "editWorker"}
        title="作業者"
        options={[{ key: "0", label: "指定なし" }, ...workers.map(u => ({ key: String(u.id), label: u.name }))]}
        value={String(pickerFor === "editWorker" ? editForm.assignedUserId : form.assignedUserId)}
        onSelect={v => pickerFor === "editWorker"
          ? setEditForm(f => ({ ...f, assignedUserId: Number(v) }))
          : setForm(f => ({ ...f, assignedUserId: Number(v) }))}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "formWork" || pickerFor === "editWork"}
        title="作業種別"
        options={WORK_TEMPLATES.map(t => ({ key: t, label: t }))}
        value={pickerFor === "editWork" ? editForm.workType : form.workType}
        onSelect={v => pickerFor === "editWork"
          ? setEditForm(f => ({ ...f, workType: v }))
          : setForm(f => ({ ...f, workType: v }))}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "formCrop" || pickerFor === "editCrop"}
        title="作物"
        options={[{ key: "", label: "指定なし" }, ...crops.map(c => ({ key: c.name, label: c.name }))]}
        value={pickerFor === "editCrop" ? editForm.crop : form.crop}
        onSelect={v => pickerFor === "editCrop"
          ? setEditForm(f => ({ ...f, crop: v }))
          : setForm(f => ({ ...f, crop: v }))}
        onClose={() => setPickerFor(null)}
      />

      {showEditDatePicker && (
        <DateTimePicker
          value={new Date((editForm.date || today) + "T00:00:00")}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            setShowEditDatePicker(false);
            if (event.type === "dismissed" || !selected) return;
            setEditForm(f => ({ ...f, date: selected.toISOString().slice(0, 10) }));
          }}
        />
      )}
    </>
  );
}
