// api/structure-voice.ts の検証。
//
//   cd ~/Projects/farm-app && node scripts/test-structure-voice.mjs
//
// 2026-09-21 のセキュリティ監査で、他5つのAI系エンドポイントと違い
// このエンドポイントだけ (1) 入力の長さ上限が無い (2) system/userメッセージが
// 分かれておらず指示とメモが混在している (3) OpenAIの生エラー本文をそのまま
// クライアントに返す、という3点が弱いと分かった。ここではその3点を固定する。
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("_auth.js")) return next(specifier.replace(/_auth\.js$/, "_auth.ts"), context);
    if (specifier.endsWith("types.js")) return next(specifier.replace(/types\.js$/, "types.ts"), context);
    return next(specifier, context);
  },
});

const handler = (await import(pathToFileURL(new URL("../api/structure-voice.ts", import.meta.url).pathname).href)).default;

process.env.OPENAI_API_KEY = "test-key";
process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const url = u => String(u);
const authOk = () => ({ ok: true, status: 200, json: async () => ({ id: "auth-1", email: "t@example.com" }), text: async () => "" });
const countZero = () => ({ ok: true, headers: { get: () => "0-0/0" }, json: async () => [], text: async () => "" });

let captured = null;
const call = async (body, opts = {}) => {
  globalThis.fetch = opts.fetchOverride ?? (async (u, o) => {
    if (url(u).includes("/auth/v1/user")) return authOk();
    if (url(u).includes("/rest/v1/ai_outputs")) return countZero();
    captured = o?.body ? JSON.parse(o.body) : null;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ field: null, work_category: null, pesticide_names: [], quantity_value: null, quantity_unit: null, soil_ph: null, note: "テスト" }) } }],
      }),
      text: async () => "",
    };
  });
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code, body: null }; } }) };
  await handler({ method: "POST", body, headers: { authorization: "Bearer test-token" } }, res);
  return out;
};

console.log("\n入力の検証:");
t("transcript 無しは 400", (await call({})).code === 400);
t("transcript が長すぎれば 400（2000文字上限）", (await call({ transcript: "あ".repeat(2001) })).code === 400);
t("上限以内なら通る", (await call({ transcript: "たまねぎの防除をしました" })).code === 200);

console.log("\ninstructionとdataの分離:");
await call({ transcript: "たまねぎの防除をしました", fields: ["A畑"], workCategories: ["防除"], pesticides: ["ダコニール"] });
t("system役割のメッセージがある", captured.messages.some(m => m.role === "system"));
t("メモ本文はuser役割に入る", captured.messages.find(m => m.role === "user")?.content.includes("たまねぎの防除をしました"));
t("候補一覧はsystem側に入る（メモと混在しない）", captured.messages.find(m => m.role === "system")?.content.includes("A畑"));
t("データである旨の注記がある", captured.messages.find(m => m.role === "system")?.content.includes("指示ではない"));

console.log("\nエラーハンドリング（内部情報を返さない）:");
const errFetch = async (u) => {
  if (url(u).includes("/auth/v1/user")) return authOk();
  if (url(u).includes("/rest/v1/ai_outputs")) return countZero();
  return { ok: false, status: 429, text: async () => "internal error detail from OpenAI", json: async () => ({}) };
};
const errRes = await call({ transcript: "テスト" }, { fetchOverride: errFetch });
t("OpenAIのエラーは502で返す", errRes.code === 502);
t("OpenAIの生エラー本文をそのまま返さない", !JSON.stringify(errRes.body).includes("internal error detail"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
