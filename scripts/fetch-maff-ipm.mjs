// 農林水産省「総合防除実践マニュアル」（作目別）を取り込み、相談の材料として使える
// テキストに落とす。
//
//   npm i -D pdfjs-dist   # 初回のみ
//   node scripts/fetch-maff-ipm.mjs
//
// なぜ要るか:
//   相談の情報源3層（法令の数値=FAMIC原文 / 自農場の事実=自分のDB / 一般知識=LLMの推論）の
//   うち、3層目だけが参照元を持たず推測のままだった（docs/decisions/20260906-advice-reply-tone.md）。
//   「防除暦」は公的機関から出ていないが、**国の防除マニュアルは取り込める**
//   （docs/decisions/20260906-regional-calendar-gate.md）。
//
// ライセンス:
//   農林水産省ウェブサイトは公共データ利用規約（第1.0版・CC BY 4.0 互換）に準拠し、
//   出典表示と加工の明記をすれば複製・改変・商用利用ができる
//   （https://www.maff.go.jp/j/use/link.html）。**写真・画像は第三者の権利を含むため対象外**
//   なので、本スクリプトはテキストのみを抽出する。
//
// 取り込む作目:
//   本番の作付けと重なるものだけ。**近い作物で代用しない**——ネギ編があるからといって
//   たまねぎ・にんにくに当てるのは、famic_crop_name の誤紐付けと同じ種類の誤りになる
//   （docs/decisions/20260824-plain-language-and-crop-mapping.md の追記）。
import { writeFileSync, mkdirSync } from "node:fs";

const OUT_DIR = "src/data/maff-ipm";
const LICENSE = "公共データ利用規約（第1.0版）https://www.maff.go.jp/j/use/link.html";
const MANUAL_PAGE = "https://www.maff.go.jp/j/syouan/syokubo/gaicyu/g_ipm/";

/** crops.name の表記ゆれをこの鍵に寄せる。値は「この作目のマニュアルがある」ことを意味する */
const TARGETS = [
  { key: "キャベツ", url: "https://www.maff.go.jp/j/syouan/syokubo/gaicyu/g_ipm/attach/pdf/index-47.pdf" },
  { key: "ぶどう",   url: "https://www.maff.go.jp/j/syouan/syokubo/gaicyu/g_ipm/attach/pdf/index-56.pdf" },
];

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const extract = async (url) => {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const doc = await getDocument({ data: buf, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    const text = c.items.map(it => it.str).join("").replace(/\s+/g, " ").trim();
    if (text) pages.push({ page: i, text });
  }
  return pages;
};

mkdirSync(OUT_DIR, { recursive: true });
for (const t of TARGETS) {
  const pages = await extract(t.url);
  const out = {
    crop: t.key,
    title: `総合防除実践マニュアル ${t.key}編`,
    source: t.url,
    sourcePage: MANUAL_PAGE,
    publisher: "農林水産省",
    license: LICENSE,
    retrievedAt: new Date().toISOString().slice(0, 10),
    note: "PDFからテキストのみ抽出（図表の配置は失われる・画像は取り込まない）。原文は上記URL。",
    pages,
  };
  writeFileSync(`${OUT_DIR}/${t.key}.json`, JSON.stringify(out, null, 2));
  const chars = pages.reduce((a, p) => a + p.text.length, 0);
  console.log(`${t.key}: ${pages.length}ページ / ${chars}字 → ${OUT_DIR}/${t.key}.json`);
}
console.log("\n取り込み完了。出典表示が必要な素材なので、画面・プロンプトの両方で出典を示すこと。");
