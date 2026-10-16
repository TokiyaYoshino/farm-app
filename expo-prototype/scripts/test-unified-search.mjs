// lib/unifiedSearch.ts の検証（記録・相談・AIの出力をまとめて言葉で探す）。
//
//   cd ~/Projects/farm-app/expo-prototype && node scripts/test-unified-search.mjs
//
// 検証の主眼は「書いた言葉と探す言葉の表記が違っても当たる」こと。
// 農家は同じものを ひらがな／カタカナ／全角数字 で書き分けるので、完全一致だと去年の自分の記録が出てこない
// （docs/decisions/20261012-solo-learning-loop.md の ② 届く）。
import { pathToFileURL } from "node:url";

const { normalize, splitTerms, searchItems, searchWithFallback, snippetOf } = await import(
  pathToFileURL(new URL("../lib/unifiedSearch.ts", import.meta.url).pathname).href
);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

console.log("\n表記の揺れ:");
t("カタカナとひらがなを同じに扱う", normalize("ベト病") === normalize("べと病"));
t("全角英数を半角に寄せる", normalize("Ａ圃場１２") === normalize("a圃場12"));
t("大文字小文字を区別しない", normalize("pH") === normalize("PH"));

console.log("\n言葉の分け方:");
t("空白（全角含む）で分ける", JSON.stringify(splitTerms(" たまねぎ　定植 ")) === JSON.stringify(["たまねぎ", "定植"]));
t("空なら空", splitTerms("   ").length === 0);

const items = [
  { kind: "record", id: "r1", date: "2025-10-18", title: "定植", text: "たまねぎ A圃場 判断メモ 最低気温が下がった" },
  { kind: "record", id: "r2", date: "2026-06-10", title: "防除", text: "ほうれん草 C圃場 ベト病予防" },
  { kind: "advice", id: "m1", date: "2026-09-07", title: "相談", text: "べと病の薬はいつ撒けばいい？" },
  { kind: "ai", id: "a1", date: "2026-10-04", title: "次の散布時期", text: "10月7日以降がよさそうです" },
];

console.log("\n探す:");
let hits = searchItems(items, "べと病");
t("表記が違っても当たる（ベト病／べと病）", hits.length === 2);
t("新しい順に並ぶ", hits[0].id === "m1" && hits[1].id === "r2");
hits = searchItems(items, "たまねぎ 定植");
t("言葉はすべて含むものだけ（かつ）", hits.length === 1 && hits[0].id === "r1");
t("見出しの言葉でも当たる", searchItems(items, "次の散布").length === 1);
t("空の検索は何も返さない", searchItems(items, "  ").length === 0);
t("当たらなければ空", searchItems(items, "キャベツ").length === 0);

console.log("\n0件のときはどれかを含むものに広げる（強制ANDで辿り着けない、を避ける）:");
let res = searchWithFallback(items, "たまねぎ 定植");
t("すべて含むものがあれば、それだけ（mode=all）", res.mode === "all" && res.hits.length === 1);
res = searchWithFallback(items, "べと病 キャベツ");
t("すべて含むものが0件なら、どれかを含むもの（mode=any）", res.mode === "any" && res.hits.length === 2);
t("広げても新しい順", res.hits[0].id === "m1");
res = searchWithFallback(items, "キャベツ");
t("言葉が1つで0件なら広げない（mode=all・0件）", res.mode === "all" && res.hits.length === 0);
res = searchWithFallback(items, "キャベツ トマト");
t("どれも含まなければ0件", res.hits.length === 0);
t("空の検索は何も返さない", searchWithFallback(items, " ").hits.length === 0);

console.log("\n抜き出し:");
const long = "あ".repeat(50) + "最低気温が下がった" + "い".repeat(50);
const sn = snippetOf(long, ["最低気温"]);
t("当たった言葉の前後を抜き出す", sn.includes("最低気温") && sn.length < long.length);
t("前を切ったら…で始まる", sn.startsWith("…"));
t("短い文はそのまま", snippetOf("短い文", ["短い"]) === "短い文");

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if (fail > 0) process.exit(1);
