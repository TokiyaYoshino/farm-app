// ─── 月ごとのまとめ（作業暦の記録の流れを短くする）──────────────────────
// 1年分を全部並べると数百件になり読めない（オーナー 2026-10-13）。
// 1件ずつ残すのは「大事なもの」（判断メモと散布）だけ。答え合わせと法令の記録に関わるため。
// ふだんの作業は月ごとに「収穫 3回（計106kg）・草刈り 2回」の1行にまとめ、押したときだけ中身を出す。
// 何を大事とみなすか・収穫量の数え方は呼び出し側から渡す（依存を持たない純粋関数に保つ）。

interface DigestRecord { date: string; work_type: string }

export interface MonthDigest<R> {
  month: number;
  /** 1件ずつ出すもの（日付順） */
  important: R[];
  /** まとめる側の中身（日付順） */
  routine: R[];
  /** まとめの1行。ふだんの作業が無い月は空文字 */
  summary: string;
}

export function digestByMonth<R extends DigestRecord>(
  rs: R[], isImportant: (r: R) => boolean, harvestKg: (r: R) => number,
): MonthDigest<R>[] {
  const byMonth = new Map<number, R[]>();
  [...rs].sort((a, b) => a.date.localeCompare(b.date)).forEach(r => {
    const m = Number(r.date.slice(5, 7));
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  });
  return [...byMonth.keys()].sort((a, b) => a - b).map(month => {
    const all = byMonth.get(month)!;
    const important = all.filter(isImportant);
    const routine = all.filter(r => !isImportant(r));
    const counts = new Map<string, { n: number; kg: number }>();
    routine.forEach(r => {
      const k = r.work_type || "未設定";
      const c = counts.get(k) ?? { n: 0, kg: 0 };
      counts.set(k, { n: c.n + 1, kg: c.kg + harvestKg(r) });
    });
    const summary = [...counts.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, c]) => `${k} ${c.n}回${c.kg > 0 ? `（計${Math.round(c.kg * 10) / 10}kg）` : ""}`)
      .join("・");
    return { month, important, routine, summary };
  });
}
