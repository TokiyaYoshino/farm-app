import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, workTypeColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import {
  reports, schedules, comments, weatherNow, TODAY,
  cropName, userName, scheduleTitle,
} from "../mock";

// ─── ダッシュボード（src/App.tsx tab==="home" ブロックの移植）──────────
// カード構成・余白・フォントサイズは Web 版の値をそのまま使用
export default function HomeScreen() {
  const sevenAgo = "2026-07-25";
  const weekStart = "2026-07-27";
  const workCount7d = reports.filter(r => r.date >= sevenAgo).length;
  const weekHarvest = reports.filter(r => r.date >= weekStart).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const todayScheds = schedules.filter(s => s.date === TODAY);

  const feed = comments.slice(0, 3).map(cm => {
    if (cm.target_type === "report") {
      const r = reports.find(x => String(x.id) === cm.target_id);
      return r ? { cm, label: `${cropName(r.crop_id)} · ${r.date}` } : null;
    }
    const sc = schedules.find(x => x.id === cm.target_id);
    return sc ? { cm, label: `${sc.work_type || sc.title} · ${sc.date}` } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}>
      {/* 天気カード */}
      <View style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, ...SHADOW.card }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 30, fontWeight: "700", color: C.text, lineHeight: 30 }}>{weatherNow.temp}°</Text>
            <Text style={{ fontSize: 13, color: C.textSub }}>{weatherNow.label} · {weatherNow.place}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="droplet" size={13} color={C.info} />
              <Text style={{ fontSize: 12, color: C.textSub }}>{weatherNow.humidity}%</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="cloud-rain" size={13} color={C.rain} />
              <Text style={{ fontSize: 12, color: C.textSub }}>{weatherNow.rain}mm</Text>
            </View>
          </View>
        </View>
        <Btn variant="tertiary" size="sm" style={{ marginTop: 10 }} icon={<Feather name="wind" size={13} color={C.textSub} />}>
          防除タイミング助言
        </Btn>
      </View>

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
            <Btn variant="secondary" size="sm" icon={<Feather name="plus" size={13} color={C.text} />}>作業を追加</Btn>
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
              <Btn variant="secondary" size="sm" icon={<Feather name="clipboard" size={13} color={C.text} />}>実績にする</Btn>
            </View>
          );
        })}
      </View>

      {/* 新着コメント */}
      {feed.length > 0 && (
        <View style={{ backgroundColor: C.card, ...SHADOW.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <Feather name="message-square" size={11} color={C.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: C.textMuted }}>新着コメント</Text>
          </View>
          {feed.map(({ cm, label }, i) => (
            <Pressable key={cm.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, color: C.text }}>
                  <Text style={{ fontWeight: "700" }}>{userName(cm.user_id)}</Text>
                  <Text style={{ color: C.textSub }}>：{cm.message}</Text>
                </Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{label}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {/* 記録一覧への導線 */}
      <Pressable style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, ...SHADOW.card, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Feather name="clipboard" size={16} color={C.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>記録一覧を見る</Text>
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{reports.length}件の作業記録</Text>
        </View>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </Pressable>

      {/* マップカード */}
      <Pressable style={{ backgroundColor: C.card, borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 16, marginTop: 4, ...SHADOW.card, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Feather name="map-pin" size={16} color={C.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>圃場マップ</Text>
        </View>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </Pressable>
    </ScrollView>
  );
}
