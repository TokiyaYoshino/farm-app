import type { CSSProperties } from "react";
import { C } from "./tokens";

// ─── ボタンのスタイルファクトリ ───────────────────────────────
// 視覚階層: primary（塗り緑・主操作）> secondary（枠線）> tertiary（文字のみ）
// 破壊的操作: danger（塗り赤・確定）/ dangerOutline（一覧の削除ボタン）
export type BtnVariant = "primary" | "secondary" | "tertiary" | "danger" | "dangerOutline";
export type BtnSize = "lg" | "md" | "sm";

const sizeStyles: Record<BtnSize, CSSProperties> = {
  lg: { padding: "13px 0", width: "100%", fontSize: 15, minHeight: 52 },
  md: { padding: "10px 16px", fontSize: 14, minHeight: 44 },
  sm: { padding: "6px 12px", fontSize: 12, minHeight: 32 },
};

const variantStyles: Record<BtnVariant, CSSProperties> = {
  primary:       { background: C.primary, color: "#fff", border: "none" },
  secondary:     { background: "transparent", color: C.primary, border: `1.5px solid ${C.primary4}` },
  tertiary:      { background: "transparent", color: C.textSub, border: "none" },
  danger:        { background: C.danger, color: "#fff", border: "none" },
  dangerOutline: { background: C.dangerBg, color: C.danger, border: `1.5px solid ${C.danger}22` },
};

export function btn(variant: BtnVariant = "primary", size: BtnSize = "lg"): CSSProperties {
  return {
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    whiteSpace: "nowrap",
    transition: "background 0.15s, opacity 0.15s",
    ...sizeStyles[size],
    ...variantStyles[variant],
  };
}
