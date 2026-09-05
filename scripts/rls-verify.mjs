// RLS 実ポリシー化の前後で「anon キーだけで何が読めるか」を実測する。
//
//   適用前: 全テーブルが件数を返す（= 誰でも読める状態）
//   適用後: すべて 0 件 or 401/403 になること。1件でも返るテーブルは塞げていない。
//
// 使い方（.env.local などに VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY がある前提）:
//
//   node scripts/rls-verify.mjs
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/rls-verify.mjs
//
// ログイン中ユーザーのトークンでも検証する場合（越境の確認）:
//
//   ACCESS_TOKEN=eyJ... node scripts/rls-verify.mjs
//   （トークンは Web版の DevTools → localStorage の sb-*-auth-token 内 access_token）
//
// 何も書き込まない。GET のみ。

import { supabaseConfig, pickEnv } from "./_env.mjs";

const { url: URL_, anon: ANON } = supabaseConfig();
const TOKEN = pickEnv("ACCESS_TOKEN");


// 組織スコープであるべき表。ここが anon で読めてはいけない。
const SCOPED = [
  "users", "crops", "fields", "reports", "schedules", "pesticides", "comments",
  "settings", "projects", "tickets", "ai_outputs", "daily_weather",
  "pesticide_registrations", "organizations", "crop_advice_messages",
  "crop_advice_actions", "device_tokens",
];
// 全組織共有の読み取り専用マスタ。認証ユーザーには見えてよいが anon には見せない。
const SHARED = ["work_categories", "pesticides_master"];

/** PostgREST に件数だけ問い合わせる（本文は取得しない） */
async function count(table, token) {
  const headers = { apikey: ANON, Prefer: "count=exact", Range: "0-0" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // HEAD + count=exact：本文を持ってこない（氏名等の中身を取得しないため）。
  // select=id にすると id 列を持たない表で 400 になり、漏れを見落とすので select=*。
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, { method: "HEAD", headers });
  if (res.status === 404) return { status: res.status, count: null, note: "テーブルが無い" };
  if (!res.ok)            return { status: res.status, count: null, note: (await res.text()).slice(0, 80) };
  const range = res.headers.get("content-range") ?? "";      // 例: "0-0/33"
  const total = range.split("/")[1];
  return { status: res.status, count: total === "*" ? null : Number(total), note: "" };
}

const label = (r) => {
  if (r.count === null) return `${r.status} ${r.note}`;
  return `${r.count} 件`;
};

async function run(title, token) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 46 - title.length))}`);
  let leaked = 0;
  for (const t of [...SCOPED, ...SHARED]) {
    const r = await count(t, token);
    const isMaster = SHARED.includes(t);
    // anon: 何であれ件数が返ったら穴。認証済み: 共有マスタ以外は自組織のみ見える想定
    const bad = !token ? (r.count ?? 0) > 0 : false;
    if (bad) leaked++;
    console.log(`${bad ? "❌" : "  "} ${t.padEnd(24)} ${label(r)}${isMaster && !token ? "  ← 共有マスタ" : ""}`);
  }
  return leaked;
}

const leaked = await run("anon キーのみ（JWTなし）", null);
if (TOKEN) await run("ログイン中ユーザーのJWT", TOKEN);

console.log("");
if (leaked === 0) {
  console.log("✅ anon キーだけで読めるテーブルは無し。RLS は効いている");
} else {
  console.log(`❌ ${leaked} テーブルが anon キーだけで読める。RLS 未適用（docs/rls-rollout.md）`);
}
process.exit(leaked === 0 ? 0 : 1);
