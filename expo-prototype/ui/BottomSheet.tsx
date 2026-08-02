import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, View, ScrollView, Animated, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SHADOW } from "./tokens";

interface Props {
  open: boolean;
  onClose: () => void;
  heightRatio?: number; // Web版の height="75vh" 相当
  children: ReactNode;
}

// src/ui/BottomSheet.tsx の RN 版。上角24の丸み・float影・下からのシート。
// Modal の animationType="slide" はオーバーレイごと画面全体をスライドさせて
// しまう（暗幕がシートと一緒に引っ張られて見える）ため、オーバーレイは
// フェード・シートだけ Animated でスライドさせる。
export default function BottomSheet({ open, onClose, heightRatio = 0.88, children }: Props) {
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
      <Animated.View
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          maxHeight: `${Math.round(heightRatio * 100)}%` as `${number}%`,
          backgroundColor: C.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          ...SHADOW.float,
          paddingBottom: insets.bottom + 16,
          transform: [{ translateY: slide }],
        }}
      >
        <Pressable onPress={onClose} style={{ alignItems: "center", paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.hairline }} />
        </Pressable>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
}
