// 収穫量・作業時間の集計ルールを1箇所に集約する。
//
// 同じ「収穫量」ラベルなのに画面ごとに違う数字が出ていた（ホームの今週の収穫と
// 作物カードは work_type で絞らず、分析画面だけ work_type='収穫' で絞っていた）ため、
// 集計は必ずこのモジュールを通す。App.tsx / AnalyticsView.tsx の双方から使う。

/** 集計に必要な最小限のフィールドだけを要求する。App.tsx の Report がそのまま渡る。 */
export interface MetricReport {
  work_type: string;
  quantity: string;
  quantity_unit?: string | null;
  work_time?: string;
  work_start?: string | null;
  work_end?: string | null;
  work_minutes?: number | null;
}

// 収穫量として kg 合算してよい単位。quantity_unit は work_categories.unit 由来で
// 「本」「箱」なども入りうるため、kg 系以外は合算せず件数だけ数えて注記する。
// 空・未設定は単位カラム導入前の記録（kg 前提）とみなす。
const HARVEST_UNITS = ["", "kg", "KG", "Kg", "㎏"];

export const isHarvestRecord = (r: MetricReport): boolean => r.work_type === "収穫";

/** 収穫記録のうち、単位が kg 系で合算できるもの。 */
export const isCountableHarvest = (r: MetricReport): boolean =>
  isHarvestRecord(r) && HARVEST_UNITS.includes(r.quantity_unit ?? "");

/** 合算対象なら数量(kg)、それ以外は 0。 */
export const harvestQty = (r: MetricReport): number =>
  isCountableHarvest(r) ? Number(r.quantity) || 0 : 0;

export const sumHarvest = (rs: MetricReport[]): number =>
  rs.reduce((s, r) => s + harvestQty(r), 0);

/** 単位が kg 以外のため集計から外した収穫記録の件数。黙って隠さず注記に使う。 */
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

/**
 * 作業時間（分）。保存済みの work_minutes を最優先し、無ければ開始終了から算出、
 * それも無ければ手入力の work_time（時間）を分に直す。
 * 開始終了がある記録しか拾わないと手入力ぶんが丸ごと落ちるため、必ずこの順で辿る。
 */
export function workMinutes(r: MetricReport): number {
  if (r.work_minutes != null && r.work_minutes > 0) return r.work_minutes;
  const fromRange = minutesBetween(r.work_start, r.work_end);
  if (fromRange != null) return fromRange;
  const h = parseFloat(r.work_time ?? "");
  return Number.isFinite(h) && h > 0 ? Math.round(h * 60) : 0;
}

export const sumWorkMinutes = (rs: MetricReport[]): number =>
  rs.reduce((s, r) => s + workMinutes(r), 0);

/** 分 → 小数1桁の時間。 */
export const toHours = (min: number): number => Math.round((min / 60) * 10) / 10;

/**
 * 前年同時期比のパーセント。前年が 0 のときは比較不能として null を返す
 * （0 から増えた場合の「+∞%」を出さない）。
 */
export function pctDiff(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
