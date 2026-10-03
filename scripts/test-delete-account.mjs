// api/delete-account.ts の契約テスト（アプリ内アカウント削除・Apple ガイドライン 5.1.1(v)）。
//
//   cd ~/Projects/farm-app && node scripts/test-delete-account.mjs
//
// 決定: docs/decisions/20261003-adr-signup-billing-deletion.md 5節
//   - 消す相手は**呼び出した本人（とその農場）だけ**。body から利用者・組織を受け取らない
//   - 本人だけ消す: ログイン（Auth ユーザー）と端末トークンを消す。users 行は**氏名を残し**、
//     ログインに使う login_id・email・auth_id を空にする（農場の記録の記入者を壊さない。2026-10-03 オーナー決定）
//   - 他に利用者がいる農場の唯一の管理者は、本人だけは消せない（409 last_admin）
//   - 農場に1人だけなら、本人だけでなく農場ごと消す必要がある（409 sole_member）
//   - 農場ごと消す: 管理者のみ・confirm が "delete-farm" のときだけ。
//     行の削除はDB関数 delete_organization_data で1トランザクション。その後に写真と全員のログインを消す
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("_auth.js")) return next(specifier.replace(/_auth\.js$/, "_auth.ts"), context);
    if (specifier.endsWith("types.js")) return next(specifier.replace(/types\.js$/, "types.ts"), context);
    return next(specifier, context);
  },
});

process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const MY_ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";
const ME_AUTH = "aaaaaaaa-0000-0000-0000-000000000001";

const handler = (await import(pathToFileURL(new URL("../api/delete-account.ts", import.meta.url).pathname).href)).default;

let pass = 0, fail = 0;
const t = (name, cond, note = "") => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name, note)); };

/**
 * 偽の Supabase。me = 呼び出した本人の users 行、members = 同じ農場の users 行（本人を含む）。
 * 叩かれた要求をすべて calls に控える。
 */
function fakeSupabase({ me, members, reports = [], rpcOk = true }) {
  const calls = [];
  globalThis.fetch = async (u, opts = {}) => {
    const url = decodeURIComponent(String(u));
    const method = (opts.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.endsWith("/auth/v1/user")) return json(200, { id: ME_AUTH, email: "me@example.com" });
    if (url.includes("/rest/v1/users?auth_id=eq.") && method === "GET") return json(200, [me]);
    if (url.includes("/rest/v1/users?organization_id=eq.") && method === "GET") return json(200, members);
    if (url.includes("/rest/v1/reports?") && method === "GET") return json(200, reports);
    if (url.includes("/rest/v1/rpc/delete_organization_data")) return json(rpcOk ? 200 : 500, rpcOk ? null : { message: "boom" });
    return json(200, []);
  };
  return calls;
}

const call = async (body) => {
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code, body: null }; } }) };
  await handler({ method: "POST", body, headers: { authorization: "Bearer user-token" } }, res);
  return out;
};

const meWorker = { id: 10, role: "worker", organization_id: MY_ORG, name: "作業者A", auth_id: ME_AUTH };
const meAdmin = { ...meWorker, role: "admin", name: "管理者A" };
const otherWorker = { id: 11, role: "worker", organization_id: MY_ORG, name: "作業者B", auth_id: "bbbb" };
const otherAdmin = { id: 12, role: "admin", organization_id: MY_ORG, name: "管理者B", auth_id: "cccc" };

const writes = calls => calls.filter(c => c.method !== "GET" && !c.url.endsWith("/auth/v1/user"));

// ── 1. 作業者が自分を消す ─────────────────────────────────────
console.log("\n1. 作業者が自分を消す:");
{
  const calls = fakeSupabase({ me: meWorker, members: [otherAdmin, meWorker] });
  const r = await call({ scope: "self", user_id: 999, organization_id: OTHER_ORG });
  t("200 で成功", r?.code === 200, JSON.stringify(r));
  const patch = calls.find(c => c.method === "PATCH" && c.url.includes("/rest/v1/users?"));
  t("users 行は本人の id だけを更新（body の user_id は無視）", patch?.url.includes("id=eq.10") && !patch.url.includes("999"), patch?.url);
  t("氏名は残す（name を送らない）", patch && !("name" in patch.body));
  t("ログインに使う login_id・email・auth_id を空にする",
    patch?.body.login_id === null && patch?.body.email === null && patch?.body.auth_id === null, JSON.stringify(patch?.body));
  t("端末トークンは本人の分だけ消す", calls.some(c => c.method === "DELETE" && c.url.includes("/rest/v1/device_tokens?user_id=eq.10")));
  t("Auth ユーザーは本人だけ消す", calls.some(c => c.method === "DELETE" && c.url.endsWith(`/auth/v1/admin/users/${ME_AUTH}`)));
  t("他の組織には一切触れない", !calls.some(c => c.url.includes(OTHER_ORG)));
  t("農場のデータは消さない（関数を呼ばない）", !calls.some(c => c.url.includes("delete_organization_data")));
}

