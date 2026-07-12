import type { CSSProperties } from "react";
import { C, SHADOW, RADIUS } from "./tokens";

// ─── ボタンのスタイルファクトリ（Soft Widget：完全ピル）────────────
// 視覚階層: primary（ink塗り・主操作）> soft（緑淡・準主）> secondary（白+枠）
//           > tertiary（文字のみ）。破壊的操作: danger / dangerOutline
export type BtnVariant = "primary" | "soft" | "secondary" | "tertiary" | "danger" | "dangerOutline";
export type BtnSize = "lg" | "md" | "sm";

const sizeStyles: Record<BtnSize, CSSProperties> = {
  lg: { padding: "15px 24px", width: "100%", fontSize: 15, minHeight: 52 },
  md: { padding: "11px 20px", fontSize: 14, minHeight: 44 },
  sm: { padding: "9px 16px", fontSize: 13, minHeight: 36 },
};

const variantStyles: Record<BtnVariant, CSSProperties> = {
  primary:       { background: C.ink, color: "#fff", border: "none", boxShadow: SHADOW.pill },
  soft:          { background: C.inkSoft, color: C.ink, border: "none" },
  secondary:     { background: C.card, color: C.text, border: `1px solid ${C.hairline}` },
  tertiary:      { background: "transparent", color: C.textSub, border: "none" },
  danger:        { background: C.danger, color: "#fff", border: "none", boxShadow: SHADOW.pill },
  dangerOutline: { background: C.dangerBg, color: C.danger, border: "none" },
};

export function btn(variant: BtnVariant = "primary", size: BtnSize = "lg"): CSSProperties {
  return {
    borderRadius: RADIUS.pill,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    whiteSpace: "nowrap",
    transition: "background 0.15s, opacity 0.15s",
    ...sizeStyles[size],
    ...variantStyles[variant],
  };
}
