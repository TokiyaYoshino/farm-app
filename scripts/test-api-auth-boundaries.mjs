// api/notify-line.ts と api/diagnose-image.ts の**認可の境界**の検証。
//
//   cd ~/Projects/farm-app && node scripts/test-api-auth-boundaries.mjs
//
// 2026-09-13 のセキュリティ棚卸しで見つかった2件を固定する。
//   1. notify-line が organization_id を **body から** 受け取っていた。
//      ログイン済みなら誰でも他組織の LINE トークンを引かせ、その組織の
//      グループに任意のメッセージを送れた。set-user-auth は同じ穴を
//      「body から受け取らない」で塞いでいるのに、ここだけ残っていた
//   2. diagnose-image の imageUrl が `^https?://` しか見ておらず、
//      サーバーが任意のURLを取りに行っていた（SSRF）。エラー文言が
//      「到達不可 / 画像でない」を区別するので当たり判定にも使えた
//
// LLM の出力品質ではなく、**サーバー側で固定している契約**だけを見る。
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("_auth.js")) return next(specifier.replace(/_auth\.js$/, "_auth.ts"), context);
    if (specifier.endsWith("types.js")) return next(specifier.replace(/types\.js$/, "types.ts"), context);
    return next(specifier, context);
  },
});

process.env.OPENAI_API_KEY = "test-key";
process.env.VITE_SUPABASE_URL = "https://test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "env-token";
process.env.LINE_GROUP_ID = "env-group";

const MY_ORG    = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("  ✓", name)) : (fail++, console.log("  ✗", name)); };

const url = u => String(u);
const authOk = () => ({ ok: true, status: 200, json: async () => ({ id: "auth-1", email: "t@example.com" }), text: async () => "" });

const call = async (handler, body) => {
  let out = null;
  const res = { status: code => ({ json: b => { out = { code, body: b }; }, end: () => { out = { code, body: null }; } }) };
  await handler({ method: "POST", body, headers: { authorization: "Bearer test-token" } }, res);
  return out;
};

// ── 1. notify-line: 通知先は「呼び出した人の所属」で決まる ──────────────
console.log("\nnotify-line: 通知先の決定（なりすまし防止）:");
{
  const notify = (await import(pathToFileURL(new URL("../api/notify-line.ts", import.meta.url).pathname).href)).default;

  // 組織ごとの LINE 設定。OTHER_ORG が引かれたら「なりすましが成立した」ということ
  const ORG_CONF = {
    [MY_ORG]:    { line_channel_token: "my-token",    line_group_id: "my-group" },
    [OTHER_ORG]: { line_channel_token: "other-token", line_group_id: "other-group" },
  };

  let queriedOrgIds = [], sentTo = null;
  globalThis.fetch = async (u, opts) => {
    if (url(u).includes("/auth/v1/user")) return authOk();
    if (url(u).includes("/rest/v1/users")) {
      // 呼び出し元は MY_ORG 所属の作業者
      return { ok: true, json: async () => [{ id: 7, role: "worker", organization_id: MY_ORG, name: "テスト" }], text: async () => "" };
    }
    if (url(u).includes("/rest/v1/organizations")) {
      const m = /id=eq\.([^&]+)/.exec(url(u));
      queriedOrgIds.push(m?.[1]);
      return { ok: true, json: async () => [ORG_CONF[m?.[1]] ?? {}], text: async () => "" };
    }
    if (url(u).includes("api.line.me")) {
      sentTo = { auth: opts.headers.Authorization, to: JSON.parse(opts.body).to };
      return { ok: true, json: async () => ({}), text: async () => "" };
    }
    throw new Error("想定外の fetch: " + url(u));
  };

  // 他組織の id を body に入れて呼ぶ（攻撃のかたち）
  queriedOrgIds = []; sentTo = null;
  const r = await call(notify, { message: "なりすまし", organization_id: OTHER_ORG });
  t("正常に応答する（拒否ではなく、無視して自分の組織に送る）", r?.code === 200);
  t("body の organization_id では organizations を引かない", !queriedOrgIds.includes(OTHER_ORG));
  t("呼び出し元の所属（MY_ORG）で引く", queriedOrgIds.includes(MY_ORG));
  t("他組織のトークンを使わない", sentTo?.auth !== "Bearer other-token");
  t("他組織のグループへ送らない", sentTo?.to !== "other-group");
  t("自分の組織のトークンで送る", sentTo?.auth === "Bearer my-token");
  t("自分の組織のグループへ送る", sentTo?.to === "my-group");

  // 組織が解決できないときは環境変数にフォールバック（既存の単一農場運用を壊さない）
  globalThis.fetch = async (u, opts) => {
    if (url(u).includes("/auth/v1/user")) return authOk();
    if (url(u).includes("/rest/v1/users")) return { ok: true, json: async () => [{ id: 7, role: "worker", organization_id: null, name: "テスト" }], text: async () => "" };
    if (url(u).includes("/rest/v1/organizations")) throw new Error("organizations を引いてはいけない");
    if (url(u).includes("api.line.me")) { sentTo = { auth: opts.headers.Authorization, to: JSON.parse(opts.body).to }; return { ok: true, json: async () => ({}), text: async () => "" }; }
    throw new Error("想定外の fetch: " + url(u));
  };
  sentTo = null;
  const r2 = await call(notify, { message: "組織なし", organization_id: OTHER_ORG });
  t("所属が無ければ環境変数にフォールバックする", r2?.code === 200 && sentTo?.auth === "Bearer env-token" && sentTo?.to === "env-group");
}

