// 農林水産省「総合防除実践マニュアル」の取り込み済みテキストを、作物名から引く。
//
// 取り込みは scripts/fetch-maff-ipm.mjs（公共データ利用規約・CC BY 4.0 互換。
// 出典表示と加工の明記が条件なので、API のレスポンスの sources に出典を必ず載せる）。
//
// **近い作物で代用しない。** ネギ編があるからといって たまねぎ・にんにく に当てるのは、
// famic_crop_name の誤紐付けと同じ種類の誤りになる（他作物の基準を提示してしまう）。
// 対応表に無い作物は「資料なし」として扱い、LLM の一般知識に「目安」と断らせる。
import { normalizeCropName } from "../lib/cropAlias";
import { MAFF_MANUALS } from "./maffIpmData";

const MANUALS = MAFF_MANUALS;

/** 資料の作物名に寄せる別名。登録名の別名表（cropAlias）とは目的が違うので分けて持つ */
const ALIAS: Record<string, string> = {
  "かんらん": "キャベツ",
  "ぶどう": "ぶどう",
  "ブドウ": "ぶどう",
  "葡萄": "ぶどう",
};

/** API に渡す形。原文をそのまま渡し、出典を添える */
export interface AdviseReference { title: string; source: string; text: string }

/**
 * 作物名に対応する公的資料を返す。無ければ空配列（＝資料なしとして縮退）。
 * maxChars はプロンプトに載せる上限（API 側は合計12000字まで）。
 */
export function referencesForCrop(cropName: string | null | undefined, maxChars = 9000): AdviseReference[] {
  if (!cropName) return [];
  const target = normalizeCropName(ALIAS[cropName.trim()] ?? cropName);
  if (!target) return [];
  const hit = MANUALS.find(m => normalizeCropName(m.crop) === target);
  if (!hit) return [];
  const text = hit.pages.map(p => p.text).join("\n").slice(0, maxChars);
  return [{ title: hit.title, source: hit.source, text }];
}

/** 資料を持っている作物の一覧（画面の説明や動作確認に使う） */
export const manualCrops = MANUALS.map(m => m.crop);
