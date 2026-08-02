import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SHADOW } from "./tokens";

// ─── 選択ピッカー（Web版 <select> の RN 代替）────────────────────────
// 下からせり上がるシートに選択肢リスト。選択中は inkSoft ハイライト+チェック。
interface Option { key: string; label: string }

interface Props {
  open: boolean;
  title: string;
  options: Option[];
  value: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}

export default function Picker({ open, title, options, value, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(20,21,24,0.32)" }} onPress={onClose} />
      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        maxHeight: "70%",
        backgroundColor: C.card,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        ...SHADOW.float,
        paddingBottom: insets.bottom + 16,
      }}>
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 999, backgroundColor: C.hairline, marginTop: 8, marginBottom: 4 }} />
        <View style={{ paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700", fontSize: 15, color: C.text }}>{title}</Text>
          <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={15} color={C.textSub} />
          </Pressable>
        </View>
        <ScrollView style={{ paddingHorizontal: 10 }}>
          {options.map(o => {
            const active = o.key === value;
            return (
              <Pressable
                key={o.key}
                onPress={() => { onSelect(o.key); onClose(); }}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, marginBottom: 2,
                  backgroundColor: active ? C.inkSoft : "transparent",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: active ? "700" : "500", color: active ? C.ink : C.text }}>{o.label}</Text>
                {active && <Feather name="check" size={16} color={C.ink} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
