// crops.famic_crop_name を FAMIC 登録適用部の作物名に紐付ける（1回きりの運用スクリプト）。
//
//   cd ~/farm-app/expo-prototype && node scripts/link-famic-crop-names.mjs          # 確認のみ
//   cd ~/farm-app/expo-prototype && node scripts/link-famic-crop-names.mjs --apply  # 更新する
//
// 紐付けは「手動のみ・自動文字列マッチングはしない」と決めてある
// （docs/decisions/20260805-pesticide-precheck.md。「南高梅」≠「うめ」で誤判定すると
// 使用者を法令違反に導くため）。したがって下の MAPPING は**コードによる推測ではなく、
// FAMIC 登録適用部を1件ずつ引いて表記を確認した結果を人が書き写したもの**である。
// 新しい作物を足すときも、必ず api/pesticide-registration で実際の表記を確認してから書く。
//
// 確認に使った登録番号:
//   16823 ﾀﾞｺﾆｰﾙ1000        → たまねぎ / にんにく / ｷｬﾍﾞﾂ
//   22345 ｼﾞﾏﾝﾀﾞｲｾﾝ水和剤    → ぶどう / ｷｬﾍﾞﾂ
//   ｱﾃﾞｨｵﾝ乳剤・日本化薬ﾀﾞｲｱｼﾞﾉﾝ水和剤34 → ほうれんそう
//
// FAMIC はカタカナが半角のことがある（ｷｬﾍﾞﾂ）。突き合わせ側は NFKC で正規化するので
// 全角で入れても一致するが、この列は「FAMIC 登録適用部の作物名」なので**原文の表記を入れる**
// （画面に出たときに FAMIC 側の表記だと分かるようにするため）。
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env（gitignore 対象）から読む。EXPO_PUBLIC_* は anon key
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// crops.name → FAMIC 登録適用部の作物名（原文）
const MAPPING = {
  "ほうれん草": "ほうれんそう",
  "にんにく": "にんにく",
  "たまねぎ": "たまねぎ",
  "ぶどう": "ぶどう",
  "キャベツ": "ｷｬﾍﾞﾂ",
};

const apply = process.argv.includes("--apply");

const { data: crops, error } = await supabase
  .from("crops").select("id,name,start_date,famic_crop_name,org").order("id");
if (error) { console.error("crops の取得に失敗:", error.message); process.exit(1); }

console.log(`\n作付け ${crops.length} 件 / モード: ${apply ? "更新する（--apply）" : "確認のみ"}\n`);

const todo = [];
for (const c of crops) {
  const want = MAPPING[c.name];
  if (!want) {
    console.log(`  ? id=${c.id} ${c.org} / ${c.name} … MAPPING に無い。FAMIC の表記を確認して追記してから流す`);
    continue;
  }
  if (c.famic_crop_name === want) {
    console.log(`  = id=${c.id} ${c.org} / ${c.name} → 「${want}」既に設定済み`);
    continue;
  }
  if (c.famic_crop_name) {
    // 既に別の値が入っているものは上書きしない（人が意図して入れた可能性がある）
    console.log(`  ! id=${c.id} ${c.org} / ${c.name} → 既に「${c.famic_crop_name}」が入っている。上書きしないのでスキップ`);
    continue;
  }
  console.log(`  + id=${c.id} ${c.org} / ${c.name} → 「${want}」`);
  todo.push({ id: c.id, name: c.name, want });
}

if (todo.length === 0) { console.log("\n更新対象なし\n"); process.exit(0); }
if (!apply) {
  console.log(`\n${todo.length} 件が更新対象。実行するには --apply を付ける\n`);
  process.exit(0);
}

let ok = 0;
for (const t of todo) {
  const { error: e } = await supabase.from("crops").update({ famic_crop_name: t.want }).eq("id", t.id);
  if (e) console.error(`  ✗ id=${t.id} ${t.name}: ${e.message}`);
  else { ok++; console.log(`  ✓ id=${t.id} ${t.name} → 「${t.want}」`); }
}
console.log(`\n${ok}/${todo.length} 件を更新した\n`);
process.exit(ok === todo.length ? 0 : 1);
