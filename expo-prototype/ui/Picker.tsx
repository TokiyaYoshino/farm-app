import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, Animated, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SHADOW } from "./tokens";

// ─── 選択ピッカー（Web版 <select> の RN 代替）────────────────────────
// BottomSheet と同じく、オーバーレイはフェード・シートだけスライドさせる
// （Modal の animationType="slide" は暗幕ごと引っ張られて見えるため）。
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
  const { height: winH } = useWindowDimensions();
  const [visible, setVisible] = useState(open);
  const slide = useRef(new Animated.Value(winH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    } else if (visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: winH, duration: 200, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }
  }, [open]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(20,21,24,0.32)", opacity: fade }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        maxHeight: "70%",
        backgroundColor: C.card,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        ...SHADOW.float,
        paddingBottom: insets.bottom + 16,
        transform: [{ translateY: slide }],
      }}>
        <Pressable onPress={onClose} style={{ alignItems: "center", paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.hairline }} />
        </Pressable>
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
      </Animated.View>
    </Modal>
  );
}
