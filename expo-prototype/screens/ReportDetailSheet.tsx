import { View, Text, Pressable, Image, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, workTypeColor } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import CommentThread from "../ui/CommentThread";
import { useStore } from "../lib/store";
import type { Report } from "../lib/types";

// ─── 記録詳細シート（src/App.tsx selectedReport ボトムシートの移植・実データ）─
interface Props {
  report: Report | null;
  onClose: () => void;
}

export default function ReportDetailSheet({ report, onClose }: Props) {
  const { currentUser, isAdmin, pesticides, cropName, userName, deleteReport } = useStore();
  const r = report;

  const confirmDelete = (id: number) => {
    Alert.alert("確認", "この作業報告を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: async () => {
        const err = await deleteReport(id);
        if (err) Alert.alert("削除に失敗しました", err);
        else onClose();
      } },
    ]);
  };

  return (
    <BottomSheet open={!!r} onClose={onClose}>
      {r && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {/* ヘッダー */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingTop: 6 }}>
            <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>{userName(r.user_id)} の作業報告</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
              <Feather name="x" size={16} color={C.textSub} />
            </Pressable>
          </View>

          {/* 詳細カード（灰well） */}
          <View style={{ backgroundColor: C.well, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {(() => {
                const wc = workTypeColor(r.work_type);
                return (
                  <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: wc.fg }}>{r.work_type}</Text>
                  </View>
                );
              })()}
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
              {r.soil_ph != null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="activity" size={12} color={C.textSub} />
                  <Text style={{ fontSize: 12, color: C.textSub }}>pH {r.soil_ph}</Text>
                </View>
              )}
            </View>

            {(r.pesticides_used?.length ? r.pesticides_used : r.pesticide_id ? [{ id: r.pesticide_id, amount: r.pesticide_amount ?? null }] : []).map(pu => (
              <View key={pu.id} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.pesticideBg, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 8, alignSelf: "flex-start" }}>
                <Feather name="droplet" size={12} color={C.pesticide} />
                <Text style={{ fontSize: 12, color: C.pesticide }}>
                  {pesticides.find(p => p.id === pu.id)?.name ?? ""}{pu.amount ? ` / ${pu.amount}` : ""}
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

            {(isAdmin || r.user_id === currentUser?.id) && (
              <Pressable onPress={() => confirmDelete(r.id)} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}>
                <Feather name="trash-2" size={12} color={C.danger} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: C.danger }}>この記録を削除</Text>
              </Pressable>
            )}
          </View>

          <CommentThread targetType="report" targetId={String(r.id)} />
        </View>
      )}
    </BottomSheet>
  );
}
