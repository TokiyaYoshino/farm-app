// ─── デザイントークン（単一の色定義元）──────────────────────────
// 全ファイルはここから import する。色をこのファイル以外で直書きしない。
//
// 意味付け（セマンティックカラー）:
//   緑    = ブランド / 状態（完了・保存・アクティブ）… CTA と「進んでいる」状態
//   赤    = 削除・破壊的操作・エラー
//   琥珀  = 警告・未報告・未設定
//   青    = 情報・中立の強調
//   紫    = 農薬カテゴリ（分野色）
//   灰    = 中立テキスト・境界・背景
export const C = {
  // ブランド緑
  primary:   "#2d6a2d", // 主要CTA・アクティブ状態・保存
  primary2:  "#3a8a3a", // 濃淡・グラフ系列
  primary3:  "#e8f5e9", // 淡色背景
  primary4:  "#c8e6c9", // 淡色境界

  // セマンティック
  danger:    "#c0392b",
  dangerBg:  "#fdecea",
  warning:   "#f57f17",
  warningBg: "#fff8e1",
  info:      "#1976d2",
  infoBg:    "#e3f2fd",
  accent:    "#f9a825", // 補助アクセント

  // 農薬カテゴリ（紫）
  pesticide:   "#7b1fa2",
  pesticideBg: "#f3e5f5",

  // 天気メトリクスのアイコン色
  temp: "#e07020", // 気温（湿度は info を使用）
  rain: "#0288d1", // 雨量

  // ニュートラル
  text:      "#1a2e1a",
  textSub:   "#4a6a4a",
  textMuted: "#8aaa8a",
  bg:        "#f4f7f2",
  card:      "#ffffff",
  border:    "#dde8dd",
  navBg:     "#ffffff",

  // CalendarView 互換エイリアス（info 系の青）
  blue:      "#1976d2",
  blueBg:    "#e3f2fd",
  blue4:     "#bbdefb",
} as const;

export type Role = "admin" | "worker" | "viewer";
export const roleLabel: Record<Role, string> = { admin: "管理者", worker: "作業者", viewer: "閲覧者" };
export const roleColor: Record<Role, string> = { admin: C.danger, worker: C.primary, viewer: C.info };
