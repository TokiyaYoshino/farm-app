import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, RADIUS } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import { useStore } from "../lib/store";
import type { Comment } from "../lib/types";

// ─── 通知一覧シート（src/App.tsx の通知ボトムシートの移植）───────────────
// 自分宛 = @自分名のメンション / 自分の記録・予定へのコメント（自分の投稿は除外）。
// 通知の抽出は lib/store.tsx の myNotifs に集約。
interface Props {
  open: boolean;
  onClose: () => void;
  onOpenTarget: (cm: Comment) => void;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function NotificationsSheet({ open, onClose, onOpenTarget }: Props) {
  const { myNotifs, notifSeenAt, userName, reports, schedules, cropName, currentUser } = useStore();

  const label = (cm: Comment): string => {
    if (cm.target_type === "report") {
      const r = reports.find(x => String(x.id) === cm.target_id);
      return r ? `${cropName(r.crop_id)} · ${r.date} の記録` : "作業記録";
    }
    const sc = schedules.find(x => x.id === cm.target_id);
    return sc ? `${sc.work_type || sc.title} · ${sc.date} の予定` : "予定";
  };

  const isMention = (cm: Comment) =>
    currentUser ? cm.message.includes(`@${currentUser.name}`) : false;

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.75}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="bell" size={16} color={C.text} />
            <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>通知</Text>
          </View>
          <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={16} color={C.textSub} />
          </Pressable>
        </View>

        {myNotifs.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
            <Feather name="bell-off" size={28} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textMuted }}>通知はありません</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card }}>
            {myNotifs.slice(0, 50).map((cm, i) => {
              const unread = !notifSeenAt || cm.created_at > notifSeenAt;
              return (
                <Pressable
                  key={cm.id}
                  onPress={() => { onClose(); onOpenTarget(cm); }}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: unread ? C.ink : "transparent", marginTop: 6 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      {isMention(cm) && (
                        <View style={{ backgroundColor: C.inkSoft, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: C.ink }}>メンション</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 11, color: C.textMuted }}>{fmtTime(cm.created_at)}</Text>
                    </View>
                    <Text numberOfLines={2} style={{ fontSize: 13, color: C.text, lineHeight: 19 }}>
                      <Text style={{ fontWeight: "700" }}>{userName(cm.user_id)}</Text>
                      <Text style={{ color: C.textSub }}>：{cm.message}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{label(cm)}</Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginTop: 8 }} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
