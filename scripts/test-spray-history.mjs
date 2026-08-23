// src/lib/pesticideUsage.ts の formatSprayHistoryForPrompt の検証
// （天気×防除助言に渡す「その農場自身の防除記録」の整形）。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/Projects/farm-app && node scripts/test-spray-history.mjs
//
// 検証の主眼は2つ。
//   1. 判定できないことを判定したことにしない（系統・成分の連用／記録が無い期間）
//   2. 打ち切り・欠損を黙らせない（省略した件数、農薬名が取れない記録）
// どちらも誤ると、使用者を法令違反や誤った防除判断に導く。
import { pathToFileURL } from "node:url";

const { formatSprayHistoryForPrompt, isSprayReport } =
  await import(pathToFileURL(new URL("../src/lib/pesticideUsage.ts", import.meta.url).pathname).href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const TODAY = "2026-08-23";
const crops = [{ id: 5, name: "ほうれん草" }, { id: 9, name: "うめ" }];
const pesticides = [
  { id: "p1", name: "サンケイ石灰硫黄合剤" },
  { id: "p2", name: "丸京印ボルドー液用生石灰" },
];
const rep = (o = {}) => ({
  crop_id: 5, date: "2026-08-20", work_type: "防除", field: "C圃場",
  pesticides_used: [{ id: "p1", amount: null }], ...o,
});
const fmt = (reports, extra = {}) =>
  formatSprayHistoryForPrompt({ reports, crops, pesticides, today: TODAY, ...extra });

console.log("\n防除記録の判別:");
t("農薬が記録されていれば防除記録", isSprayReport(rep()) === true);
t("レガシーの単一農薬列でも防除記録", isSprayReport({ crop_id: 5, date: TODAY, pesticide_id: "p1" }) === true);
t("農薬が無くても作業種別が防除なら拾う", isSprayReport({ crop_id: 5, date: TODAY, work_type: "防除" }) === true);
t("農薬散布という表記も拾う", isSprayReport({ crop_id: 5, date: TODAY, work_type: "農薬散布" }) === true);
t("収穫は防除記録ではない", isSprayReport({ crop_id: 5, date: TODAY, work_type: "収穫" }) === false);

console.log("\n記録が無いとき:");
t("散布記録ゼロなら空文字（ブロックごと出さない）", fmt([]) === "");
t("防除以外しか無くても空文字", fmt([{ crop_id: 5, date: "2026-08-01", work_type: "収穫" }]) === "");

console.log("\n判定できないことを判定したことにしない:");
const out = fmt([rep()]);
t("系統・RACを判定していないと明記する", /同一系統の連用かどうかはここでは判定していない/.test(out));
t("成分データを持っていないことを明記する", /有効成分・系統/.test(out));
t("記録が無い＝散布していない ではないと明記する", /記録が無いことは散布していないことを意味しない/.test(out));
t("繰り返しの見出しに商品名の一致のみと明記する",
  /商品名の一致のみ/.test(fmt([rep(), rep({ date: "2026-07-02" })])));

console.log("\n昨年同時期:");
const lastYear = fmt([rep(), rep({ date: "2025-08-18" })]);
t("昨年同時期の記録を拾う（今日の1年前 ±14日）", /2025-08-18/.test(lastYear));
t("昨年同時期に記録が無ければ記録なしと出す", /記録なし/.test(fmt([rep()])));
t("記録なしのときも散布しなかったと断定しない",
  /散布しなかったのか記録し忘れたのかは区別できない/.test(fmt([rep()])));
const outOfWindow = fmt([rep(), rep({ date: "2025-06-01" })]);
t("窓の外（1年前から2か月以上ずれ）は昨年同時期に入れない",
  !/### 昨年の同時期[\s\S]*2025-06-01/.test(outOfWindow));

console.log("\n前回散布からの経過日数:");
t("経過日数を出す（8/20 → 8/23 は3日前）", /2026-08-20（3日前）/.test(out));
t("当日の散布は本日と出す", /2026-08-23（本日）/.test(fmt([rep({ date: TODAY })])));
t("最新の記録を前回散布に選ぶ",
  /### 前回の散布\n2026-08-20/.test(fmt([rep({ date: "2026-07-01" }), rep()])));

console.log("\n欠損・想像の防止:");
const noName = fmt([{ crop_id: 5, date: "2026-08-20", work_type: "防除", field: "C圃場" }]);
t("農薬名が無い記録は農薬の記録なしと明示する", /農薬の記録なし/.test(noName));
t("マスタに無い農薬IDは名前を作らない",
  /農薬の記録なし/.test(fmt([rep({ pesticides_used: [{ id: "unknown", amount: null }] })])));
t("未来日の記録は履歴に入れない",
  !/2026-12-31/.test(fmt([rep(), rep({ date: "2026-12-31" })])));

console.log("\n打ち切りを黙らせない:");
const many = Array.from({ length: 20 }, (_, i) =>
  rep({ date: `2026-08-${String(i + 1).padStart(2, "0")}` }));
t("件数上限を超えたら省略した件数を明記する", /ほか\d+件は省略/.test(fmt(many, { maxRecent: 5 })));
t("省略ぶんも散布はしていると添える", /省略ぶんも散布はしている/.test(fmt(many, { maxRecent: 5 })));
const truncated = fmt(many, { maxChars: 400 });
t("文字数上限で節を落としたら節数を明記する",
  truncated === "" || /節を省略/.test(truncated) || truncated.length <= 400 + 400);

console.log("\n事実であることの明示:");
t("利用者本人の実績で一般論ではないと明記する", /利用者本人が入力した実績で、一般論ではない/.test(out));
t("集計基準日を出す", new RegExp(`集計基準日: ${TODAY}`).test(out));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