// ── 2. diagnose-image: 取りに行く先を自分のストレージに限る ──────────────
console.log("\ndiagnose-image: 取得先の制限（SSRF防止）:");
{
  const diag = (await import(pathToFileURL(new URL("../api/diagnose-image.ts", import.meta.url).pathname).href)).default;

  let fetched = [];
  globalThis.fetch = async (u, opts) => {
    if (url(u).includes("/auth/v1/user")) return authOk();
    // 自分の Supabase を引く内部呼び出し（日次上限の集計・利用者行の解決）は外部フェッチではない
    if (url(u).includes("/rest/v1/")) return { ok: true, json: async () => [], text: async () => "" };
    if (url(u).includes("api.openai.com")) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ possibilities: [], observations: [], next_actions: [] }) } }], usage: {} }), text: async () => "" };
    }
    fetched.push(url(u));
    return { ok: true, status: 200, headers: { get: () => "image/jpeg" }, body: null, text: async () => "" };
  };

  const OWN = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/report-images/a.jpg`;
  const cases = [
    ["自分のストレージのURLは通る",            OWN,                                              true],
    ["署名付きURLの形も通る",                  `${process.env.VITE_SUPABASE_URL}/storage/v1/object/sign/report-images/a.jpg?token=x`, true],
    ["外部サイトは弾く",                        "https://evil.example.com/a.jpg",                 false],
    ["内部ネットワークは弾く",                  "http://169.254.169.254/latest/meta-data/",        false],
    ["localhost は弾く",                        "http://127.0.0.1:6379/",                         false],
    ["自分のURLに似せた別ホストは弾く",         "https://test.supabase.invalid.evil.com/storage/v1/object/public/x.jpg", false],
    ["ストレージ以外のパスは弾く",              `${process.env.VITE_SUPABASE_URL}/rest/v1/users`,  false],
  ];
  for (const [name, imageUrl, allowed] of cases) {
    fetched = [];
    const r = await call(diag, { imageUrl });
    // 契約は「弾いたURLをサーバーが取りに行かないこと」。内部呼び出しの有無は問わない
    if (allowed) t(name, r?.code !== 400);
    else t(name, r?.code === 400 && !fetched.includes(imageUrl));
  }

}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
