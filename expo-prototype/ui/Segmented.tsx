import { View, Text, Pressable } from "react-native";
import { C, RADIUS } from "./tokens";

// ─── 切替（灰の受け皿に白いピルが浮く）─────────────────────────
// 記録タブの「記録｜予定｜カレンダー」と、分析・管理のサブタブで同じ見た目にする
// （オーナー 2026-10-04「記録の切り替えがかなりいい。分析も管理も同じデザインに」）。
// 選んだ項目の文字色は項目ごとに渡せる（記録=緑・予定=青のように意味で色を変える場合）。
export interface SegmentOption<T extends string> { key: T; label: string; activeColor?: string }

export default function Segmented<T extends string>({ options, value, onChange }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: C.well, borderRadius: RADIUS.pill, padding: 3 }}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center",
              backgroundColor: on ? C.card : "transparent",
              shadowColor: "#101114", shadowOffset: { width: 0, height: 1 }, shadowOpacity: on ? 0.08 : 0, shadowRadius: 3, elevation: on ? 1 : 0,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: on ? "700" : "500", color: on ? (o.activeColor ?? C.ink) : C.textSub }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
