// 作物名 → 農薬登録上の作物名 の自動一致。
//
// ── なぜ自動で当てるのか ─────────────────────────────────────
//
// 農薬の使いすぎチェックは、作付けの作物名を「農薬ラベル上の名前」に対応づけないと
// 動かない。以前はこれを利用者に手入力させ、未設定の理由を76文字の説明文で書いていた。
// 結果、本番の作付けは7件すべて未設定＝チェックが全件死んでいた。
//
// 説明文を短くするのではなく、聞かずに済ませるのが正解だった
// （docs/decisions/20260824-plain-language-and-crop-mapping.md）。
//
// ── 誤判定を起こさない範囲に限る ────────────────────────────
//
// 「文字列の自動マッチングは誤判定を生むため実装しない」という以前の判断
// （docs/db-schema.md / 2026-08-05-crops-famic-crop-name.sql）を覆すが、
// 覆すのは次の2つだけで、**類似度による推測は入れない**。
//
//   1. 正規化しての完全一致 …… 推測ではなく同一表記の吸収（ｷｬﾍﾞﾂ ＝ キャベツ）
//   2. 人が作った別名表 ……… コードの推測ではなく、引いて書き写した対応表
//
// どちらにも当たらなければ自動確定せず、候補を出して選んでもらう。
// 以前の判断が防ぎたかった「似ているから当てる」は入っていない。
//
// 農薬取締法の使用基準（総使用回数など）の遵守は法的義務で、誤った対応づけは
// 使用者を違反に導く。当てにいくのは確実な2つだけ、が原則。

/** 正規化: NFKC（半角カナ→全角カナ・全角英数→半角）＋ カタカナ→ひらがな
 *  ＋ 長音/中黒/空白の除去。同じ読みの表記ゆれだけを吸収する。 */
export function normalizeCropName(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    // カタカナ → ひらがな（U+30A1〜U+30F6）
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    // 長音・中黒・各種空白・区切りを落とす
    .replace(/[ー・･\s　‐‑‒–—―]/g, "");
}

/**
 * 作物名の別名表。左が農家の言い方、右が農薬登録上の名前。
 *
 * **コードによる推測ではなく、農薬登録情報の実データと突き合わせて確認したもの。**
 * 2026-08-27 に FAMIC 登録適用部の全 58,591 行から作物名 1,323 種を抽出し、
 * 右辺が実在する登録名であることを全 50 件について確認した
 * （scripts/test-crop-alias.mjs の「実在確認」節が同じ検査を再現する）。
 *
 * 正規化で吸収できるもの（キャベツ↔ｷｬﾍﾞﾂ 等）はここに書く必要がない。
 * ここに要るのは**漢字とかなの対応**のように、機械的に導けないものだけ。
 *
 * ── 載せてはいけないもの（実データで判明した失敗例）──────────
 *
 *   - **総称**: 「麦」は 大麦/小麦/裸麦 に分かれ、どれか1つに決め打ちできない
 *   - **単体の登録名が無いもの**: 「とうがらし」は FAMIC に無く、実在するのは
 *     「とうがらし類」「甘長とうがらし」等。「レモン」も登録作物名として存在しない
 *   - **別の登録名へ飛ばすもの**: 「温州みかん」は FAMIC に実在するので、
 *     別名で「みかん」へ向けると**別の作物として数えてしまう**（みかんも別に実在する）
 *
 * 迷ったら載せない。載せなければ候補提示に落ちるだけで、誤って当てるより安全。
 */
