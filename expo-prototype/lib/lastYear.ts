// ─── 去年の今ごろ（作業暦の先頭）────────────────────────────────
// 参考: Day One「On This Day」。開いた瞬間に去年の同じ時期の作業と判断を出し、
// 作物や月を選ばずに答え合わせを始められるようにする（docs/decisions/20261012-solo-learning-loop.md の ③）。
// 「今年はまだ」は去年の日付を過ぎたときだけ言う（早すぎる催促をしない）。

interface LyRecord { crop_id: number; date: string; work_type: string }

const DAY = 86400000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const shiftYear = (date: string, years: number) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
/** 今年の同じ作業を「同じ回」とみなす幅。これより離れていれば別の回（春作と秋作など） */
const SAME_ROUND_DAYS = 45;

/** 去年の、今日の前後 days 日の記録（古い順）。2/29 は前年に無いので 2/28 に寄せる */
export function lastYearAround<R extends LyRecord>(rs: R[], today: string, days: number): R[] {
  const base = toMs(shiftYear(today === `${today.slice(0, 4)}-02-29` ? `${today.slice(0, 4)}-02-28` : today, -1));
  return rs
    .filter(r => Math.abs(toMs(r.date) - base) <= days * DAY)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 去年のその作業に対して、今年はどうか（同じ作物・同じ作業で、去年の日付の前後45日にある今年の記録と比べる） */
export function compareThisYear<R extends LyRecord>(last: R, thisYear: R[], today: string): string {
  const target = toMs(shiftYear(last.date, 1));
  const same = thisYear
    .filter(r => r.crop_id === last.crop_id && r.work_type === last.work_type && Math.abs(toMs(r.date) - target) <= SAME_ROUND_DAYS * DAY)
    .sort((a, b) => Math.abs(toMs(a.date) - target) - Math.abs(toMs(b.date) - target))[0];
  if (same) {
    const diff = Math.round((toMs(same.date) - target) / DAY);
    return `今年は ${md(same.date)}（${diff === 0 ? "去年と同じ日" : diff < 0 ? `${-diff}日早い` : `${diff}日遅い`}）`;
  }
  const until = Math.round((target - toMs(today)) / DAY);
  if (until > 0) return `去年は${until}日後`;
  if (until === 0) return "去年は今日";
  return `今年はまだ（去年は${-until}日前）`;
}
