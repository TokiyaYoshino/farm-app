import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Platform, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, RADIUS, workTypeColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import BottomSheet from "../ui/BottomSheet";
import Picker from "../ui/Picker";
import { useStore } from "../lib/store";
import { WORK_TEMPLATES } from "../lib/types";
import { toDateStr } from "../lib/date";

// ─── 予定を入れる（作業記録とは別の入口）─────────────────────────
// これまで予定の登録は「記録タブ → 見返す → カレンダー → 日付 → 予定を追加」の奥にしか無く、
// ホームの予定カードの「作業を追加」は作業記録を開いていた（予定と記録が分けられない）。
// 保存は CalendarView と同じ store.addSchedule。docs/decisions/20261004-home-declutter.md
interface Props {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
  initialWorkType?: string;
}

export default function ScheduleAddSheet({ open, onClose, initialDate, initialWorkType }: Props) {
  const { addSchedule, crops, fields, users, userName } = useStore();
  const [date, setDate] = useState(() => initialDate ?? toDateStr(new Date()));
  const [workType, setWorkType] = useState("収穫");
  const [crop, setCrop] = useState("");
  const [field, setField] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(0);
  const [note, setNote] = useState("");
  const [pickerFor, setPickerFor] = useState<"work" | "crop" | "field" | "worker" | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? toDateStr(new Date()));
    setWorkType(initialWorkType ?? "収穫"); setCrop(""); setField(""); setAssignedUserId(0); setNote("");
  }, [open, initialDate, initialWorkType]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await addSchedule(date, note.trim(), crop, assignedUserId || null, workType, field || undefined);
    setSaving(false);
    if (!ok) { Alert.alert("予定を追加できませんでした", "もう一度お試しください。"); return; }
    onClose();
  };

  const wrow = {
    backgroundColor: C.card, borderRadius: RADIUS.row,
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: "row" as const, alignItems: "center" as const, gap: 12,
  };
  const lbl2 = { fontSize: 11, fontWeight: "500" as const, color: C.textMuted, marginBottom: 2 };
  const fieldValue = { fontSize: 16, fontWeight: "600" as const, color: C.text };
  const workers = users.filter(u => u.role !== "viewer");

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.8}>
      <View style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>新しい予定</Text>
        <Pressable onPress={onClose} accessibilityLabel="閉じる" style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x" size={16} color={C.textSub} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, marginBottom: 12, gap: 6 }}>
          <Pressable style={wrow} onPress={() => setShowDate(true)}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>日付</Text>
              <Text style={fieldValue}>{date}</Text>
            </View>
            <Feather name="calendar" size={16} color={C.textMuted} />
          </Pressable>
          <Pressable style={wrow} onPress={() => setPickerFor("work")}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>作業の種類</Text>
              <Text style={fieldValue}>{workType}</Text>
            </View>
            <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: workTypeColor(workType).fg }} />
            <Feather name="chevron-right" size={16} color={C.textMuted} />
          </Pressable>
          <View style={wrow}>
            <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => setPickerFor("crop")}>
              <Text style={lbl2}>作物（任意）</Text>
              <Text style={[fieldValue, !crop && { color: C.textMuted }]}>{crop || "選択"}</Text>
            </Pressable>
            <Pressable style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: C.hairline, paddingLeft: 16 }} onPress={() => setPickerFor("field")}>
              <Text style={lbl2}>圃場（任意）</Text>
              <Text style={[fieldValue, !field && { color: C.textMuted }]}>{field || "選択"}</Text>
            </Pressable>
          </View>
          <Pressable style={wrow} onPress={() => setPickerFor("worker")}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>担当（任意）</Text>
              <Text style={[fieldValue, !assignedUserId && { color: C.textMuted }]}>{assignedUserId ? userName(assignedUserId) : "選択"}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={C.textMuted} />
          </Pressable>
        </View>

        <TextInput
          placeholder="メモ（任意）"
          placeholderTextColor={C.textMuted}
          value={note}
          onChangeText={setNote}
          style={{ paddingVertical: 11, borderBottomWidth: 1.5, borderBottomColor: C.hairline, fontSize: 15, color: C.text, marginBottom: 20 }}
        />

        <Btn variant="primary" size="lg" onPress={save} style={{ alignSelf: "stretch" }}
          icon={<Feather name="check" size={16} color="#fff" />}>
          {saving ? "追加中..." : "予定に追加する"}
        </Btn>
      </View>

      <Picker open={pickerFor === "work"} title="作業の種類" value={workType}
        options={WORK_TEMPLATES.map(t => ({ key: t, label: t }))}
        onSelect={setWorkType} onClose={() => setPickerFor(null)} />
      <Picker open={pickerFor === "crop"} title="作物" value={crop}
        options={[{ key: "", label: "指定しない" }, ...crops.map(c => ({ key: c.name, label: c.name }))]}
        onSelect={setCrop} onClose={() => setPickerFor(null)} />
      <Picker open={pickerFor === "field"} title="圃場" value={field}
        options={[{ key: "", label: "指定しない" }, ...fields.map(f => ({ key: f.name, label: f.name }))]}
        onSelect={setField} onClose={() => setPickerFor(null)} />
      <Picker open={pickerFor === "worker"} title="担当" value={String(assignedUserId)}
        options={[{ key: "0", label: "指定しない" }, ...workers.map(u => ({ key: String(u.id), label: u.name }))]}
        onSelect={v => setAssignedUserId(Number(v))} onClose={() => setPickerFor(null)} />

      {showDate && (
        <DateTimePicker
          value={new Date(date + "T00:00:00")}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            setShowDate(false);
            if (event.type === "dismissed" || !selected) return;
            setDate(toDateStr(selected));
          }}
        />
      )}
    </BottomSheet>
  );
}
