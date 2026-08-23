// 農薬登録情報API（Vercel Serverless Function / Node.js）
//
// FAMIC「農薬登録情報ダウンロード」の登録適用部CSVから、指定された農薬の適用情報
// （作物名・適用病害虫雑草名・希釈倍数・使用時期・使用回数・使用方法）を引く。
//   https://www.acis.famic.go.jp/ddata/index2.htm
//
// サーバー側に置く理由: FAMICのZIPにCORSヘッダが無く、ブラウザから直接取得できないため。
//
// 実測（2026-07-31・docs/decision-log.md）:
//   登録適用部一 ZIP 684KB → CSV 10.0MB / 58,590行、登録適用部二 ZIP 460KB → CSV 8.1MB / 41,746行。
//   CP932、25列、引用符なし。全件でも計10万行・18MBなのでFunction内で扱える。
//
// 依存を足さずに済ませている点:
//   - ZIP解凍: 単一ファイルのDeflateなので中央ディレクトリを読んで zlib.inflateRawSync に渡す
//     （ローカルヘッダは data descriptor 形式でサイズが0のため、中央ディレクトリ側を使う）
//   - Shift_JIS: Node の TextDecoder('shift_jis') が標準対応
//   - CSV: 引用符が1つも含まれないことを実データで確認済みのため単純分割でよい

import zlib from "node:zlib";
import type { ApiRequest, ApiResponse } from "./types";
import { requireUser, denied } from "./_auth";

const FAMIC_INDEX = "https://www.acis.famic.go.jp/ddata/index2.htm";
const FAMIC_BASE = "https://www.acis.famic.go.jp/ddata/";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // FAMICの更新は月2回なので6時間で十分

// 登録適用部の列（実データのヘッダ順）
const COL = {
  registrationNo: 0,
  productName: 3,
  cropName: 5,
  pestName: 7,
  dilution: 9,
  usageTiming: 11,
  usageCount: 12,
  application: 13,
  totalCount: 20,
} as const;

interface ProductEntry { registration_no: string; product_name: string; norm: string }
interface CsvCache { headers: string[]; lines: string[]; products: ProductEntry[]; fetchedAt: number }
// モジュールスコープのキャッシュ。Fluid Compute はインスタンスを使い回すため、
// 2回目以降の呼び出しはダウンロード・解凍をスキップできる。
let cache: CsvCache | null = null;

// FAMICのCSVはカタカナが全編半角（例「ﾎﾞﾙﾄﾞｰ」「ｸﾐｱｲｽﾐﾁｵﾝ乳剤」）で、
// 利用者が入力する全角（「ボルドー」）とそのままでは一致しない。NFKCで揃えてから突き合わせる。
// 保存する product_name は登録上の正式表記なので正規化せず原文のまま返す。
const norm = (s: string): string => s.normalize("NFKC").toLowerCase();

/** 単一ファイルZIPのDeflateデータを中央ディレクトリ経由で取り出す */
function unzipSingleFile(buf: Buffer): Buffer {
  // EOCD（End of Central Directory）を末尾から探す
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP: EOCD not found");

  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("ZIP: bad central directory");

  const method = buf.readUInt16LE(cdOffset + 10);
  if (method !== 8) throw new Error(`ZIP: unsupported method ${method}`);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);

  // 実データ位置はローカルヘッダのファイル名長・拡張領域長を足して求める
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  return zlib.inflateRawSync(buf.subarray(start, start + compSize));
}

/**
 * 現在配布中の登録適用部ZIPのURLを解決する。
 * ファイル名は更新日が入って変わる（例 R0807221.zip）ため、一覧ページから拾う。
 * 末尾の連番が 1・2 のものが登録適用部一・二（0 は登録基本部なので使わない）。
 * 一覧ページ自体はUTF-8（CSV本体のCP932とは別）。
 */
