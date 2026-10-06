import { View, Text, Pressable } from "react-native";
import Segmented, { type SegmentOption } from "./Segmented";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { C, RADIUS, workTypeColor } from "./tokens";
import { WORK_TEMPLATES } from "../lib/types";

// ─── 作業を選ぶ（記録タブとホームの「＋記録」シートで共通）──────────────
// 「作業を選ぶ → 記録 or 予定」をどこから入っても同じ手順にする。
// docs/decisions/20261004-home-declutter.md
export type EntryMode = "record" | "plan";

// 作業タイルのアイコン（MaterialCommunityIcons の既製グリフ。手描き風の線画は使わない）
const WORK_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  収穫: "basket-outline",
  施肥: "sack",
  防除: "spray-bottle",
  播種: "sprout",
  灌水: "watering-can-outline",
  草刈り: "grass",
  剪定: "content-cut",
  その他: "dots-horizontal",
};

/** 記録｜予定（｜カレンダー）の切替。開いたときは常に「記録」から始める（取り違え防止）。
 *  withCalendar は記録タブだけ。カレンダーは「自分から見にいく」もので、選ぶとタイル以下が月のカレンダーに置き換わる
 *  （ホームの＋記録シートは入れる場所なので記録｜予定の2つ） */
export type TabMode = EntryMode | "calendar";
export function EntryModeSwitch<T extends TabMode>({ mode, onChange, withCalendar = false }: { mode: T; onChange: (m: T) => void; withCalendar?: boolean }) {
  const options: SegmentOption<T>[] = [
    { key: "record" as T, label: "記録", activeColor: C.ink },
    { key: "plan" as T, label: "予定", activeColor: C.info },
    ...(withCalendar ? [{ key: "calendar" as T, label: "カレンダー", activeColor: C.text }] : []),
  ];
  return <Segmented options={options} value={mode} onChange={onChange} />;
}

/** 見出し（モードで言葉と色を変え、予定のつもりで記録する取り違えを防ぐ） */
export function entryHeading(mode: EntryMode): { text: string; color: string } {
  return mode === "plan"
    ? { text: "作業を選んで予定に入れる", color: C.info }
    : { text: "作業を選んで記録", color: C.textMuted };
}

/** 作業タイル 4列×2段。予定モードは受け皿を info の淡色にする */
export function WorkTiles({ mode, onPick }: { mode: EntryMode; onPick: (workType: string) => void }) {
  return (
    <View style={{ backgroundColor: mode === "plan" ? C.infoBg : C.well, borderRadius: RADIUS.well, padding: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {WORK_TEMPLATES.map(t => (
        <Pressable
          key={t}
          onPress={() => onPick(t)}
          accessibilityLabel={mode === "plan" ? `${t}を予定に入れる` : `${t}を記録`}
          style={({ pressed }) => ({
            width: "22.8%", flexGrow: 1, height: 74, borderRadius: RADIUS.row,
            backgroundColor: C.card, alignItems: "center", justifyContent: "center", gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <MaterialCommunityIcons name={WORK_ICON[t] ?? "dots-horizontal"} size={24} color={workTypeColor(t).fg} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}
