// lib/monthDigest.ts の検証（作業暦の記録の流れを、月ごとに短くまとめる）。
//
//   cd ~/Projects/farm-app/expo-prototype && node scripts/test-month-digest.mjs
//
// 1年分を全部並べると数百件になり読めない（オーナー 2026-10-13）。1件ずつ残すのは判断メモと散布だけ
// （答え合わせと法令の記録に関わるため）。ふだんの作業は月ごとに「収穫 3回（計106kg）・草刈り 2回」の1行にする。
import { pathToFileURL } from "node:url";

const { digestByMonth } = await import(pathToFileURL(new URL("../lib/monthDigest.ts", import.meta.url).pathname).href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const isImportant = r => r.important === true;
const qty = r => (r.work_type === "収穫" ? Number(r.q ?? 0) : 0);
const r = (o = {}) => ({ id: Math.random(), date: "2026-05-10", work_type: "草刈り", ...o });

const rows = [
  r({ date: "2026-05-24", work_type: "収穫", q: 100 }),
  r({ date: "2026-05-25", work_type: "収穫", q: 6 }),
  r({ date: "2026-05-02", work_type: "収穫" }),
  r({ date: "2026-05-25", work_type: "草刈り" }),
  r({ date: "2026-05-31", work_type: "草刈り" }),
  r({ date: "2026-06-13", work_type: "農薬散布", important: true }),
  r({ date: "2026-06-10", work_type: "防除", important: true }),
  r({ date: "2026-06-11", work_type: "草刈り" }),
  r({ date: "2026-06-12", work_type: "" }),
];
const d = digestByMonth(rows, isImportant, qty);

console.log("\n月の並び:");
t("記録のある月だけ、古い順", d.map(m => m.month).join(",") === "5,6");

console.log("\n1件ずつ残すもの:");
const jun = d.find(m => m.month === 6);
t("判断・散布は1件ずつ、日付順", jun.important.map(x => x.date).join(",") === "2026-06-10,2026-06-13");
t("ふだんの作業には入れない", !jun.routine.some(x => x.important));

console.log("\nふだんの作業の1行:");
const may = d.find(m => m.month === 5);
t("回数の多い作業から並ぶ", may.summary.startsWith("収穫"));
t("収穫は kg の合計を添える", may.summary.includes("収穫 3回（計106kg）"));
t("ほかの作業は回数だけ", may.summary.includes("草刈り 2回"));
t("区切りは「・」", may.summary === "収穫 3回（計106kg）・草刈り 2回");
t("作業名が空なら「未設定」", jun.summary.includes("未設定 1回"));
t("中身（開いたときに出す）は日付順", may.routine.map(x => x.date).join(",") === "2026-05-02,2026-05-24,2026-05-25,2026-05-25,2026-05-31");

const onlyImportant = digestByMonth([r({ date: "2026-07-01", important: true })], isImportant, qty);
t("ふだんの作業が無い月は1行を出さない", onlyImportant[0].summary === "" && onlyImportant[0].routine.length === 0);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if (fail > 0) process.exit(1);
