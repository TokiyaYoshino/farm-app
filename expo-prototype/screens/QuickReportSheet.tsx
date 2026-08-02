import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, RADIUS, workTypeColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import BottomSheet from "../ui/BottomSheet";
import { crops, fields, users, weatherNow, TODAY, WORK_TEMPLATES } from "../mock";

// ─── クイック作業記録モーダル（src/App.tsx showQuickReport ブロックの移植）───
// Soft Widget のグループ入力: 灰 well（radius 18・padding 6）に白 row（radius 14）を積む。
// Web の <select> は RN に無いためタップでローテーション（試作のため簡略、見た目は同一）
interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QuickReportSheet({ open, onClose }: Props) {
  const [date, setDate] = useState(TODAY);
  const [cropIdx, setCropIdx] = useState(0);
  const [fieldIdx, setFieldIdx] = useState(0);
  const [workIdx, setWorkIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [userIdx, setUserIdx] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [workEnd, setWorkEnd] = useState("");
  const [note, setNote] = useState("");

  const workType = WORK_TEMPLATES[workIdx];
  const workers = users.filter(u => u.role !== "viewer");

  // Soft Widget グループ入力の row（S.wrow 相当）
  const wrow = {
    backgroundColor: C.card,
    borderRadius: RADIUS.row,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    shadowColor: "#101114",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  };
  const lbl2 = { fontSize: 11, fontWeight: "500" as const, color: C.textMuted, marginBottom: 2 };
  const fieldValue = { fontSize: 16, fontWeight: "600" as const, color: C.text };
  const lbl = { fontSize: 12, fontWeight: "600" as const, color: C.textSub, marginBottom: 5 };
  const underlineInput = {
    paddingVertical: 11,
    borderBottomWidth: 1.5,
    borderBottomColor: C.border,
    fontSize: 15,
    color: C.text,
    marginBottom: 16,
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* ヘッダー */}
      <View style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>作業を記録</Text>
        <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x" size={16} color={C.textSub} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {/* 天気（白row） */}
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, marginBottom: 12 }}>
          <View style={wrow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <Feather name="map-pin" size={11} color={C.textMuted} />
                <Text style={lbl2}>{weatherNow.place} · 天気（自動）</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="sun" size={14} color={C.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{weatherNow.label}</Text>
                </View>
                <Text style={{ color: C.border }}>|</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="thermometer" size={14} color={C.temp} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>{weatherNow.temp}°C</Text>
                </View>
                <Text style={{ color: C.border }}>|</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="droplet" size={14} color={C.info} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>{weatherNow.humidity}%</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 日付・作物/圃場・作業種別（グループ入力） */}
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, marginBottom: 12 }}>
          <View style={wrow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>日付</Text>
              <TextInput value={date} onChangeText={setDate} style={[fieldValue, { padding: 0 }]} />
            </View>
          </View>
          <View style={[wrow, { marginTop: 6 }]}>
            <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => setCropIdx(i => (i + 1) % crops.length)}>
              <Text style={lbl2}>作物</Text>
              <Text style={fieldValue}>{crops[cropIdx].name}</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: C.hairline, paddingLeft: 16 }}
              onPress={() => setFieldIdx(i => (i + 1) % fields.length)}
            >
              <Text style={lbl2}>圃場</Text>
              <Text style={fieldValue}>{fields[fieldIdx].name}</Text>
            </Pressable>
          </View>
          <Pressable style={[wrow, { marginTop: 6 }]} onPress={() => setWorkIdx(i => (i + 1) % WORK_TEMPLATES.length)}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>作業の種類</Text>
              <Text style={fieldValue}>{workType}</Text>
            </View>
            <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: workTypeColor(workType).fg }} />
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        </View>

        {/* 詳細アコーディオン */}
        <Btn
          variant="secondary"
          size="md"
          style={{ alignSelf: "stretch", marginBottom: 12, marginTop: 2 }}
          onPress={() => setExpanded(p => !p)}
          icon={<Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={C.textSub} />}
        >
          {expanded ? "詳細を閉じる" : "詳細を入力"}
        </Btn>

        {/* 写真 */}
        <Text style={lbl}>写真</Text>
        <Pressable style={{ alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 2, borderStyle: "dashed", borderColor: C.border, borderRadius: 8, paddingVertical: 20, marginBottom: 12, backgroundColor: C.bg }}>
          <Feather name="camera" size={24} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 13 }}>タップして写真を選択</Text>
        </Pressable>

        {expanded && (
          <>
            {/* 作業者 */}
            <Text style={lbl}>作業者</Text>
            <Pressable onPress={() => setUserIdx(i => (i + 1) % workers.length)} style={underlineInput}>
              <Text style={{ fontSize: 15, color: C.text }}>{workers[userIdx].name}</Text>
            </Pressable>

            {/* 実績数量 */}
            <Text style={lbl}>実績数量（kg）</Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="例: 20"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              style={underlineInput}
            />

            {/* 作業時刻 */}
            <Text style={lbl}>作業時刻</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <TextInput value={workStart} onChangeText={setWorkStart} placeholder="06:30" placeholderTextColor={C.textMuted} style={[underlineInput, { flex: 1, marginBottom: 0 }]} />
              <Text style={{ color: C.textMuted, fontSize: 13 }}>〜</Text>
              <TextInput value={workEnd} onChangeText={setWorkEnd} placeholder="08:00" placeholderTextColor={C.textMuted} style={[underlineInput, { flex: 1, marginBottom: 0 }]} />
            </View>

            {/* メモ */}
            <Text style={lbl}>メモ</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="作業の内容・気づいたこと"
              placeholderTextColor={C.textMuted}
              multiline
              style={[underlineInput, { minHeight: 60, textAlignVertical: "top" }]}
            />
          </>
        )}

        {/* 保存（primary は1画面1個） */}
        <Btn variant="primary" size="lg" onPress={onClose} icon={<Feather name="check" size={16} color="#fff" />}>
          記録する
        </Btn>
      </View>
    </BottomSheet>
  );
}