export const CROP_ALIASES: Record<string, string> = {
  // 葉茎菜
  "ほうれん草": "ほうれんそう",
  "小松菜": "こまつな",
  "白菜": "はくさい",
  "水菜": "みずな",
  "春菊": "しゅんぎく",
  "青梗菜": "ちんげんさい",
  "葱": "ねぎ",
  "玉葱": "たまねぎ",
  "玉ねぎ": "たまねぎ",
  "大蒜": "にんにく",
  "韮": "にら",
  "分葱": "わけぎ",
  // 根菜
  "大根": "だいこん",
  "人参": "にんじん",
  "牛蒡": "ごぼう",
  "蕪": "かぶ",
  "馬鈴薯": "ばれいしょ",
  "じゃがいも": "ばれいしょ",
  "ジャガイモ": "ばれいしょ",
  "薩摩芋": "かんしょ",
  "さつまいも": "かんしょ",
  "里芋": "さといも",
  "生姜": "しょうが",
  "蓮根": "れんこん",
  // 果菜
  "胡瓜": "きゅうり",
  "茄子": "なす",
  "南瓜": "かぼちゃ",
  "苺": "いちご",
  "西瓜": "すいか",
  "隠元": "いんげんまめ",
  "いんげん": "いんげんまめ",
  "枝豆": "えだまめ",
  "空豆": "そらまめ",
  "そら豆": "そらまめ",
  "豌豆": "えんどうまめ",
  "玉蜀黍": "とうもろこし",
  // 果樹
  "梅": "うめ",
  "南高梅": "うめ",
  "蜜柑": "みかん",
  "葡萄": "ぶどう",
  "桃": "もも",
  "柿": "かき",
  "梨": "なし",
  "栗": "くり",
  "無花果": "いちじく",
  "枇杷": "びわ",
  "李": "すもも",
  // 穀類
  "大豆": "だいず",
  "蕎麦": "そば",
  "落花生": "らっかせい",
};

/** 一致の出どころ。画面で扱いを変えるために区別する */
export type CropMatchSource = "exact" | "alias" | "none";

export interface CropMatch {
  /** 農薬登録上の作物名（候補のうち実在するもの）。当たらなければ null */
  famicCropName: string | null;
  source: CropMatchSource;
  /** 自動確定してよいか。none のときは false */
  confident: boolean;
}

/**
 * 作物名を、実在する登録作物名の一覧に突き合わせる。
 *
 * candidates は自組織の農薬登録情報に実在する作物名（pesticide_registrations.crop_name）。
 * **一覧に無い名前は返さない** —— 存在しない名前を設定しても使いすぎチェックは動かず、
 * 「設定したのに見張られない」という最悪の誤解を生むため。
 */
export function matchCropName(cropName: string, candidates: string[]): CropMatch {
  const target = normalizeCropName(cropName);
  if (!target) return { famicCropName: null, source: "none", confident: false };

  // 候補を正規化してから引く（ｷｬﾍﾞﾂ と キャベツ を同じものとして扱う）
  const byNorm = new Map<string, string>();
  candidates.forEach(c => {
    const n = normalizeCropName(c);
    if (n && !byNorm.has(n)) byNorm.set(n, c); // 原文を保つ（登録上の表記が正）
  });

  // 1) 正規化しての完全一致
  const exact = byNorm.get(target);
  if (exact) return { famicCropName: exact, source: "exact", confident: true };

  // 2) 別名表（漢字↔かなのように機械的に導けないもの）
  const aliasRaw = CROP_ALIASES[cropName.trim()] ?? CROP_ALIASES[cropName.normalize("NFKC").trim()];
  if (aliasRaw) {
    const hit = byNorm.get(normalizeCropName(aliasRaw));
    if (hit) return { famicCropName: hit, source: "alias", confident: true };
  }

  // 3) 当てにいかない。候補を出して選んでもらう
  return { famicCropName: null, source: "none", confident: false };
}

/** 選択肢に出す候補。登録情報に実在する作物名を重複なく、五十音順で返す */
export function cropNameCandidates(registrationCropNames: string[]): string[] {
  const seen = new Map<string, string>();
  registrationCropNames.forEach(c => {
    const t = (c ?? "").trim();
    if (!t) return;
    const n = normalizeCropName(t);
    if (n && !seen.has(n)) seen.set(n, t);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "ja"));
}
