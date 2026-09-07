// src/lib/metrics.ts からの移植（純粋TSのため無変更で流用）。
// 収穫量・作業時間の集計ルールを1箇所に集約する。集計は必ずこのモジュールを通す。

/** 集計に必要な最小限のフィールドだけを要求する。 */
export interface MetricReport {
  work_type: string;
  quantity: string;
  quantity_unit?: string | null;
  work_time?: string;
  work_start?: string | null;
  work_end?: string | null;
  work_minutes?: number | null;
}

// 収穫量として kg 合算してよい単位。kg 系以外は合算せず件数だけ数えて注記する。
const HARVEST_UNITS = ["", "kg", "KG", "Kg", "㎏"];

export const isHarvestRecord = (r: MetricReport): boolean => r.work_type === "収穫";

export const isCountableHarvest = (r: MetricReport): boolean =>
  isHarvestRecord(r) && HARVEST_UNITS.includes(r.quantity_unit ?? "");

export const harvestQty = (r: MetricReport): number =>
  isCountableHarvest(r) ? Number(r.quantity) || 0 : 0;

export const sumHarvest = (rs: MetricReport[]): number =>
  rs.reduce((s, r) => s + harvestQty(r), 0);

export const excludedHarvestCount = (rs: MetricReport[]): number =>
  rs.filter(r => isHarvestRecord(r) && !isCountableHarvest(r)).length;

function minutesBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

/** 作業時間（分）。work_minutes → 開始終了 → 手入力 work_time の順で辿る。 */
export function workMinutes(r: MetricReport): number {
  if (r.work_minutes != null && r.work_minutes > 0) return r.work_minutes;
  const fromRange = minutesBetween(r.work_start, r.work_end);
  if (fromRange != null) return fromRange;
  const h = parseFloat(r.work_time ?? "");
  return Number.isFinite(h) && h > 0 ? Math.round(h * 60) : 0;
}

export const sumWorkMinutes = (rs: MetricReport[]): number =>
  rs.reduce((s, r) => s + workMinutes(r), 0);

export const toHours = (min: number): number => Math.round((min / 60) * 10) / 10;

/** 前年同時期比。前年が 0 のときは比較不能として null（+∞% を出さない）。 */
export function pctDiff(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── 年×作業種別の件数（AIに数えさせないための事前集計）─────────────
//
// api/search-chat.ts に渡す材料。「去年の防除は何回した？」を LLM に数えさせると
// 年を取り違える（実測: 2026年の防除3件を「2025年に」と回答した）。
// 農薬の使用回数は formatPesticideUsageForPrompt が事前計算して渡しており、
// そちらは正しく答えられていたので、作業回数も同じく数えてから渡す。
//
// 集計は「数えるのはコード、言い換えるのが LLM」という分担のための境界であって、
// 画面表示には使わない（画面は AnalyticsView が別途集計している）。

export interface CountReport {
  date: string;
  work_type: string;
}

/**
 * 年（降順）× 作業種別（件数降順）の件数表。プロンプトに貼れる形で返す。
 *
 * maxChars を渡すと、収まる年（新しい順）までで打ち切り、落とした年数を注記に出す。
 * 黙って削ると「全部数えた」と誤解させるので、他の整形関数と同じく打ち切りは必ず明示する。
 * 既定は無制限 —— api/search-chat.ts の呼び出しの出力を変えないため。
 */
export function formatWorkCountsForPrompt(reports: CountReport[], maxChars?: number): string {
  const byYear = new Map<string, Map<string, number>>();
  for (const r of reports) {
    const year = (r.date ?? "").slice(0, 4);
    const work = (r.work_type ?? "").trim();
    if (!/^\d{4}$/.test(year) || !work) continue;
    if (!byYear.has(year)) byYear.set(year, new Map());
    const m = byYear.get(year)!;
    m.set(work, (m.get(work) ?? 0) + 1);
  }
  if (byYear.size === 0) return "";

  const lines = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, m]) => {
      const parts = [...m.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([work, n]) => `${work}${n}回`);
      return `${year}年: ${parts.join(" / ")}`;
    });

  const header = ["", "## 作業の集計（下の作業記録を年ごとに数えたもの・この数字が正）"];
  if (maxChars == null) return [...header, ...lines].join("\n");

  // 新しい年から詰める。古い年から落とすほうが、相談で参照される確率が高い年を残せる
  const kept: string[] = [];
  let used = header.join("\n").length;
  for (const line of lines) {
    if (used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
  }
  if (kept.length === 0) return "";
  const dropped = lines.length - kept.length;
  return [
    ...header,
    ...kept,
    ...(dropped > 0 ? [`（文字数の都合でほか${dropped}年分は省略。数えていないだけで、作業が無かったという意味ではない）`] : []),
  ].join("\n");
}
