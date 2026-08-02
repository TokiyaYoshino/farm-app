import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, Alert, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, RADIUS, workTypeColor } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import CommentThread from "../ui/CommentThread";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { canUseAiFeature, diagnoseImageApi, saveAiOutput, type DiagnosisResult } from "../lib/ai";
import type { Report } from "../lib/types";

// ─── 記録詳細シート（src/App.tsx selectedReport ボトムシートの移植・実データ）─
interface Props {
  report: Report | null;
  onClose: () => void;
}

export default function ReportDetailSheet({ report, onClose }: Props) {
  const { currentUser, isAdmin, pesticides, cropName, userName, deleteReport } = useStore();
  const r = report;

  // ── AI画像診断（Web版と同一: 保存済み結果を ai_outputs から復元） ──
  const [diagResult, setDiagResult] = useState<DiagnosisResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState("");

  useEffect(() => {
    setDiagResult(null); setDiagError(""); setDiagLoading(false);
    const reportId = report?.id;
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ai_outputs")
        .select("output_json")
        .eq("kind", "diagnosis")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false })
        .limit(1);
      const saved = data?.[0]?.output_json as DiagnosisResult | undefined;
      if (!cancelled && saved) setDiagResult(saved);
    })();
    return () => { cancelled = true; };
  }, [report?.id]);

  const runDiagnosis = async () => {
    if (!r?.image_url || diagLoading) return;
    setDiagLoading(true); setDiagError("");
    const res = await diagnoseImageApi(r.image_url, cropName(r.crop_id));
    if (res.ok) {
      setDiagResult(res.data.diagnosis);
      void saveAiOutput(currentUser?.organization_id ?? null, currentUser?.id ?? null, "diagnosis", {
        reportId: r.id, targetDate: r.date, field: r.field, cropId: r.crop_id,
        inputSummary: `写真:${r.image_url} / 作物:${cropName(r.crop_id)}`,
        outputJson: res.data.diagnosis, usage: res.data.usage, costUsd: res.data.costUsd,
      });
    } else {
      setDiagError(res.error);
    }
    setDiagLoading(false);
  };

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
              <>
                <Image source={{ uri: r.image_url }} style={{ width: "100%", height: 240, borderRadius: 10, marginTop: 8 }} resizeMode="cover" />
                {canUseAiFeature("pestDiagnosis") && (
                  <Pressable
                    onPress={runDiagnosis}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 9, borderRadius: 999, backgroundColor: C.card }}
                  >
                    {diagLoading
                      ? <ActivityIndicator size="small" color={C.ink} />
                      : <Feather name="search" size={13} color={C.ink} />}
                    <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink }}>
                      {diagLoading ? "診断中..." : diagResult ? "もう一度AI診断" : "この写真をAI診断"}
                    </Text>
                  </Pressable>
                )}
                {!!diagError && <Text style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>{diagError}</Text>}
                {diagResult && (
                  <View style={{ backgroundColor: C.card, borderRadius: RADIUS.row, padding: 12, marginTop: 8, gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSub }}>AI画像診断（推定・確定診断ではありません）</Text>
                    {diagResult.inconclusive ? (
                      <Text style={{ fontSize: 12, color: C.textSub }}>この写真からは判断できませんでした。{diagResult.note}</Text>
                    ) : (
                      diagResult.possibilities.map((p, i) => (
                        <View key={i}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{p.name}</Text>
                            <View style={{ backgroundColor: C.pesticideBg, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7 }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: C.pesticide }}>{p.category}</Text>
                            </View>
                            <Text style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>確信度 {p.confidence}%</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 2 }}>{p.reason}</Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </>
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
