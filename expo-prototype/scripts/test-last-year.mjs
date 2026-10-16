// lib/lastYear.ts の検証（作業暦の「去年の今ごろ」と、今年とのずれ）。
//
//   cd ~/Projects/farm-app/expo-prototype && node scripts/test-last-year.mjs
//
// 参考: Day One「On This Day」（過去の同じ時期の日記を集めて見せる）。開いた瞬間に去年の今ごろの判断が出れば、
// 作物や月を選ばずに答え合わせが始まる（docs/decisions/20261012-solo-learning-loop.md の ③）。
// 「今年はまだ」は、去年の日付を過ぎているのに今年の同じ作業が無いときだけ言う（早すぎる催促をしない）。
import { pathToFileURL } from "node:url";

const { lastYearAround, compareThisYear } = await import(
  pathToFileURL(new URL("../lib/lastYear.ts", import.meta.url).pathname).href
);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const r = (o = {}) => ({ id: 1, crop_id: 5, date: "2025-10-18", work_type: "定植", ...o });

console.log("\n去年の今ごろ（前後7日）:");
const rows = [
  r({ id: 1, date: "2025-10-18" }),
  r({ id: 2, date: "2025-10-06" }),   // 7日前ちょうど
  r({ id: 3, date: "2025-10-05" }),   // 8日前（外）
  r({ id: 4, date: "2025-10-20" }),   // 7日後ちょうど
  r({ id: 5, date: "2025-10-21" }),   // 8日後（外）
  r({ id: 6, date: "2026-10-13" }),   // 今年（対象外）
];
const near = lastYearAround(rows, "2026-10-13", 7);
t("前後7日ちょうどまで含む", near.map(x => x.id).join(",") === "2,1,4");
t("古い順に並ぶ", near[0].date < near[near.length - 1].date);
t("年をまたぐ時期でも取れる（1/3 の前後）",
  lastYearAround([r({ date: "2024-12-30" }), r({ date: "2025-01-08" })], "2026-01-03", 7).length === 2);

console.log("\n今年とのずれ:");
const last = r({ date: "2025-10-18" });
t("今年も同じ作業があれば日数の差（早い）",
  compareThisYear(last, [r({ date: "2026-10-15" })], "2026-10-20") === "今年は 10/15（3日早い）");
t("遅い", compareThisYear(last, [r({ date: "2026-10-22" })], "2026-10-25") === "今年は 10/22（4日遅い）");
t("同じ日", compareThisYear(last, [r({ date: "2026-10-18" })], "2026-10-19") === "今年は 10/18（去年と同じ日）");
t("去年の日付を過ぎて今年の記録が無ければ「まだ」",
  compareThisYear(last, [], "2026-10-20") === "今年はまだ（去年は2日前）");
t("去年の日付の前なら「あと◯日」",
  compareThisYear(last, [], "2026-10-13") === "去年は5日後");
t("当日なら「今日」", compareThisYear(last, [], "2026-10-18") === "去年は今日");
t("別の作物・別の作業は今年の記録として数えない",
  compareThisYear(last, [r({ crop_id: 9, date: "2026-10-15" }), r({ work_type: "収穫", date: "2026-10-15" })], "2026-10-20") === "今年はまだ（去年は2日前）");
t("今年の同じ作業が前後45日より離れていれば別の回とみなす",
  compareThisYear(last, [r({ date: "2026-06-01" })], "2026-10-20") === "今年はまだ（去年は2日前）");

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if (fail > 0) process.exit(1);
