import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "./tokens";

// ─── ケバブ（⋮）ドロップダウンメニュー（src/ui/RowMenu.tsx の移植）───────
// 開閉は親の openId/setOpenId で制御（画面全体タップで閉じる挙動を親が持つ）。
export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  menuKey: string;
  openId: string | null;
  setOpenId: (v: string | null) => void;
  items: RowMenuItem[];
}

export default function RowMenu({ menuKey, openId, setOpenId, items }: Props) {
  const open = openId === menuKey;
  return (
    <View style={{ position: "relative", zIndex: open ? 50 : undefined }}>
      <Pressable
        onPress={() => setOpenId(open ? null : menuKey)}
        style={{ paddingVertical: 2, paddingHorizontal: 4, borderRadius: 6 }}
      >
        <Feather name="more-vertical" size={16} color={C.textMuted} />
      </Pressable>
      {open && (
        <View style={{
          position: "absolute", right: 0, top: "100%",
          backgroundColor: C.card, borderRadius: 8,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
          borderWidth: 1, borderColor: C.border, zIndex: 50, minWidth: 120, overflow: "hidden",
        }}>
          {items.map((it, i) => (
            <Pressable
              key={i}
              onPress={() => { setOpenId(null); it.onClick(); }}
              style={{ paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              {it.icon}
              <Text style={{ color: it.danger ? C.danger : C.text, fontSize: 13, fontWeight: "600" }}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
