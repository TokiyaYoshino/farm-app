import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, workTypeColor } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import CommentThread from "../ui/CommentThread";
import { useStore } from "../lib/store";
import type { Schedule } from "../lib/types";

// ─── 予定詳細シート（通知タップからの直接遷移用）──────────────────────
// CalendarView 内の予定詳細と同じ見た目の読み取り専用ビュー+コメント。
// 編集・削除はカレンダーから行う。
interface Props {
  schedule: Schedule | null;
  onClose: () => void;
}

export default function ScheduleDetailSheet({ schedule, onClose }: Props) {
  const { userName } = useStore();
  const s = schedule;
  return (
    <BottomSheet open={!!s} onClose={onClose}>
      {s && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingTop: 6 }}>
            <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>
              {userName(s.assigned_user_id ?? s.user_id)} の予定
            </Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
              <Feather name="x" size={16} color={C.textSub} />
            </Pressable>
          </View>

          <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {(() => {
                const wc = workTypeColor(s.work_type || s.title);
                return (
                  <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: wc.fg }}>{s.work_type || s.title}</Text>
                  </View>
                );
              })()}
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
              {!!s.field && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="map-pin" size={12} color={C.textSub} />
                  <Text style={{ fontSize: 12, color: C.textSub }}>{s.field}</Text>
                </View>
              )}
            </View>
            {!!s.note && (
              <View style={{ backgroundColor: C.card, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: C.textSub }}>{s.note}</Text>
              </View>
            )}
          </View>

          <CommentThread targetType="schedule" targetId={s.id} />
        </View>
      )}
    </BottomSheet>
  );
}
