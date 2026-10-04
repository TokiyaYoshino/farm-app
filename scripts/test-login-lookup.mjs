// ログイン前の login_id → email 解決の**契約**の検証。
//
//   cd ~/Projects/farm-app && node scripts/test-login-lookup.mjs
//
// 2026-10-03 に本番で見つかった漏れを固定する。
//   anon に users の login_id・email 列の SELECT が列単位で許可され、ポリシー
//   users_select_login_lookup（anon・using true）と合わせて、匿名キーで
//   GET /rest/v1/users?select=login_id,email を叩くと**全組織の利用者が一覧できた**。
//   ログイン画面が未ログインのまま login_id → email を引くために入れたもの
//   （2026-08-02-rls-policies.sql）。今は仮メールだが、自己登録が入ると本物のメールが漏れる。
//
// 直し方の契約:
//   1. security definer の関数 login_email_for(p_login_id) が、IDを知っている1件の email だけ返す
//      （text を返す。setof / table を返すと一覧の穴が戻る）
//   2. Web・Expo のログインはその RPC を呼び、users 表を直接読まない
//   3. anon の列権限とポリシーを外すのは**別ファイル**で、クライアントのデプロイ後に流す。
//      同じファイルにすると、旧クライアントが動いている間に本番のログインが止まる
//
// 本番 DB の状態は scripts/check-org-isolation.mjs --anon-only で外から見る。ここはソースの契約だけ。
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
// SQL のコメントを落として比較する（説明文中の語に反応しないように）
const sqlBody = p => read(p).replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const STEP1 = "scripts/migrations/2026-10-03-login-email-rpc.sql";
const STEP2 = "scripts/migrations/2026-10-03-login-lookup-revoke-anon.sql";

// ── 1. RPC を作るマイグレーション ───────────────────────────
console.log(`\n1. login_email_for を作る（${STEP1}）:`);
{
  const ok = existsSync(new URL(STEP1, root));
  t("ファイルがある", ok);
  const s = ok ? sqlBody(STEP1) : "";
  t("public.login_email_for(p_login_id text) を作る",
    /create or replace function public\.login_email_for\s*\(\s*p_login_id text\s*\)/.test(s));
  t("1件の text を返す（setof / table を返さない）",
    /returns text\b/.test(s) && !/returns (setof|table)\b/.test(s));
  t("security definer", /security definer/.test(s));
  t("search_path を固定する", /set search_path\s*=\s*public/.test(s));
  t("limit 1", /limit 1/.test(s));
  t("PUBLIC から execute を外し、anon に明示で付ける",
    /revoke execute on function public\.login_email_for\(text\) from public/.test(s)
    && /grant execute on function public\.login_email_for\(text\) to [^;]*\banon\b/.test(s));
  t("このファイルでは anon の権限・ポリシーを外さない（順序を逆にするとログインが止まる）",
    !/revoke select/.test(s) && !/drop policy/.test(s));
}

// ── 2. デプロイ後に流す、anon の権限を外すマイグレーション ──────
console.log(`\n2. anon の列権限とポリシーを外す（${STEP2}）:`);
{
  const ok = existsSync(new URL(STEP2, root));
  t("ファイルがある", ok);
  const s = ok ? sqlBody(STEP2) : "";
  t("anon から users の login_id・email の SELECT を外す",
    /revoke select\s*\(\s*login_id\s*,\s*email\s*\)\s*on (public\.)?users from anon/.test(s));
  t("users_select_login_lookup を落とす",
    /drop policy if exists users_select_login_lookup on (public\.)?users/.test(s));
}

// ── 3. クライアント ────────────────────────────────────────
// ログイン処理の本体だけを切り出して見る（ログイン後の users 読み込みは対象外）
const slice = (src, start, end) => {
  const i = src.indexOf(start);
  if (i < 0) return null;
  const j = src.indexOf(end, i + start.length);
  return src.slice(i, j < 0 ? undefined : j);
};
const CLIENTS = [
  { name: "Web src/App.tsx handleLogin", file: "src/App.tsx",
    start: "const handleLogin = async", end: "// ─── " },
  { name: "Expo expo-prototype/lib/store.tsx login", file: "expo-prototype/lib/store.tsx",
    start: "const login = useCallback(", end: "}, []);" },
];
for (const c of CLIENTS) {
  console.log(`\n3. ${c.name}:`);
  const body = slice(read(c.file), c.start, c.end);
  t("ログイン処理が見つかる", body !== null);
  const b = body ?? "";
  t('rpc("login_email_for", { p_login_id: … }) で email を引く',
    /\.rpc\(\s*["']login_email_for["']\s*,\s*\{\s*p_login_id\s*:/.test(b));
  t("users 表を直接読まない", !/\.from\(\s*["']users["']\s*\)/.test(b));
  t("引いた email で signInWithPassword する", /signInWithPassword\(\s*\{\s*email\s*[:,]/.test(b));
  t("見つからないときの文言は従来どおり", b.includes("ユーザーIDが見つかりません"));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
