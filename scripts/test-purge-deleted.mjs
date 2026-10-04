// api/purge-deleted.ts の契約テスト（30日を過ぎた削除の控えを完全に消す・毎日の自動処理）。
//
//   cd ~/Projects/farm-app && node scripts/test-purge-deleted.mjs
//
// 決定: docs/decisions/20261003-adr-signup-billing-deletion.md 5節（控え30日・2026-10-04 オーナー決定）
//   - Vercel Cron からだけ呼べる（Authorization: Bearer <CRON_SECRET>）。それ以外は 401
//   - CRON_SECRET が未設定なら何もしない（誰でも呼べる状態にしない）
//   - 期限（purge_after）を過ぎた控えだけを消す
//   - 写真を先に消し、消せた控えの行だけを消す（写真が残ったまま控えだけ消えると、二度と消せなくなる）
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("types.js")) return next(specifier.replace(/types\.js$/, "types.ts"), context);
    return next(specifier, context);
  },
});

process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.CRON_SECRET = "cron-secret-for-test";

const handler = (await import(pathToFileURL(new URL("../api/purge-deleted.ts", import.meta.url).pathname).href)).default;

let pass = 0, fail = 0;
const t = (name, cond, note = "") => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name, note)); };

function fake({ expired, storageOk = true }) {
  const calls = [];
  globalThis.fetch = async (u, opts = {}) => {
    const url = decodeURIComponent(String(u));
    const method = (opts.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => "" });
    if (url.includes("/rest/v1/deleted_data_archive?") && method === "GET") return json(200, expired);
    if (url.includes("/storage/v1/object/report-images") && method === "DELETE") return json(storageOk ? 200 : 500, []);
    return json(200, null);
  };
  return calls;
}

const run = async (auth) => {
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code }; } }) };
  await handler({ method: "GET", body: null, headers: auth ? { authorization: auth } : {} }, res);
  return out;
};

console.log("\n1. 呼べる相手:");
{
  const calls = fake({ expired: [] });
  t("Authorization 無しは 401", (await run(null))?.code === 401);
  t("違う秘密は 401", (await run("Bearer wrong"))?.code === 401);
  t("401 のときは何も読まない", !calls.some(c => c.url.includes("/rest/v1/")));
  const saved = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
  t("CRON_SECRET 未設定なら正しそうな値でも 401", (await run("Bearer undefined"))?.code === 401);
  process.env.CRON_SECRET = saved;
}

console.log("\n2. 消すもの:");
{
  const calls = fake({ expired: [
    { id: "a1", storage_paths: ["1-x.jpg", "2-y.jpg"] },
    { id: "a2", storage_paths: [] },
  ] });
  const r = await run("Bearer cron-secret-for-test");
  t("200", r?.code === 200, JSON.stringify(r));
  const sel = calls.find(c => c.method === "GET" && c.url.includes("/rest/v1/deleted_data_archive?"));
  t("期限を過ぎた控えだけを引く", /purge_after=lt\./.test(sel?.url ?? ""), sel?.url);
  const rm = calls.find(c => c.method === "DELETE" && c.url.includes("/storage/v1/object/report-images"));
  t("控えに書かれた写真を消す", JSON.stringify(rm?.body?.prefixes) === JSON.stringify(["1-x.jpg", "2-y.jpg"]), JSON.stringify(rm?.body));
  const del = calls.find(c => c.method === "DELETE" && c.url.includes("/rest/v1/deleted_data_archive?"));
  t("両方の控えの行を消す", /id=in\.\(a1,a2\)/.test(del?.url ?? ""), del?.url);
  t("写真を消してから行を消す", calls.indexOf(rm) < calls.indexOf(del));
  t("消した件数を返す", r?.body?.purged === 2);
}
{
  const calls = fake({ expired: [
    { id: "a1", storage_paths: ["1-x.jpg"] },
    { id: "a2", storage_paths: [] },
  ], storageOk: false });
  const r = await run("Bearer cron-secret-for-test");
  const del = calls.find(c => c.method === "DELETE" && c.url.includes("/rest/v1/deleted_data_archive?"));
  t("写真を消せなかった控えは残す（翌日やり直す）", del && !/a1/.test(del.url) && /a2/.test(del.url), del?.url);
  t("消せた件数だけを返す", r?.body?.purged === 1, JSON.stringify(r?.body));
}
{
  const calls = fake({ expired: [] });
  const r = await run("Bearer cron-secret-for-test");
  t("期限切れが無ければ何も消さない", r?.code === 200 && !calls.some(c => c.method === "DELETE"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
