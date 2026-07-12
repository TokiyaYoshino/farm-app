// ─── デザイントークン（単一の色定義元）──────────────────────────
// スタイル: Soft Widget（白カード＋灰の受け皿の入れ子・明るい緑アクセント1色・
//           ピルボタン・ラベル小/値大・border ではなく影と面の色差で階層化）
// 詳細ブリーフ: docs/design-brief-widget.md
//
// 意味付け（セマンティックカラー）:
//   緑    = ブランド / 状態（完了・保存・アクティブ・選択）
//   赤    = 削除・破壊的操作・エラー
//   琥珀  = 警告・未報告・未設定
//   青    = 情報・中立の強調
//   紫    = 農薬カテゴリ（分野色）
//   灰    = 中立テキスト・境界・サーフェス

export const C = {
  // ── サーフェス（3層：bg の上に card が浮き、card の中に well が凹む）
  bg:        "#F5F5F6", // ページ背景（最下層のクールグレー）
  well:      "#EFEFF1", // 受け皿：グループ入力の外枠・ホイールの溝・アイコン円
  card:      "#FFFFFF", // 浮き面：カード・モーダル・入力行
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
  temp: "#E07020", // 気温
  rain: "#0288D1", // 雨量

  // ── ニュートラル（緑みのない墨〜灰）
  text:      "#1A1C1E",
  textSub:   "#66696E",
  textMuted: "#9EA1A6",
  hairline:  "#EBEBED", // 区切り線・secondaryボタン枠

  // ── 後方互換エイリアス（旧コードが参照。段階移行後に整理）
  //    旧 primary* → ink 系にマップし、緑CTAの見た目を保ちつつ緑ウォッシュを除去
  primary:   "#2E7D32", // = ink
  primary2:  "#256628", // = inkPress
  primary3:  "#E4F0E4", // = inkSoft
  primary4:  "#CBE3CC", // 淡い緑枠（移行用）
  border:    "#EBEBED", // = hairline
  blue:      "#3773E1", // = info
  blueBg:    "#E7EEFC",
  blue4:     "#C7D8F7",
} as const;

// ── 影（構造の主役。border と併用しない）
export const SHADOW = {
  card:  "0 1px 2px rgba(16,17,20,.04), 0 8px 24px rgba(16,17,20,.06)", // 通常カード
  float: "0 12px 40px rgba(16,17,20,.14)",                              // モーダル・ピッカー
  pill:  "0 2px 8px rgba(16,17,20,.10)",                                // FAB・浮きボタン
} as const;

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

// ─── データ駆動の色（装飾ではなく「情報が持つ色」）──────────────
// 白グレー基調の画面に彩りを足す用途。作業種別・作物のIDに紐づけ、
// 一貫した意味を持たせる（同じ作物は常に同じドット色になる）。

// 作業種別カラー（既知の8種）。未知の種別は workTypeColor() が名前ハッシュでフォールバック
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

// 作物カラー：固定パレットから id で決定的に割当（同じ作物は常に同じ色）
const CROP_PALETTE = [
  "#43A047", "#C98A2E", "#C1662F", "#7B4BA8",
  "#3773E1", "#2E9E8F", "#B54B6B", "#6B8F2E",
];
export function cropColor(cropId: number): string {
  return CROP_PALETTE[Math.abs(cropId) % CROP_PALETTE.length];
}
