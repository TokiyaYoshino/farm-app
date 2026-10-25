// supabase/functions/api/index.ts（Edge Function の入口）と、移したときに書き換えた
// 農薬登録情報の ZIP 解凍（_shared/pesticide-registration.ts）の検証。
//
//   cd ~/Projects/farm-app && node scripts/test-api-router.mjs
//
// 固定したい契約:
//   1. URL の末尾で振り分ける。知らない名前は 404（ハンドラに届かない）
//   2. 各ハンドラの認証・メソッドの判定がそのまま Response の status になる
//   3. 壊れた JSON は 400 で止める
//   4. ハンドラの res.status().json() が Response の本文になる
//   5. ZIP 解凍を Buffer/zlib から DecompressionStream に替えても、適用部の行が引ける
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import assert from "node:assert";

process.env.OPENAI_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const { handle, routes } = await import(pathToFileURL(new URL("../supabase/functions/api/index.ts", import.meta.url).pathname).href);

let passed = 0, failed = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
};

const BASE = "https://test.supabase.invalid/functions/v1/api";
const post = (name, body, headers = {}) => new Request(`${BASE}/${name}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

// ── fetch のスタブ。認証と OpenAI と FAMIC を横取りする ──
const realFetch = globalThis.fetch;
let famicZip = null;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("/auth/v1/user")) {
    const auth = opts?.headers?.Authorization ?? "";
    return auth === "Bearer good-token"
      ? Response.json({ id: "test-auth-id", email: "test@example.com" })
      : new Response("{}", { status: 401 });
  }
  // 1日の上限の数え上げ。数えられなければ通す（fail-open）ので 500 を返して素通りさせる
  if (u.includes("/rest/v1/")) return new Response("[]", { status: 500 });
  if (u.includes("api.openai.com")) {
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ summary: "収穫をした。", items: ["トマトを収穫"], handover: "" }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  }
  if (u.endsWith("index2.htm")) return new Response('<a href="datacsv/R0810011.zip">一</a>');
  if (u.endsWith("R0810011.zip")) return new Response(famicZip);
  return realFetch(url, opts);
};

console.log("振り分け");
await t("移した7本がすべて登録されている", () => {
  assert.deepStrictEqual(Object.keys(routes).sort(), [
    "advise", "diagnose-image", "generate-report", "pest-control-advice",
    "pesticide-registration", "search-chat", "structure-voice",
  ]);
});
await t("知らない名前は 404", async () => {
  assert.strictEqual((await handle(post("set-user-auth", {}))).status, 404);
});
await t("Object の組み込み名（constructor 等）でも 404", async () => {
  assert.strictEqual((await handle(post("constructor", {}))).status, 404);
});

console.log("ハンドラの判定がそのまま status になる");
await t("POST 以外は 405", async () => {
  const r = await handle(new Request(`${BASE}/generate-report`, { method: "GET" }));
  assert.strictEqual(r.status, 405);
});
await t("トークン無しは 401", async () => {
  assert.strictEqual((await handle(post("generate-report", { records: "収穫" }))).status, 401);
});
await t("無効なトークンは 401", async () => {
  assert.strictEqual((await handle(post("generate-report", { records: "収穫" }, { Authorization: "Bearer bad" }))).status, 401);
});
await t("壊れた JSON は 400", async () => {
  assert.strictEqual((await handle(post("generate-report", "{", { Authorization: "Bearer good-token" }))).status, 400);
});
await t("正常系は 200 で、ハンドラの JSON が本文になる", async () => {
  const r = await handle(post("generate-report", { records: "トマトを収穫", date: "2026-10-25" }, { Authorization: "Bearer good-token" }));
  assert.strictEqual(r.status, 200);
  const d = await r.json();
  assert.ok(d.report.includes("トマトを収穫"), d.report);
});

console.log("農薬登録情報（ZIP 解凍の書き換え）");
// FAMIC と同じ形の単一ファイル ZIP を組み立てる（ローカルヘッダのサイズは 0 ＝ data descriptor 形式）
const buildZip = (fileName, data) => {
  const name = Buffer.from(fileName);
  const comp = zlib.deflateRawSync(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, comp, central, name, eocd]);
};
// 列は実データの位置（登録番号0・名称3・作物5・病害虫7・希釈9・時期11・回数12・方法13・総回数20）。ASCII なので Shift_JIS でも同じバイト列
const cols = (no, product, crop) => {
  const c = Array(25).fill("");
  Object.assign(c, { 0: no, 3: product, 5: crop, 7: "aphid", 9: "1000x", 11: "7days", 12: "3", 13: "spray", 20: "3" });
  return c.join(",");
};
famicZip = buildZip("R0810011.csv", Buffer.from([
  Array.from({ length: 25 }, (_, i) => `h${i}`).join(","),
  cols("12345", "TestEmulsion", "tomato"),
  cols("12345", "TestEmulsion", "cucumber"),
  cols("67890", "OtherPowder", "tomato"),
].join("\r\n")));

await t("登録番号で、その農薬の適用行だけが返る", async () => {
  const r = await handle(post("pesticide-registration", { registrationNo: "12345" }, { Authorization: "Bearer good-token" }));
  assert.strictEqual(r.status, 200);
  const d = await r.json();
  assert.strictEqual(d.count, 2);
  assert.deepStrictEqual(d.rows.map(x => x.crop_name).sort(), ["cucumber", "tomato"]);
  assert.strictEqual(d.rows[0].dilution, "1000x");
});
await t("名称検索で候補が返る（全角・半角を揃えて突き合わせる）", async () => {
  const r = await handle(post("pesticide-registration", { name: "ｏｔｈｅｒ" }, { Authorization: "Bearer good-token" }));
  const d = await r.json();
  assert.deepStrictEqual(d.candidates, [{ registration_no: "67890", product_name: "OtherPowder" }]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