async function resolveAppendixUrls(): Promise<string[]> {
  const r = await fetch(FAMIC_INDEX, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`FAMIC index fetch failed: ${r.status}`);
  const html = await r.text();
  const found = new Set<string>();
  for (const m of html.matchAll(/datacsv\/(R\d+[12])\.zip/g)) found.add(m[1]);
  const names = Array.from(found).sort();
  if (names.length === 0) throw new Error("FAMIC index: appendix zip links not found");
  return names.map(n => `${FAMIC_BASE}datacsv/${n}.zip`);
}

async function loadCsv(): Promise<CsvCache> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;

  const urls = await resolveAppendixUrls();
  const decoder = new TextDecoder("shift_jis");
  let headers: string[] = [];
  const lines: string[] = [];

  for (const url of urls) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`FAMIC csv fetch failed: ${url} ${r.status}`);
    const csv = decoder.decode(unzipSingleFile(Buffer.from(await r.arrayBuffer())));
    const rows = csv.split(/\r?\n/);
    if (headers.length === 0 && rows[0]) headers = rows[0].split(",");
    // 各ファイルの1行目はヘッダなので落とす
    for (let i = 1; i < rows.length; i++) if (rows[i]) lines.push(rows[i]);
  }

  // 名称検索用に登録番号ごとの農薬名を一度だけ index 化する（適用行10万件に対し名称は数千件）
  const byNo = new Map<string, ProductEntry>();
  for (const l of lines) {
    const c = l.split(",");
    const registration_no = c[COL.registrationNo];
    const product_name = c[COL.productName];
    if (!registration_no || !product_name || byNo.has(registration_no)) continue;
    byNo.set(registration_no, { registration_no, product_name, norm: norm(product_name) });
  }

  cache = { headers, lines, products: Array.from(byNo.values()), fetchedAt: Date.now() };
  return cache;
}

function toRow(line: string, headers: string[]) {
  const c = line.split(",");
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => { if (c[i]) raw[h] = c[i]; });
  return {
    registration_no: c[COL.registrationNo] ?? "",
    product_name:    c[COL.productName] ?? "",
    crop_name:       c[COL.cropName] ?? "",
    pest_name:       c[COL.pestName] ?? "",
    dilution:        c[COL.dilution] ?? "",
    usage_timing:    c[COL.usageTiming] ?? "",
    usage_count:     c[COL.usageCount] ?? "",
    total_count:     c[COL.totalCount] ?? "",
    application:     c[COL.application] ?? "",
    raw,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと OpenAI キーの踏み台にされるため、ログイン済みユーザーに限定する（api/_auth.ts）
  const auth = await requireUser(req);
  if (!auth.ok) return denied(res, auth);

  const { registrationNo, name } = (req.body ?? {}) as { registrationNo?: string; name?: string };
  const no = typeof registrationNo === "string" ? registrationNo.trim() : "";
  const q = typeof name === "string" ? name.trim() : "";
  if (!no && !q) return res.status(400).json({ error: "registrationNo または name が必要です" });

  let csv: CsvCache;
  try {
    csv = await loadCsv();
  } catch (e) {
    console.error("FAMIC load failed:", e);
    return res.status(502).json({ error: "農薬登録情報を取得できませんでした。時間をおいて再度お試しください。" });
  }

  // 登録番号指定: その農薬の適用情報をすべて返す
  if (no) {
    if (!/^\d+$/.test(no)) return res.status(400).json({ error: "登録番号は数字で指定してください" });
    const prefix = `${no},`;
    const rows = csv.lines.filter(l => l.startsWith(prefix)).map(l => toRow(l, csv.headers));
    return res.status(200).json({ registrationNo: no, count: rows.length, rows });
  }

  // 名称検索: 登録番号を引き当てるための候補一覧（適用行そのものは返さない）
  const nq = norm(q);
  const candidates = csv.products
    .filter(p => p.norm.includes(nq))
    .slice(0, 30)
    .map(({ registration_no, product_name }) => ({ registration_no, product_name }));
  return res.status(200).json({ query: q, count: candidates.length, candidates });
}
