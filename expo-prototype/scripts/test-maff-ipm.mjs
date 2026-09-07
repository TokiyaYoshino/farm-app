// data/maffIpm.ts の検証（作物 → 公的資料の引き当て）。Web版 scripts/test-maff-ipm.mjs の対。
//
//   cd ~/Projects/farm-app/expo-prototype && node scripts/test-maff-ipm.mjs
//
// 検証の主眼は**引き当てないこと**。近い作物の資料を当てると、他作物の防除体系を
// この作付けのものとして提示することになる。2026-09-06 に本番で見つかった
// 「ほうれん草 → ぶどう」の誤紐付け（docs/decisions/20260824-plain-language-and-crop-mapping.md
// の追記）と同じ種類の事故で、しかも画面上は普通に動いて見える。
//
// 拡張子つきで import しないと素の Node が解決できないため、ここでは
// maffIpm.ts と同じ引き当てロジックを再現せず、**実物を読み込んで**検証する。
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

// data/maffIpm.ts は "../lib/cropAlias"（拡張子なし）を import する。
// Vite は解決するが素の Node は解決できないので、ここだけ差し替える
registerHooks({
  resolve(specifier, context, next) {
    if (/\/(cropAlias|maffIpmData)$/.test(specifier)) return next(specifier + ".ts", context);
    return next(specifier, context);
  },
});

const { referencesForCrop, manualCrops } =
  await import(pathToFileURL(process.cwd() + "/data/maffIpm.ts").href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

console.log("\n資料がある作物:");
t("取り込み済みは2作目（キャベツ・ぶどう）", manualCrops.length === 2);
const cab = referencesForCrop("キャベツ");
t("キャベツで1件返る", cab.length === 1);
t("資料名が入る", cab[0].title.includes("キャベツ編"));
t("出典URLが入る（画面と利用規約の出典表示に使う）", cab[0].source.startsWith("https://www.maff.go.jp/"));
t("原文が入る", cab[0].text.includes("発病株の除去"));
t("表記ゆれ（半角カナ）でも引ける", referencesForCrop("ｷｬﾍﾞﾂ").length === 1);
t("ぶどうで1件返る", referencesForCrop("ぶどう").length === 1);
t("カタカナのブドウでも引ける", referencesForCrop("ブドウ").length === 1);
t("漢字の葡萄でも引ける", referencesForCrop("葡萄").length === 1);

console.log("\n引き当てない（最重要）:");
t("たまねぎには当てない（ネギ編で代用しない）", referencesForCrop("たまねぎ").length === 0);
t("にんにくには当てない", referencesForCrop("にんにく").length === 0);
t("ネギそのものにも当てない（取り込んでいないため）", referencesForCrop("ねぎ").length === 0);
t("ほうれん草には当てない", referencesForCrop("ほうれん草").length === 0);
t("知らない作物には当てない", referencesForCrop("そらまめ").length === 0);
t("空文字は空", referencesForCrop("").length === 0);
t("null は空（畑全体の相談は作物が定まらないので渡さない）", referencesForCrop(null).length === 0);
t("undefined も空", referencesForCrop(undefined).length === 0);
// 部分一致で拾うと「キャベツもどき」のような名前に当たってしまう
t("部分一致では引き当てない", referencesForCrop("キャベツ風レタス").length === 0);

console.log("\nプロンプトに載せる量:");
t("既定で9000字まで", referencesForCrop("キャベツ")[0].text.length <= 9000);
t("上限を指定できる", referencesForCrop("キャベツ", 500)[0].text.length === 500);
t("APIの上限（12000字）を超えない",
  referencesForCrop("キャベツ").reduce((a, x) => a + x.text.length, 0) <= 12000);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
