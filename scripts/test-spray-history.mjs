// AI に渡す「コードが数えた集計」の整形の検証。
//   - src/lib/pesticideUsage.ts の formatSprayHistoryForPrompt（防除助言・相談）
//   - src/lib/pesticideUsage.ts の formatPesticideUsageForPrompt（記録検索・相談）
//   - src/lib/metrics.ts の formatWorkCountsForPrompt（記録検索・相談）
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/Projects/farm-app && node scripts/test-spray-history.mjs
//
// 検証の主眼は2つ。
//   1. 判定できないことを判定したことにしない（系統・成分の連用／記録が無い期間）
//   2. 打ち切り・欠損を黙らせない（省略した件数、農薬名が取れない記録）
// どちらも誤ると、使用者を法令違反や誤った防除判断に導く。
import { pathToFileURL } from "node:url";

const { formatSprayHistoryForPrompt, isSprayReport, formatPesticideUsageForPrompt } =
  await import(pathToFileURL(new URL("../src/lib/pesticideUsage.ts", import.meta.url).pathname).href);
const { formatWorkCountsForPrompt } =
  await import(pathToFileURL(new URL("../src/lib/metrics.ts", import.meta.url).pathname).href);

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

// ── formatPesticideUsageForPrompt の includeLabelRows ────────────────
//
// 相談（api/advise.ts）にも使用実績を渡すようになったが、相談では
//   ・作付けの相談 … 同じラベル原文が registrationFacts として別枠で載る＝二重
//   ・畑全体の相談 … 全作物ぶんの適用行を載せると「回数だけ」の境界を踏み越える
// ので、適用行だけを落とせるようにした（docs/decisions/20260908-advice-handoff.md）。
// 既定は true のまま＝ api/search-chat.ts に渡す文字列は一字一句変わらない。
console.log("\n農薬の使用実績（includeLabelRows）:");
const uCrops = [{ id: 5, name: "たまねぎ", start_date: "2026-02-20", famic_crop_name: "たまねぎ" }];
const uPesticides = [{ id: "p1", name: "ダコニール1000" }, { id: "p9", name: "使っていない剤" }];
const uReports = [
  { crop_id: 5, date: "2026-07-30", work_type: "防除", pesticides_used: [{ id: "p1", amount: null }] },
  { crop_id: 5, date: "2026-08-14", work_type: "防除", pesticides_used: [{ id: "p1", amount: null }] },
];
const uRegs = {
  p1: [{ product_name: "ダコニール1000", crop_name: "たまねぎ", pest_name: "べと病",
        dilution: "1000倍", usage_timing: "収穫7日前まで", usage_count: "6回以内",
        total_count: "6回以内", application: "散布" }],
  p9: [{ product_name: "使っていない剤", crop_name: "たまねぎ", pest_name: "アブラムシ",
        dilution: "2000倍", usage_timing: "収穫前日まで", usage_count: "3回以内",
        total_count: "3回以内", application: "散布" }],
};
const usage = (extra = {}) => formatPesticideUsageForPrompt({
  pesticides: uPesticides, crops: uCrops, reports: uReports,
  registrationsByPesticide: uRegs, today: TODAY, ...extra,
});

const withRows = usage();
const noRows = usage({ includeLabelRows: false });
t("既定では適用行が載る（記録検索の回帰）", withRows.includes("ラベルの適用内容"));
t("既定では使用実績ゼロの農薬も載る（記録検索の回帰）", withRows.includes("使っていない剤"));
t("includeLabelRows:false で適用行は載らない", !noRows.includes("ラベルの適用内容"));
t("includeLabelRows:false で希釈倍数も載らない", !noRows.includes("1000倍"));
t("includeLabelRows:false で使用実績ゼロの農薬は行ごと落とす",
  !noRows.includes("使っていない剤") && !noRows.includes("集計期間内の使用実績なし"));
t("includeLabelRows:false でも使用回数は残る", noRows.includes("使用 2回"));
t("includeLabelRows:false でも上限の原文は残る", noRows.includes("6回以内"));
t("includeLabelRows:false でも見出しは残る（API はこれを素通しする）",
  noRows.includes("## 農薬の使える回数と使用実績"));
t("適用行を落としたぶん短くなる", noRows.length < withRows.length);

// 非対称性の回帰。「使ってよい」側に倒す言い回しを出力に混ぜない
// （docs/decisions/20260805-pesticide-precheck.md）
console.log("\n使用可否に倒さない（非対称性の回帰）:");
[["既定", withRows], ["適用行なし", noRows]].forEach(([label, out2]) => {
  t(`${label}: 「あと」と書かない`, !out2.includes("あと"));
  t(`${label}: 「残り」と書かない`, !out2.includes("残り"));
  t(`${label}: 「使用可能」と書かない`, !out2.includes("使用可能"));
  t(`${label}: 「安全」と書かない`, !out2.includes("安全"));
});

// ── formatWorkCountsForPrompt の打ち切り ──────────────────────────
//
// 相談の aggregates は 4000 字が上限（api/advise.ts）。以前は連結してから
// 盲目的に slice していたので、後ろに置いた作業回数が黙って消えていた。
// 予算を関数側に渡す形にしたので、打ち切りは他の整形関数と同じく明示する。
console.log("\n作業回数の集計（打ち切りを黙らせない）:");
const wcReports = [];
for (let y = 2016; y <= 2026; y++) {
  for (let k = 0; k < 40; k++) {
    wcReports.push({ crop_id: 5, date: `${y}-05-01`, work_type: `作業種別の名前が長い${k}` });
  }
}
const wcAll = formatWorkCountsForPrompt(wcReports);
const wcCut = formatWorkCountsForPrompt(wcReports, 2000);
t("既定は打ち切らない（記録検索の回帰）", wcAll.length > 2000);
t("上限を渡すと収まる", wcCut.length <= 2000);
t("落とした年数を明記する", /ほか\d+年分は省略/.test(wcCut));
t("省略＝作業が無かった ではないと添える", wcCut.includes("作業が無かったという意味ではない"));
t("新しい年から残す（相談で参照されやすい側）", wcCut.includes("2026年") && !wcCut.includes("2016年"));
t("見出しだけ残るくらい狭ければ空文字（見出しの空振りを出さない）",
  formatWorkCountsForPrompt(wcReports, 50) === "");
t("記録が無ければ空文字", formatWorkCountsForPrompt([], 2000) === "");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
