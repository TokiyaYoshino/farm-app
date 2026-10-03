// 組織の分離が「外から」成立しているかの確認（本番 Supabase に REST で問い合わせる）。
//
//   cd ~/Projects/farm-app
//   KISHU_JWT=... ASUKA_JWT=... node scripts/check-org-isolation.mjs
//   KISHU_JWT=... ASUKA_JWT=... node scripts/check-org-isolation.mjs --write-probe   # 書き込みの越境も試す
//
// 経緯: docs/decisions/20261001-account-model-self-signup.md の B1、
//   scripts/migrations/2026-10-03-asuka-organization-split.sql の F。
//   「ポリシーを作った」記録は証拠にならないので、匿名キーと各組織の利用者のトークンで実際に叩く。
//
// 何を見るか:
//   1. 匿名キーだけでは、どのテーブルも 1 行も読めない
//   2. 2つのトークンの organization_id クレームが別々である（asuka が再ログイン済み）
//   3. 各トークンで読める行は、すべて自分の organization_id の行だけ
//   4. 相手の organization_id を明示して絞っても 0 行
//   5. （--write-probe のときだけ）相手の行を更新しようとしても 0 行しか変わらない。
//      更新内容は organization_id を「その行の今の値」にするだけなので、万一通っても値は変わらない。
//      ただし本番への書き込み要求になるので、オーナーの承認を取ってから付ける
//
// トークンの取り方: 各組織の利用者で Web（kishufarm.com）にログインし、開発者ツールのコンソールで
//   JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith("-auth-token")))).access_token
// 有効期限は最長1時間。値はチャットやファイルに貼らず、環境変数で渡すだけにする。
import { readFileSync, existsSync } from "node:fs";

// .env.local → .env の順に、未設定の変数だけ読む（値は表示しない）
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const TOKENS = { kishu: process.env.KISHU_JWT, asuka: process.env.ASUKA_JWT };
const WRITE_PROBE = process.argv.includes("--write-probe");
// トークン無しで 1. だけ見る。認証済みの分離は DB 内でロールを切り替えて確認できる（2026-10-03 はそれで確認）
const ANON_ONLY = process.argv.includes("--anon-only");

if (!URL_ || !ANON) { console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が無い"); process.exit(2); }
if (!ANON_ONLY && (!TOKENS.kishu || !TOKENS.asuka)) { console.error("KISHU_JWT と ASUKA_JWT を環境変数で渡す（取り方は先頭のコメント）"); process.exit(2); }

// organization_id 列を持つテーブル（移行SQLの付け替え対象＋天気）
const TABLES = [
  "users", "crops", "fields", "reports", "pesticides", "settings", "projects", "tickets",
  "schedules", "comments", "ai_outputs", "crop_advice_messages", "crop_advice_actions",
  "advice_threads", "device_tokens", "pesticide_registrations", "daily_weather",
];

let pass = 0, fail = 0;
const t = (name, cond, note = "") => {
  cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name, note));
};

const headers = token => ({
  apikey: ANON,
  Authorization: `Bearer ${token ?? ANON}`,
  "Content-Type": "application/json",
});

// 失敗（401/403/404 等）も「読めなかった」として扱うが、内容は返して表示に使う
const get = async (path, token) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: headers(token) });
  const body = await r.json().catch(() => null);
  return { status: r.status, rows: Array.isArray(body) ? body : [], body };
};

const claimOf = token => {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return { org: p.organization_id ?? null, sub: p.sub, exp: p.exp };
  } catch { return { org: null, sub: null, exp: null }; }
};

// jwt_organization_id()（2026-09-07）と同じ順: クレーム → 無ければ自分の users 行
const resolveOrg = async (token, c) => {
  if (c.org) return { ...c, from: "クレーム" };
  const { rows } = await get(`users?select=organization_id&auth_id=eq.${c.sub}`, token);
  return { ...c, org: rows[0]?.organization_id ?? null, from: "users 行（クレーム無し）" };
};

