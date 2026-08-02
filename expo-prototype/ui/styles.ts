// ─── ボタンのスタイルファクトリ（src/ui/styles.ts からの移植。完全ピル）────
// Web 版と同じ variant / size 体系。padding・fontSize・minHeight の値は同一。
import type { TextStyle, ViewStyle } from "react-native";
import { C, SHADOW, RADIUS } from "./tokens";

export type BtnVariant = "primary" | "soft" | "secondary" | "tertiary" | "danger" | "dangerOutline";
export type BtnSize = "lg" | "md" | "sm";

const sizeStyles: Record<BtnSize, { box: ViewStyle; label: TextStyle }> = {
  lg: { box: { paddingVertical: 15, paddingHorizontal: 24, alignSelf: "stretch", minHeight: 52 }, label: { fontSize: 15 } },
  md: { box: { paddingVertical: 11, paddingHorizontal: 20, minHeight: 44 }, label: { fontSize: 14 } },
  sm: { box: { paddingVertical: 9, paddingHorizontal: 16, minHeight: 36 }, label: { fontSize: 13 } },
};

const variantStyles: Record<BtnVariant, { box: ViewStyle; label: TextStyle }> = {
  primary:       { box: { backgroundColor: C.ink, ...SHADOW.pill }, label: { color: "#fff" } },
  soft:          { box: { backgroundColor: C.inkSoft }, label: { color: C.ink } },
  secondary:     { box: { backgroundColor: C.card, borderWidth: 1, borderColor: C.hairline }, label: { color: C.text } },
  tertiary:      { box: { backgroundColor: "transparent" }, label: { color: C.textSub } },
  danger:        { box: { backgroundColor: C.danger, ...SHADOW.pill }, label: { color: "#fff" } },
  dangerOutline: { box: { backgroundColor: C.dangerBg }, label: { color: C.danger } },
};

export function btnBox(variant: BtnVariant = "primary", size: BtnSize = "lg"): ViewStyle {
  return {
    borderRadius: RADIUS.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    ...sizeStyles[size].box,
    ...variantStyles[variant].box,
  };
}

export function btnLabel(variant: BtnVariant = "primary", size: BtnSize = "lg"): TextStyle {
  return {
    fontWeight: "700",
    ...sizeStyles[size].label,
    ...variantStyles[variant].label,
  };
}
