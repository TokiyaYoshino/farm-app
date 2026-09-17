// 相談に添える農薬登録情報の整形テスト（src/lib/registrationFacts.ts）。
//
// 守りたいのは2つ。
//   1. 数値を混ぜない —— まとめるのは数値が完全一致する行だけ
//   2. どのカードも捨てない —— 畳むだけで、原文は必ず開ける場所に残る
//
// 実行: node scripts/test-registration-facts.mjs（npm test に入っている）

import { pathToFileURL } from "node:url";

const { groupRegistrationFacts, isInformationFree, prepareRegistrationFacts, BLANK_FIELD_LABEL } =
  await import(pathToFileURL(new URL("../src/lib/registrationFacts.ts", import.meta.url).pathname).href);

let passed = 0, failed = 0;
const results = [];
function section(name) { results.push(`\n${name}:`); }
function check(name, cond) {
  if (cond) { passed++; results.push(`  ✓ ${name}`); }
  else { failed++; results.push(`  ✗ ${name}`); }
}

/** 適用行1件を作る。既定は「数値が全部そろっている行」 */
const row = (over = {}) => ({
  productName: "テスト殺菌剤フロアブル",
  cropName: "ぶどう",
  pestName: "べと病",
  dilution: "1000倍",
  usageTiming: "収穫14日前まで",
  usageCount: "3回以内",
  totalCount: "3回以内",
  application: "散布",
  hasBlankLimit: false,
  ...over,
});

const blank = BLANK_FIELD_LABEL;

section("同じ製品の重複をまとめる（既知課題2）");
{
  const grouped = groupRegistrationFacts([row(), row({ pestName: "黒とう病" })]);
  check("数値が同じなら1枚になる", grouped.length === 1);
  check("病害虫名は両方残る", grouped[0].pestNames.join("/") === "べと病/黒とう病");
  check("数値は原文のまま（書き換えない）", grouped[0].dilution === "1000倍" && grouped[0].totalCount === "3回以内");
}
{
  const grouped = groupRegistrationFacts([row(), row({ pestName: "黒とう病", dilution: "2000倍" })]);
  check("希釈が違えば同じ製品でも分けたままにする", grouped.length === 2);
  check("分けた側の数値も原文のまま", grouped[1].dilution === "2000倍");
}
{
  const grouped = groupRegistrationFacts([row(), row({ pestName: "黒とう病", usageCount: "2回以内" })]);
  check("使用回数が違えば分ける", grouped.length === 2);
}
{
  const grouped = groupRegistrationFacts([row(), row({ productName: "別の薬剤" })]);
  check("製品が違えば当然分ける", grouped.length === 2);
}
{
  const grouped = groupRegistrationFacts([row({ pestName: "べと病" }), row({ pestName: "べと病" })]);
  check("同じ病害虫名は重ねて並べない", grouped[0].pestNames.length === 1);
}
{
  const grouped = groupRegistrationFacts([
    row({ pestName: "べと病", hasBlankLimit: false }),
    row({ pestName: "黒とう病", hasBlankLimit: true }),
  ]);
  check("まとめた行に判定不可が混ざれば、まとめた側も判定不可", grouped[0].hasBlankLimit === true);
}
{
  check("空配列は空配列", groupRegistrationFacts([]).length === 0);
}

section("情報量ゼロの行を見分ける（既知課題1）");
{
  check("数値が1つも無ければ情報量ゼロ", isInformationFree(row({
    dilution: blank, usageTiming: blank, usageCount: blank, totalCount: blank,
  })) === true);
  check("希釈だけでもあれば情報量ゼロではない", isInformationFree(row({
    usageTiming: blank, usageCount: blank, totalCount: blank,
  })) === false);
  check("総使用回数だけでもあれば情報量ゼロではない", isInformationFree(row({
    dilution: blank, usageTiming: blank, usageCount: blank,
  })) === false);
  check("使用方法だけあっても情報量ゼロ（判断の材料ではない）", isInformationFree(row({
    dilution: blank, usageTiming: blank, usageCount: blank, totalCount: blank, application: "散布",
  })) === true);
}

section("回答が触れた製品だけを常時表示にする（既知課題1）");
{
  const facts = [row(), row({ productName: "別の薬剤", pestName: "うどんこ病" })];
  const { shown, folded } = prepareRegistrationFacts(facts, "テスト殺菌剤フロアブルを1000倍で散布します。");
  check("本文に出た製品は常時表示", shown.length === 1 && shown[0].productName === "テスト殺菌剤フロアブル");
  check("触れていない製品は畳む", folded.length === 1 && folded[0].productName === "別の薬剤");
}
{
  const facts = [row(), row({ productName: "別の薬剤" })];
  const { shown, folded } = prepareRegistrationFacts(facts, "ぶどうの植え付けは11月から3月が目安です。");
  check("農薬と無関係な回答では1枚も常時表示にしない", shown.length === 0);
  check("それでも原文は畳んだ側に全部残る", folded.length === 2);
}
{
  const facts = [row({ dilution: blank, usageTiming: blank, usageCount: blank, totalCount: blank })];
  const { shown, folded } = prepareRegistrationFacts(facts, "テスト殺菌剤フロアブルが登録されています。");
  check("本文に出ても情報量ゼロなら常時表示にしない", shown.length === 0 && folded.length === 1);
}
{
  const { shown, folded } = prepareRegistrationFacts(null, "なんらかの回答");
  check("null は空（保存前の行や古い行で落ちない）", shown.length === 0 && folded.length === 0);
}
{
  const { shown, folded } = prepareRegistrationFacts([row()], "");
  check("本文が空でも落ちず、畳んだ側に残る", shown.length === 0 && folded.length === 1);
}

section("カードを捨てない（最重要）");
{
  const facts = [
    row({ pestName: "べと病" }),
    row({ pestName: "黒とう病" }),
    row({ productName: "別の薬剤", pestName: "うどんこ病", dilution: "500倍" }),
    row({ productName: "3つ目", pestName: "灰色かび病", usageCount: "1回" }),
  ];
  const { shown, folded } = prepareRegistrationFacts(facts, "別の薬剤を使います。");
  const all = [...shown, ...folded];
  check("4行が3枚にまとまる（重複1件ぶんだけ減る）", all.length === 3);
  const pests = all.flatMap(f => f.pestNames);
  check("病害虫名は1つも失われない", ["べと病", "黒とう病", "うどんこ病", "灰色かび病"].every(p => pests.includes(p)));
  const names = new Set(all.map(f => f.productName));
  check("製品名は1つも失われない", names.size === 3);
}

console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