// ── 1. 匿名 ────────────────────────────────────────────────
console.log("\n1. 匿名キーだけでは読めない:");
for (const tb of [...TABLES, "organizations"]) {
  const { status, rows } = await get(`${tb}?select=*&limit=1`, null);
  t(`${tb}: 0 行`, rows.length === 0, `(status ${status}, ${rows.length} 行読めた)`);
}
// select=* は「1列でも権限が無ければ全体が 401」になるので、列単位の許可を見逃す。
// 2026-10-03 に users の login_id・email が anon に列単位で許可されていて、全組織分読めるのを
// この見逃しで一度素通りさせた。列を1つずつ指定して叩く
for (const col of ["id", "name", "login_id", "email", "role", "organization_id"]) {
  const { status, rows } = await get(`users?select=${col}&limit=1`, null);
  t(`users.${col}: 匿名で読めない`, rows.length === 0, `(status ${status}, ${rows.length} 行読めた)`);
}
if (ANON_ONLY) {
  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail ? 1 : 0);
}

// ── 2. クレーム ─────────────────────────────────────────────
console.log("\n2. トークンの organization_id:");
const claims = {
  kishu: await resolveOrg(TOKENS.kishu, claimOf(TOKENS.kishu)),
  asuka: await resolveOrg(TOKENS.asuka, claimOf(TOKENS.asuka)),
};
const now = Math.floor(Date.now() / 1000);
for (const k of ["kishu", "asuka"]) {
  t(`${k}: organization_id が決まる（${claims[k].from}）`, !!claims[k].org);
  t(`${k}: 期限内`, claims[k].exp && claims[k].exp > now, "(ログインし直してトークンを取り直す)");
}
t("kishu と asuka のクレームが別々（asuka が再ログイン済み）",
  claims.kishu.org && claims.asuka.org && claims.kishu.org !== claims.asuka.org,
  "(同じなら移行前か、asuka が古いトークンのまま)");
if (fail) { console.log(`\n前提が満たせないので中止: ${pass} 通過 / ${fail} 失敗`); process.exit(1); }

// ── 3・4. 認証済みの読み取り ────────────────────────────────
const sample = { kishu: {}, asuka: {} };  // 書き込み確認用に、自組織の行の id を1つずつ控える
for (const [me, other] of [["kishu", "asuka"], ["asuka", "kishu"]]) {
  console.log(`\n3・4. ${me} のトークンで読む:`);
  const myOrg = claims[me].org, otherOrg = claims[other].org;
  for (const tb of TABLES) {
    const all = await get(`${tb}?select=*&limit=1000`, TOKENS[me]);
    const foreign = all.rows.filter(r => r.organization_id !== myOrg);
    t(`${tb}: 自組織の行だけ（${all.rows.length} 行）`, foreign.length === 0,
      `(他組織の行 ${foreign.length} 件・status ${all.status})`);
    if (all.rows[0]?.id != null) sample[me][tb] = all.rows[0].id;

    const aimed = await get(`${tb}?select=*&organization_id=eq.${otherOrg}&limit=1`, TOKENS[me]);
    t(`${tb}: ${other} を指定しても 0 行`, aimed.rows.length === 0, `(${aimed.rows.length} 行読めた)`);
  }
  const orgs = await get("organizations?select=id", TOKENS[me]);
  t("organizations: 相手の組織の行が見えない", !orgs.rows.some(r => r.id === otherOrg));
}

// ── 5. 書き込み（明示したときだけ） ─────────────────────────
if (WRITE_PROBE) {
  for (const [me, other] of [["kishu", "asuka"], ["asuka", "kishu"]]) {
    console.log(`\n5. ${me} のトークンで ${other} の行を更新しようとする（値は変えない）:`);
    for (const [tb, id] of Object.entries(sample[other])) {
      const r = await fetch(`${URL_}/rest/v1/${tb}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...headers(TOKENS[me]), Prefer: "return=representation" },
        body: JSON.stringify({ organization_id: claims[other].org }),
      });
      const body = await r.json().catch(() => null);
      const changed = Array.isArray(body) ? body.length : 0;
      t(`${tb}: 0 行`, changed === 0, `(${changed} 行が更新対象になった・status ${r.status})`);
    }
  }
} else {
  console.log("\n5. 書き込みの越境は未確認（--write-probe で実行。本番への書き込み要求になるので承認を取ってから）");
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