// ── 2. 唯一の管理者は自分だけ消せない ─────────────────────────
console.log("\n2. 他に利用者がいる農場の唯一の管理者:");
{
  const calls = fakeSupabase({ me: meAdmin, members: [meAdmin, otherWorker] });
  const r = await call({ scope: "self" });
  t("409 last_admin", r?.code === 409 && r.body?.code === "last_admin", JSON.stringify(r));
  t("何も書き換えない", writes(calls).length === 0, JSON.stringify(writes(calls)));
}
{
  const calls = fakeSupabase({ me: meAdmin, members: [meAdmin, otherAdmin, otherWorker] });
  const r = await call({ scope: "self" });
  t("他にも管理者がいれば自分だけ消せる", r?.code === 200, JSON.stringify(r));
  t("その場合も農場のデータは消さない", !calls.some(c => c.url.includes("delete_organization_data")));
}

// ── 3. 1人農場は農場ごと消す必要がある ─────────────────────────
console.log("\n3. 農場に1人だけ:");
{
  const calls = fakeSupabase({ me: meAdmin, members: [meAdmin] });
  const r = await call({ scope: "self" });
  t("409 sole_member（農場ごと消す確認へ誘導）", r?.code === 409 && r.body?.code === "sole_member", JSON.stringify(r));
  t("何も書き換えない", writes(calls).length === 0);
}

// ── 4. 農場ごと消す ───────────────────────────────────────────
console.log("\n4. 農場ごと消す:");
{
  const calls = fakeSupabase({ me: meWorker, members: [otherAdmin, meWorker] });
  const r = await call({ scope: "farm", confirm: "delete-farm" });
  t("作業者は農場を消せない（403）", r?.code === 403);
  t("何も書き換えない", writes(calls).length === 0);
}
{
  const calls = fakeSupabase({ me: meAdmin, members: [meAdmin] });
  const r = await call({ scope: "farm" });
  t("confirm が無ければ消さない（400）", r?.code === 400);
  t("何も書き換えない", writes(calls).length === 0);
}
{
  const img = "https://test.supabase.invalid/storage/v1/object/public/report-images/170-abc.jpg";
  const calls = fakeSupabase({
    me: meAdmin, members: [meAdmin, otherWorker],
    reports: [{ image_url: img }, { image_url: null }, { image_url: "https://example.com/x.jpg" }],
  });
  const r = await call({ scope: "farm", confirm: "delete-farm", organization_id: OTHER_ORG });
  t("200 で成功", r?.code === 200, JSON.stringify(r));
  const rpc = calls.find(c => c.url.includes("/rest/v1/rpc/delete_organization_data"));
  t("行の削除はDB関数に本人の組織を渡す（body の組織は無視）", rpc?.body?.p_org === MY_ORG, JSON.stringify(rpc?.body));
  t("他の組織には一切触れない", !calls.some(c => c.url.includes(OTHER_ORG) || JSON.stringify(c.body ?? "").includes(OTHER_ORG)));
  const rm = calls.find(c => c.method === "DELETE" && c.url.includes("/storage/v1/object/report-images"));
  t("自分の Storage の写真だけ消す（外部URLは対象外）",
    JSON.stringify(rm?.body?.prefixes) === JSON.stringify(["170-abc.jpg"]), JSON.stringify(rm?.body));
  const authDeletes = calls.filter(c => c.method === "DELETE" && c.url.includes("/auth/v1/admin/users/")).map(c => c.url.split("/").pop());
  t("農場の全員のログインを消す", authDeletes.includes(ME_AUTH) && authDeletes.includes("bbbb") && authDeletes.length === 2, JSON.stringify(authDeletes));
  const rpcIdx = calls.indexOf(rpc), firstAuth = calls.findIndex(c => c.url.includes("/auth/v1/admin/users/"));
  t("行を消してから、ログインを消す（行が残ったままログインだけ消えるのを防ぐ）", rpcIdx >= 0 && firstAuth > rpcIdx);
}
{
  const calls = fakeSupabase({ me: meAdmin, members: [meAdmin], rpcOk: false });
  const r = await call({ scope: "farm", confirm: "delete-farm" });
  t("DB関数が失敗したら 500 で止める", r?.code === 500);
  t("その場合ログインも写真も消さない",
    !calls.some(c => c.url.includes("/auth/v1/admin/users/") || c.url.includes("/storage/v1/object/")));
}

// ── 5. 認証 ───────────────────────────────────────────────────
console.log("\n5. 認証:");
{
  fakeSupabase({ me: meWorker, members: [meWorker] });
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code }; } }) };
  await handler({ method: "POST", body: { scope: "self" }, headers: {} }, res);
  t("トークン無しは 401", out?.code === 401);
  await handler({ method: "GET", body: {}, headers: { authorization: "Bearer x" } }, res);
  t("POST 以外は 405", out?.code === 405);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
