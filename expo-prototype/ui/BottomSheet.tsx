import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, View, ScrollView, Animated, Keyboard, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SHADOW } from "./tokens";

interface Props {
  open: boolean;
  onClose: () => void;
  heightRatio?: number; // Web版の height="75vh" 相当
  /** 中身が自分でスクロールし、下の入力欄を固定するシート（相談など）。
   *  シートの高さを heightRatio に固定し、外側のスクロールを付けない。キーボードが出たらその上に載せる */
  fill?: boolean;
  children: ReactNode;
}

// src/ui/BottomSheet.tsx の RN 版。上角24の丸み・float影・下からのシート。
// Modal の animationType="slide" はオーバーレイごと画面全体をスライドさせて
// しまう（暗幕がシートと一緒に引っ張られて見える）ため、オーバーレイは
// フェード・シートだけ Animated でスライドさせる。
// 閉じるアニメーションの長さ（下の Animated.timing の slide と同じ）
const CLOSE_MS = 200;

/** シートを閉じて別のシートを開くときは、次のシートをこれで開く。
 *  iOS では閉じかけの Modal の上に次の Modal を重ねると、前の Modal が消えるときに
 *  上の Modal も一緒に消える（2026-10-25、相談の「写真で調べる」で写真のシートが開かない
 *  不具合として確認）。前のシートが閉じきるのを待ってから開く */
export function afterSheetClose(open: () => void): void {
  setTimeout(open, CLOSE_MS + 100);
}

export default function BottomSheet({ open, onClose, heightRatio = 0.88, fill = false, children }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [visible, setVisible] = useState(open);
  const slide = useRef(new Animated.Value(winH)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!fill) return;
    const show = Keyboard.addListener("keyboardWillShow", e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [fill]);

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
        Animated.timing(slide, { toValue: winH, duration: CLOSE_MS, useNativeDriver: true }),
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
          position: "absolute", left: 0, right: 0, bottom: fill ? kbHeight : 0,
          ...(fill
            ? { height: Math.min(winH * heightRatio, winH - kbHeight - insets.top) }
            : { maxHeight: `${Math.round(heightRatio * 100)}%` as `${number}%` }),
          backgroundColor: C.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          ...SHADOW.float,
          paddingBottom: fill && kbHeight > 0 ? 8 : insets.bottom + 16,
          transform: [{ translateY: slide }],
        }}
      >
        <Pressable onPress={onClose} style={{ alignItems: "center", paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.hairline }} />
        </Pressable>
        {fill
          ? <View style={{ flex: 1 }}>{children}</View>
          : <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>}
      </Animated.View>
    </Modal>
  );
}
