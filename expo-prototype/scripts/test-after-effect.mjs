// lib/metrics.ts の summarizeAfter の検証（判断のあと30日に何が起きたか）。
//
//   cd ~/Projects/farm-app/expo-prototype && node scripts/test-after-effect.mjs
//
// ③ 練習する（docs/decisions/20261012-solo-learning-loop.md）。去年の自分の判断の横に「その後」を並べ、
// 1人で答え合わせできるようにする。ここで数えるのは記録にある事実だけで、「判断が良かった・悪かった」は言わない
// （因果は記録から言えないため。「OK・安全とは言わない」と同じ線）。
import { pathToFileURL } from "node:url";

const { summarizeAfter } = await import(pathToFileURL(new URL("../lib/metrics.ts", import.meta.url).pathname).href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };
const isSpray = wt => wt === "防除" || wt === "農薬散布";

const r = (o = {}) => ({ crop_id: 5, date: "2025-10-20", work_type: "草刈り", quantity: "", quantity_unit: "", ...o });
const rows = [
  r({ date: "2025-10-18", work_type: "定植" }),                          // 判断の当日（数えない）
  r({ date: "2025-10-25", work_type: "防除" }),
  r({ date: "2025-11-02", work_type: "農薬散布" }),
  r({ date: "2025-11-10", work_type: "収穫", quantity: "12.5" }),
  r({ date: "2025-11-12", work_type: "収穫", quantity: "3", quantity_unit: "箱" }), // kg 以外は合算しない
  r({ date: "2025-11-30", work_type: "収穫", quantity: "99" }),          // 30日の外
  r({ date: "2025-10-22", work_type: "収穫", quantity: "50", crop_id: 9 }), // 別の作物
];

console.log("\n判断のあと30日:");
const s = summarizeAfter(rows, 5, "2025-10-18", 30, isSpray);
t("当日の作業は数えない（判断そのものの作業のため）", s.works === 4);
t("散布は2系統（防除・農薬散布）とも数える", s.sprays === 2);
t("収穫は kg だけ合算する", s.harvestKg === 12.5);
t("30日の外は数えない", s.until === "2025-11-17");
t("別の作物は数えない", !rows.filter(x => x.crop_id === 9).some(() => s.harvestKg >= 50));

console.log("\n境界:");
t("月をまたいでも日付を正しく足す", summarizeAfter([], 5, "2025-01-31", 30, isSpray).until === "2025-03-02");
const empty = summarizeAfter(rows, 5, "2026-01-01", 30, isSpray);
t("その後の記録が無ければ0件", empty.works === 0 && empty.sprays === 0 && empty.harvestKg === 0);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if (fail > 0) process.exit(1);
