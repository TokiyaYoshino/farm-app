import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, workTypeColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import { useStore } from "../lib/store";
import { canUseAiFeature } from "../lib/ai";
import FieldMapSheet from "./FieldMapSheet";
import { PestAdviceSheet } from "./AiSheets";

// ─── ダッシュボード（src/App.tsx tab==="home" ブロックの移植・実データ）───
interface Props {
  onGoReport: () => void;
  onQuickReport: () => void;
}

const fmtElapsed = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export default function HomeScreen({ onGoReport, onQuickReport }: Props) {
  const {
    reports, schedules, comments, wxAuto, wxLoading, weatherCoords, cropName, userName,
    workStartedAt, startWork, stopWork, refreshing, refresh,
  } = useStore();
  const [showMap, setShowMap] = useState(false);
  const [showPestAdvice, setShowPestAdvice] = useState(false);

  // 作業タイマーの経過秒（Web版 workElapsed と同一の1秒更新）
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!workStartedAt) { setElapsed(0); return; }
    const started = new Date(workStartedAt).getTime();
    setElapsed(Math.floor((Date.now() - started) / 1000));
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [workStartedAt]);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const sevenAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  // 今週の開始(日曜)
  const weekStartDate = new Date(today);
  weekStartDate.setDate(today.getDate() - today.getDay());
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  const workCount7d = reports.filter(r => r.date >= sevenAgo).length;
  const weekHarvest = reports.filter(r => r.date >= weekStart).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const todayScheds = schedules.filter(s => s.date === todayStr);

  const scheduleTitle = (s: typeof schedules[number]) => (s.title && s.title !== s.work_type ? s.title : "");

  const feed = comments.slice(0, 3).map(cm => {
    if (cm.target_type === "report") {
      const r = reports.find(x => String(x.id) === cm.target_id);
      return r ? { cm, label: `${cropName(r.crop_id)} · ${r.date}` } : null;
    }
    const sc = schedules.find(x => x.id === cm.target_id);
    return sc ? { cm, label: `${sc.work_type || sc.title} · ${sc.date}` } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ink} />}
    >
      {/* 作業セッション（Web版の「作業中」カード。作業中のみ表示） */}
      {workStartedAt && (
        <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, ...SHADOW.card }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: C.danger }} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.text, flex: 1 }}>作業中</Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] }}>
              {fmtElapsed(elapsed)}
            </Text>
            <Btn variant="secondary" size="sm" onPress={stopWork}>終了する</Btn>
          </View>
        </View>
      )}

      {/* 天気カード */}
      {!wxLoading && wxAuto && (
        <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, ...SHADOW.card }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: "700", color: C.text, lineHeight: 30 }}>{wxAuto.temp}°</Text>
              <Text style={{ fontSize: 13, color: C.textSub }}>
                {wxAuto.label}{weatherCoords?.name ? ` · ${weatherCoords.name}` : ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {wxAuto.humidity !== undefined && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="droplet" size={13} color={C.info} />
                  <Text style={{ fontSize: 12, color: C.textSub }}>{wxAuto.humidity}%</Text>
                </View>
              )}
              {wxAuto.rain !== undefined && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="cloud-rain" size={13} color={C.rain} />
                  <Text style={{ fontSize: 12, color: C.textSub }}>{wxAuto.rain}mm</Text>
                </View>
              )}
            </View>
          </View>
          {canUseAiFeature("pestControlAdvice") && (
            <Btn variant="tertiary" size="sm" style={{ alignSelf: "stretch", marginTop: 10 }}
              onPress={() => setShowPestAdvice(true)}
              icon={<Feather name="wind" size={13} color={C.textSub} />}>
              防除タイミング助言
            </Btn>
          )}
        </View>
      )}

      {/* 統計カードグリッド */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1, backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>直近7日の作業</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: C.text }}>
            {workCount7d}<Text style={{ fontSize: 12, fontWeight: "400", color: C.textMuted }}> 件</Text>
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>今週の収穫</Text>
          {weekHarvest > 0 ? (
            <Text style={{ fontSize: 22, fontWeight: "700", color: C.text }}>
              {weekHarvest}<Text style={{ fontSize: 12, fontWeight: "400", color: C.textMuted }}> kg</Text>
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: C.textMuted, paddingTop: 6 }}>記録なし</Text>
          )}
        </View>
      </View>

      {/* 今日の予定 */}
      <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, fontWeight: "500", color: C.textMuted, marginBottom: 8 }}>今日の予定</Text>
        {todayScheds.length === 0 ? (
          <View>
            <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 8 }}>予定はありません</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Btn variant="secondary" size="sm" onPress={onQuickReport} icon={<Feather name="plus" size={13} color={C.text} />}>作業を追加</Btn>
              {!workStartedAt && (
                <Btn variant="soft" size="sm" onPress={startWork} icon={<Feather name="play" size={13} color={C.ink} />}>作業を開始</Btn>
              )}
            </View>
          </View>
        ) : todayScheds.map((s, i) => {
          const wc = s.work_type ? workTypeColor(s.work_type) : null;
          return (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              {wc && (
                <View style={{ backgroundColor: wc.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: wc.fg }}>{s.work_type}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                {!!scheduleTitle(s) && (
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: C.text }}>{scheduleTitle(s)}</Text>
                )}
                {(s.crop || s.field) && (
                  <Text style={{
                    fontSize: scheduleTitle(s) ? 11 : 14,
                    fontWeight: scheduleTitle(s) ? "400" : "600",
                    color: scheduleTitle(s) ? C.textMuted : C.text,
                    marginTop: scheduleTitle(s) ? 2 : 0,
                  }}>
                    {[s.crop, s.field].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </View>
              <Btn variant="secondary" size="sm" onPress={onQuickReport} icon={<Feather name="clipboard" size={13} color={C.text} />}>実績にする</Btn>
            </View>
          );
        })}
        {todayScheds.length > 0 && !workStartedAt && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 9, marginTop: 4 }}>
            <Btn variant="soft" size="sm" onPress={startWork} icon={<Feather name="play" size={13} color={C.ink} />}>作業を開始（タイマー）</Btn>
          </View>
        )}
      </View>

      {/* 新着コメント */}
      {feed.length > 0 && (
        <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <Feather name="message-square" size={11} color={C.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: C.textMuted }}>新着コメント</Text>
          </View>
          {feed.map(({ cm, label }, i) => (
            <View key={cm.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, color: C.text }}>
                  <Text style={{ fontWeight: "700" }}>{userName(cm.user_id)}</Text>
                  <Text style={{ color: C.textSub }}>：{cm.message}</Text>
                </Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{label}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </View>
          ))}
        </View>
      )}

      {/* 記録一覧への導線 */}
      <Pressable onPress={onGoReport} style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, ...SHADOW.card, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Feather name="clipboard" size={16} color={C.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>記録一覧を見る</Text>
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{reports.length}件の作業記録</Text>
        </View>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </Pressable>

      {/* マップカード */}
      <Pressable onPress={() => setShowMap(true)} style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginTop: 4, ...SHADOW.card, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Feather name="map-pin" size={16} color={C.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>圃場マップ</Text>
        </View>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </Pressable>

      <FieldMapSheet open={showMap} onClose={() => setShowMap(false)} />
      <PestAdviceSheet open={showPestAdvice} onClose={() => setShowPestAdvice(false)} />
    </ScrollView>
  );
}
