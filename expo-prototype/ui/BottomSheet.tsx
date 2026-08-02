import type { ReactNode } from "react";
import { Modal, Pressable, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SHADOW } from "./tokens";

interface Props {
  open: boolean;
  onClose: () => void;
  heightRatio?: number; // Web版の height="75vh" 相当
  children: ReactNode;
}

// src/ui/BottomSheet.tsx の RN 版。上角24の丸み・float影・下からのシートは同一
export default function BottomSheet({ open, onClose, heightRatio = 0.88, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
      <View
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          maxHeight: `${Math.round(heightRatio * 100)}%` as `${number}%`,
          backgroundColor: C.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          ...SHADOW.float,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 999, backgroundColor: C.hairline, marginTop: 8, marginBottom: 4 }} />
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}
