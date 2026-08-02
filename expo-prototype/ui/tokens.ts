// ─── デザイントークン（src/ui/tokens.ts からの移植。色・角丸の値は変更禁止）───
// 影のみ Web の box-shadow から RN の shadow*/elevation に分解している。
// Web: card  "0 1px 2px rgba(16,17,20,.04), 0 8px 24px rgba(16,17,20,.06)"
//      float "0 12px 40px rgba(16,17,20,.14)"
//      pill  "0 2px 8px rgba(16,17,20,.10)"
// RN は多重影を持てないため、card は2つのうち大きい方（8px 24px .06）を採用し、
// 小さい方（1px 2px .04）ぶんだけ opacity を +0.02 補正。差分は検証ドキュメントに記録済み。
import type { ViewStyle } from "react-native";

export const C = {
  // ── サーフェス（3層：bg の上に card が浮き、card の中に well が凹む）
  bg:        "#F5F5F6",
  well:      "#EFEFF1",
  card:      "#FFFFFF",
  navBg:     "#FFFFFF",

  // ── ブランド緑（インク）— CTA・アクティブ・選択・保存
  ink:       "#2E7D32",
  inkPress:  "#256628",
  inkSoft:   "#E4F0E4",

  // ── セマンティック
  danger:    "#D4453C",
  dangerBg:  "#FBEBEA",
  warning:   "#DD8A0A",
  warningBg: "#FBF1DF",
  info:      "#3773E1",
  infoBg:    "#E7EEFC",
  accent:    "#DD8A0A",

  // ── 分野色
  pesticide:   "#7B1FA2",
  pesticideBg: "#F3E9F8",
  temp: "#E07020",
  rain: "#0288D1",

  // ── ニュートラル
  text:      "#1A1C1E",
  textSub:   "#66696E",
  textMuted: "#9EA1A6",
  hairline:  "#EBEBED",

  // ── 後方互換エイリアス
  primary:   "#2E7D32",
  primary2:  "#256628",
  border:    "#EBEBED",
  blue:      "#3773E1",
} as const;

// ── 影（iOS: shadow* / Android: elevation）
export const SHADOW: Record<"card" | "float" | "pill", ViewStyle> = {
  card: {
    shadowColor: "#101114",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  float: {
    shadowColor: "#101114",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
  },
  pill: {
    shadowColor: "#101114",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 2,
  },
};

// ── 角丸
export const RADIUS = {
  card: 20,
  well: 18,
  row:  14,
  pill: 999,
} as const;

export type Role = "admin" | "worker" | "viewer";
export const roleLabel: Record<Role, string> = { admin: "管理者", worker: "作業者", viewer: "閲覧者" };
export const roleColor: Record<Role, string> = { admin: C.danger, worker: C.ink, viewer: C.info };

// ─── データ駆動の色（src/ui/tokens.ts と同一値）─────────────────
const WORK_TYPE_COLORS: Record<string, { fg: string; bg: string }> = {
  収穫:   { fg: "#2E7D32", bg: "#E4F0E4" },
  施肥:   { fg: "#8D6E1F", bg: "#F5EFDD" },
  防除:   { fg: C.pesticide, bg: C.pesticideBg },
  播種:   { fg: "#2E7D32", bg: "#E4F0E4" },
  灌水:   { fg: C.info, bg: C.infoBg },
  草刈り: { fg: "#5C7A2E", bg: "#EAF0DD" },
  剪定:   { fg: "#B15A2E", bg: "#F6E7DD" },
  その他: { fg: C.textSub, bg: C.well },
};
const FALLBACK_WORK_PALETTE = [
  { fg: "#2E7D32", bg: "#E4F0E4" }, { fg: C.pesticide, bg: C.pesticideBg },
  { fg: C.info, bg: C.infoBg },     { fg: "#B15A2E", bg: "#F6E7DD" },
  { fg: "#8D6E1F", bg: "#F5EFDD" }, { fg: "#5C7A2E", bg: "#EAF0DD" },
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
export function workTypeColor(workType: string): { fg: string; bg: string } {
  return WORK_TYPE_COLORS[workType] ?? FALLBACK_WORK_PALETTE[hashStr(workType) % FALLBACK_WORK_PALETTE.length];
}

const CROP_PALETTE = [
  "#43A047", "#C98A2E", "#C1662F", "#7B4BA8",
  "#3773E1", "#2E9E8F", "#B54B6B", "#6B8F2E",
];
export function cropColor(cropId: number): string {
  return CROP_PALETTE[Math.abs(cropId) % CROP_PALETTE.length];
}
