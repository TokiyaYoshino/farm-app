/**
 * FAMIC 農薬登録情報（基本部）を pesticides_master テーブルに投入するスクリプト。
 *
 * 使い方:
 *   1. https://www.acis.famic.go.jp/ddata/index2.htm から
 *      「農薬登録情報ダウンロード > 基本部」の CSV をダウンロード
 *   2. 環境変数を設定（または .env.local に記載）:
 *        VITE_SUPABASE_URL=https://xxxx.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   3. 実行:
 *        npx tsx scripts/seed-pesticides-master.ts <csvファイルパス>
 *      例:
 *        npx tsx scripts/seed-pesticides-master.ts ~/Downloads/FAMIC_base.csv
 *
 * FAMIC 基本部 CSV の列構成（2024年版）:
 *   0: 登録番号
 *   1: 種類名
 *   2: 農薬の名称
 *   3: 製造者等の氏名又は名称
 *   ※ 希釈倍数・適用作物・適用病害虫は「適用部」CSVに記載（別途対応）
 */

import { readFileSync } from "fs";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";

// ── 環境変数の読み込み ──────────────────────────────────────
// .env.local を簡易パース
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* .env.local がなければスキップ */ }

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("❌  使い方: npx tsx scripts/seed-pesticides-master.ts <csvファイルパス>");
  process.exit(1);
}

// ── Supabase クライアント（service_role） ───────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── CSV 読み込み・変換 ──────────────────────────────────────
const raw = readFileSync(resolve(csvPath));
const utf8 = iconv.decode(raw, "Shift_JIS");

const rows = parse(utf8, {
  skip_empty_lines: true,
  relax_column_count: true,
}) as string[][];

// 先頭行がヘッダーかどうか判定（数値で始まらなければヘッダー）
const startRow = rows.length > 0 && !/^\d/.test(rows[0][0]) ? 1 : 0;
console.log(`📄  CSV 読み込み完了: ${rows.length - startRow} 件（ヘッダー${startRow}行スキップ）`);

// ── データ変換 ──────────────────────────────────────────────
type MasterRow = {
  reg_no: string;
  name: string;
  type: string | null;
  company: string | null;
  dilution_rate: string | null;
  target_crop: string | null;
  target_pest: string | null;
  is_active: boolean;
  updated_at: string;
};

const now = new Date().toISOString();
const records: MasterRow[] = [];

for (let i = startRow; i < rows.length; i++) {
  const row = rows[i];
  const reg_no = row[0]?.trim();
  const name   = row[2]?.trim();
  if (!reg_no || !name) continue;  // 必須カラムが空なら skip

  records.push({
    reg_no,
    type:          row[1]?.trim() || null,
    name,
    company:       row[3]?.trim() || null,
    dilution_rate: null,  // 基本部には含まれない（適用部を別途取得）
    target_crop:   null,
    target_pest:   null,
    is_active:     true,
    updated_at:    now,
  });
}

console.log(`✅  変換完了: ${records.length} 件`);

// ── Supabase へ upsert（100件ずつ） ────────────────────────
const CHUNK = 100;
let inserted = 0;
let errors   = 0;

for (let i = 0; i < records.length; i += CHUNK) {
  const chunk = records.slice(i, i + CHUNK);
  const { error } = await supabase
    .from("pesticides_master")
    .upsert(chunk, { onConflict: "reg_no" });

  if (error) {
    console.error(`❌  chunk ${i}〜${i + chunk.length}: ${error.message}`);
    errors++;
  } else {
    inserted += chunk.length;
    process.stdout.write(`\r📥  投入中... ${inserted}/${records.length}`);
  }
}

console.log(`\n🎉  完了: ${inserted} 件投入, ${errors} チャンクでエラー`);
