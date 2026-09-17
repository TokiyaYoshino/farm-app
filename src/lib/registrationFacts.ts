// 相談の回答に添える「登録のある農薬（農薬登録情報の原文）」の整形を1箇所に集約する。
//
// 背景（docs/decisions/20260912-release-line.md の既知課題2件）:
//
//   1. 質問と無関係でも常に2件が展開されていた。「ぶどうは何月に植えるのが良いか」の
//      ような農薬と関係ない質問にもカードが並ぶ。しかも全項目が「記載なし（判定不可）」＝
//      情報量ゼロのカードが出ることがある
//   2. 同じ製品が適用病害ごとに重複して並ぶ。FAMIC の適用行がそのまま1枚のカードに
//      なっているため、製品×べと病／製品×黒とう病 で同じ数値の札が2枚出る
//
// どちらも「原文を出す」方針（api/advise.ts の情報源3分類）は動かさずに直せる。
// **数値は一切書き換えない**。まとめるのは数値が完全に一致する行だけで、
// 1文字でも違えばカードは分けたまま残す —— 農薬ラベルの数値を混ぜることは、
// このモジュールが守ろうとしているもの（AIの文章の数字を信じさせない）に反するため。
//
// Web版（src/lib/）とアプリ版（expo-prototype/lib/）に同一のファイルを置く。
// 表示の食い違いを防ぐためで、pesticideUsage.ts / cropAlias.ts と同じ運用。

/** api/advise.ts の registrationFacts の1行（画面表示用に整形済みのもの） */
export interface RegistrationFactLike {
  productName: string;
  cropName: string;
  pestName: string;
  dilution: string;
  usageTiming: string;
  usageCount: string;
  totalCount: string;
  application: string;
  hasBlankLimit?: boolean;
}

/** 数値が同一の適用行をまとめたもの。pestNames 以外は元の行と同じ（原文のまま） */
export interface GroupedRegistrationFact extends RegistrationFactLike {
  /** まとまった適用病害虫。まとまらなければ1件だけ入る */
  pestNames: string[];
}

/** api/advise.ts の fieldLabel が空欄に付ける文言。変えるときは両方直す */
export const BLANK_FIELD_LABEL = "記載なし（判定不可）";

const isBlank = (s: string | undefined | null): boolean =>
  s == null || s.trim() === "" || s.trim() === BLANK_FIELD_LABEL;

/**
 * 希釈・使用時期・本剤の使用回数・総使用回数がすべて空欄の行。
 * 製品名と病害虫名しか分からず、**利用者が判断に使える数値が1つも無い**ので
 * 常時表示に値しない（消さずに畳んだ側へ置く）。
 *
 * 使用方法（application）は判断の材料ではなく手順なので、ここには数えない。
 */
export function isInformationFree(f: RegistrationFactLike): boolean {
  return isBlank(f.dilution) && isBlank(f.usageTiming)
    && isBlank(f.usageCount) && isBlank(f.totalCount);
}

/** 数値が完全一致する行だけをまとめる鍵。1文字でも違えば別カードのまま残る */
const groupKey = (f: RegistrationFactLike): string => [
  f.productName, f.dilution, f.usageTiming, f.usageCount, f.totalCount, f.application,
].join("");

/**
 * 同じ製品の適用行のうち、**数値がすべて同じもの**を1枚にまとめる。
 * 病害虫名だけが違う行は `pestNames` に並ぶ（べと病・黒とう病）。
 * 希釈や回数が違う行は、同じ製品でも別のカードとして残す。
 *
 * 並び順は元の配列の最初の出現順を保つ（FAMIC の並びを勝手に変えない）。
 */
export function groupRegistrationFacts(facts: RegistrationFactLike[]): GroupedRegistrationFact[] {
  const byKey = new Map<string, GroupedRegistrationFact>();
  for (const f of facts) {
    const key = groupKey(f);
    const hit = byKey.get(key);
    if (!hit) {
      byKey.set(key, { ...f, pestNames: isBlank(f.pestName) ? [] : [f.pestName] });
      continue;
    }
    if (!isBlank(f.pestName) && !hit.pestNames.includes(f.pestName)) hit.pestNames.push(f.pestName);
    // まとめた行のどれか1つでも判定不可なら、まとめた側も判定不可として扱う
    if (f.hasBlankLimit) hit.hasBlankLimit = true;
  }
  return [...byKey.values()];
}

/**
 * 回答本文が実際に名前を挙げている製品だけを「常時表示」に回す。
 *
 * 従来は質問の内容に関係なく先頭2件を展開していたため、農薬と無関係な相談にも
 * カードが並んでいた。回答が触れていない登録情報は、**消さずに畳む**
 * （規約: 新機能追加時に既存機能を削除しない。原文はいつでも開ける）。
 *
 * 判定は製品名がそのまま出現するかどうかだけ。表記ゆれの推測はしない ——
 * 外したときに起きるのは「回答が触れているのに畳まれる」で、原文が消えるわけではない
 * 安全側に倒れる。
 */
export function splitByMention(
  facts: GroupedRegistrationFact[],
  replyText: string,
): { shown: GroupedRegistrationFact[]; folded: GroupedRegistrationFact[] } {
  const text = (replyText ?? "").normalize("NFKC");
  const shown: GroupedRegistrationFact[] = [];
  const folded: GroupedRegistrationFact[] = [];
  for (const f of facts) {
    const name = f.productName?.normalize("NFKC").trim() ?? "";
    const mentioned = name !== "" && name !== BLANK_FIELD_LABEL && text.includes(name);
    // 情報量ゼロのカードは、名前が出ていても常時表示にはしない（数値が1つも無い）
    (mentioned && !isInformationFree(f) ? shown : folded).push(f);
  }
  return { shown, folded };
}

/**
 * 画面が使う入口。原文の配列と回答本文を渡すと、常時表示ぶんと畳むぶんに分かれる。
 * 合計件数は必ず入力の行数以下にならない（まとめはするが、どのカードも捨てない）。
 */
export function prepareRegistrationFacts(
  facts: RegistrationFactLike[] | null | undefined,
  replyText: string,
): { shown: GroupedRegistrationFact[]; folded: GroupedRegistrationFact[] } {
  if (!facts || facts.length === 0) return { shown: [], folded: [] };
  return splitByMention(groupRegistrationFacts(facts), replyText);
}
