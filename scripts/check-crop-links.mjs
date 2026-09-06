// crops.famic_crop_name の紐付けが妥当かを検査する（読み取り専用）。
//
//   node scripts/check-crop-links.mjs          # 本番を検査（.env.local の SUPABASE_DB_PASSWORD を使う）
//   node scripts/check-crop-links.mjs --test   # 検知ロジック自体の自己テスト
//
// なぜ要るか: 2026-09-06 に本番で「ほうれん草 → ぶどう」という紐付けが見つかった
// （docs/decisions/20260824-plain-language-and-crop-mapping.md の追記）。この状態では
// ぶどうの適用行がほうれん草の基準として提示される。農薬の使用基準の遵守は法的義務なので、
// 「上限が出ない」より明確に悪い。しかも画面上は普通に動いて見えるため気づけない。
//
// 検査の考え方: 保存されている値が、作物名から `src/lib/cropAlias.ts` の
// 「正規化しての完全一致」または「人が作った別名表」で導けるか。導けない値は
// **誤りとは断定せず「要確認」**として出す —— 別名表に無い品種名を人が正しく
// 紐付けている場合もあるため。判定を厳しくしすぎると、正しい手動紐付けを消させてしまう。
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { matchCropName } = await import(pathToFileURL(process.cwd() + "/src/lib/cropAlias.ts").href);

/** 1件ぶんの判定。candidates は pesticide_registrations.crop_name の実在リスト */
export function judge(crop, candidates) {
  if (!crop.famic_crop_name) return { level: "skip", note: "未設定（判定不可として扱われる）" };
  const derived = matchCropName(crop.name, candidates).famicCropName;
  if (derived === crop.famic_crop_name) return { level: "ok", note: "作物名から導ける" };
  if (derived == null) {
    return { level: "warn", note: `作物名「${crop.name}」からは導けない値。人が確認した紐付けか要確認` };
  }
  return { level: "error", note: `作物名からは「${derived}」が導ける。別の作物の基準を出している疑い` };
}

if (process.argv.includes("--test")) {
  const CAND = ["ぶどう", "ｷｬﾍﾞﾂ", "ほうれんそう", "うめ"];
  const cases = [
    [{ name: "キャベツ", famic_crop_name: "ｷｬﾍﾞﾂ" }, "ok"],
    [{ name: "ほうれん草", famic_crop_name: "ほうれんそう" }, "ok"],
    // 2026-09-06 に本番で実際に起きていた誤り
    [{ name: "ほうれん草", famic_crop_name: "ぶどう" }, "error"],
    [{ name: "たまねぎ", famic_crop_name: null }, "skip"],
    // 別名表に無い品種名を人が紐付けた場合。誤りと断定しない
    [{ name: "きたあかり", famic_crop_name: "ばれいしょ" }, "warn"],
  ];
  let ng = 0;
  for (const [crop, want] of cases) {
    const got = judge(crop, CAND).level;
    const ok = got === want;
    if (!ok) ng++;
    console.log(`  ${ok ? "✓" : "✗"} ${crop.name} → ${crop.famic_crop_name ?? "null"} : ${got}（期待 ${want}）`);
  }
  console.log(ng === 0 ? "\n自己テスト OK\n" : `\n自己テスト NG（${ng}件）\n`);
  process.exit(ng === 0 ? 0 : 1);
}

// ── 本番の検査 ──
// RLS は組織ごとの実ポリシーが適用済みで、anon キーでは1行も読めない。
// バックアップ（scripts/backup-db.sh）と同じ経路で直接読む。
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
  if (m) env[m[1]] = m[2];
}
if (!env.SUPABASE_DB_PASSWORD) {
  console.error(".env.local に SUPABASE_DB_PASSWORD がありません");
  process.exit(2);
}
const { execFileSync } = await import("node:child_process");
const q = sql => JSON.parse(execFileSync(
  "/opt/homebrew/opt/libpq/bin/psql",
  ["--host=aws-1-ap-northeast-1.pooler.supabase.com", "--port=5432",
   "--username=postgres.fgoyqwdwnimvyyuxoymy", "--dbname=postgres", "-At", "-c", sql],
  { env: { ...process.env, PGPASSWORD: env.SUPABASE_DB_PASSWORD }, encoding: "utf8" },
) || "[]");

const crops = q("select coalesce(json_agg(t order by t.id), '[]') from (select id, name, famic_crop_name from crops) t;");
const candidates = q("select coalesce(json_agg(distinct crop_name), '[]') from pesticide_registrations where crop_name is not null;");
console.log(`作付け ${crops.length} 件 / 登録情報の作物名 ${candidates.length} 種\n`);

let error = 0, warn = 0;
for (const c of crops) {
  const { level, note } = judge(c, candidates);
  const mark = { ok: "✓", warn: "△", error: "✗", skip: "·" }[level];
  if (level === "error") error++;
  if (level === "warn") warn++;
  console.log(`  ${mark} ${c.name} → ${c.famic_crop_name ?? "（未設定）"}  ${note}`);
}
console.log(`\n誤りの疑い ${error} 件 / 要確認 ${warn} 件`);
process.exit(error > 0 ? 1 : 0);
