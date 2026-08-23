// src/lib/cropAlias.ts の検証（作物名 → 農薬登録上の作物名 の自動一致）。
// テストランナーを入れていないので Node の型ストリップ + assert だけで動かす。
//
//   cd ~/Projects/farm-app && node scripts/test-crop-alias.mjs
//
// 検証の主眼は「当てにいく範囲を広げていないこと」。
// 農薬の使用基準（総使用回数など）の遵守は法的義務で、誤った対応づけは
// 使用者を違反に導く。**似ているから当てる、を絶対に入れない**のがこの機能の生命線。
import { pathToFileURL } from "node:url";

const { normalizeCropName, matchCropName, cropNameCandidates, CROP_ALIASES } =
  await import(pathToFileURL(new URL("../src/lib/cropAlias.ts", import.meta.url).pathname).href);

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

// 本番の農薬登録情報に実在する作物名を模した候補
const CAND = ["ほうれんそう", "にんにく", "たまねぎ", "ぶどう", "ｷｬﾍﾞﾂ", "うめ", "うめ以外のかんきつ"];

console.log("\n正規化（同じ読みの表記ゆれだけを吸収する）:");
t("半角カナ → 全角カナ", normalizeCropName("ｷｬﾍﾞﾂ") === normalizeCropName("キャベツ"));
t("カタカナ → ひらがな", normalizeCropName("キャベツ") === normalizeCropName("きゃべつ"));
t("長音を落とす", normalizeCropName("トマトー") === normalizeCropName("トマト"));
t("前後の空白を落とす", normalizeCropName(" うめ ") === "うめ");
t("中黒を落とす", normalizeCropName("こまつ・な") === normalizeCropName("こまつな"));
t("別の作物は別のまま", normalizeCropName("うめ") !== normalizeCropName("もも"));

console.log("\n正規化での完全一致は自動確定してよい（推測ではなく同一）:");
let m = matchCropName("キャベツ", CAND);
t("キャベツ → ｷｬﾍﾞﾂ に当たる", m.famicCropName === "ｷｬﾍﾞﾂ");
t("出どころが exact", m.source === "exact");
t("自動確定してよい", m.confident === true);
t("登録上の表記を返す（原文が正）", matchCropName("きゃべつ", CAND).famicCropName === "ｷｬﾍﾞﾂ");
t("にんにくはそのまま当たる", matchCropName("にんにく", CAND).famicCropName === "にんにく");
t("ぶどうはそのまま当たる", matchCropName("ぶどう", CAND).famicCropName === "ぶどう");

console.log("\n別名表（漢字↔かなのように機械的に導けないもの）:");
m = matchCropName("ほうれん草", CAND);
t("ほうれん草 → ほうれんそう に当たる", m.famicCropName === "ほうれんそう");
t("出どころが alias", m.source === "alias");
t("自動確定してよい", m.confident === true);
t("南高梅 → うめ に当たる（品種名→登録名）", matchCropName("南高梅", CAND).famicCropName === "うめ");
t("玉ねぎ → たまねぎ に当たる", matchCropName("玉ねぎ", CAND).famicCropName === "たまねぎ");

console.log("\n当てにいかない（ここが生命線）:");
m = matchCropName("だいこん", CAND);
t("候補に無いものは自動確定しない", m.confident === false && m.famicCropName === null);
t("出どころが none", m.source === "none");
m = matchCropName("うめぼし", CAND);
t("部分一致では当てない（うめぼし ≠ うめ）", m.confident === false);
m = matchCropName("うめ", CAND);
t("うめ は うめ に当たる", m.famicCropName === "うめ");
t("うめ が「うめ以外のかんきつ」に当たらない", m.famicCropName !== "うめ以外のかんきつ");
t("空文字は当てない", matchCropName("", CAND).confident === false);
t("空白だけも当てない", matchCropName("   ", CAND).confident === false);
t("候補が空なら当てない", matchCropName("キャベツ", []).confident === false);
m = matchCropName("小松菜", CAND);
t("別名表にあっても候補に無ければ当てない", m.confident === false && m.famicCropName === null);

console.log("\n別名表そのものの健全性:");
t("空の値を持つ項目が無い", Object.values(CROP_ALIASES).every(v => typeof v === "string" && v.trim() !== ""));
t("空のキーが無い", Object.keys(CROP_ALIASES).every(k => k.trim() !== ""));
t("自分自身へ向く無意味な項目で正規化差が無いものは無い",
  Object.entries(CROP_ALIASES).every(([k, v]) => normalizeCropName(k) !== normalizeCropName(v) || k !== v));

console.log("\n候補一覧:");
const cands = cropNameCandidates(["うめ", " うめ ", "ぶどう", "", "ｷｬﾍﾞﾂ"]);
t("重複を除く（正規化して同じものは1つ）", cands.filter(c => c.trim() === "うめ").length === 1);
t("空文字を含めない", !cands.includes(""));
t("登録上の表記を保つ", cands.includes("ｷｬﾍﾞﾂ"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
