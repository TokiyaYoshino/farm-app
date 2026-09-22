import type { ApiRequest, ApiResponse, ExternalJson } from "./types.js";

// 農場を新しく登録する（組織＋最初の管理者を同時に作る）。
//
// ── このファイルだけが未認証で叩ける ───────────────────────────
//
// api/_auth.ts が 2026-08-23 に /api/* 全部へ認証を掛けたが、セルフサインアップは
// 「まだアカウントが無い人」の入口なので原理的に認証を掛けられない。代わりに
// このファイル内で締める。
//
//   1. **入力を厳しく検証する。** login_id は文字種と長さを固定し、
//      そのまま email（`<login_id>@kishu-farm.system`）とテーブルのキーになるため
//      記号を通さない
//   2. **作成レートに上限を置く。** organizations.created_at を数えて、
//      1時間あたりの新規組織数で止める。荒らされたときに Auth ユーザーが
//      無限に増えるのを防ぐ（プレモータム1・docs/decisions/20260922-onboarding-and-signup.md）
//   3. **organization_id を body から受け取らない。** 受け取ると既存組織に
//      admin を作れてしまい、set-user-auth で塞いだ穴が復活する
//
// 作成は service_role で行う。anon に organizations / users の insert 権限は与えない
// （RLS のポリシーは触らない）。

/** 1時間あたりに作れる組織数。人力の登録なら当たらない広さにする */
const SIGNUP_RATE_LIMIT_PER_HOUR = 20;

/** login_id は email とテーブルのキーになるので、英小文字・数字・ハイフン・下線だけ通す */
const LOGIN_ID_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const PROJECT_URL  = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!PROJECT_URL || !SERVICE_ROLE) {
    console.error("signup: missing env VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "サーバー設定が不足しています。" });
  }
  const headers = {
    "Authorization": `Bearer ${SERVICE_ROLE}`,
    "apikey": SERVICE_ROLE,
    "Content-Type": "application/json",
  };

  const farmName = str(req.body?.farm_name);
  const name     = str(req.body?.name);
  const loginId  = str(req.body?.login_id).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  // ── 1. 入力検証 ───────────────────────────────────────────
  if (!farmName)               return res.status(400).json({ error: "農場の名前を入力してください。" });
  if (farmName.length > 60)    return res.status(400).json({ error: "農場の名前が長すぎます（60文字まで）。" });
  if (!name)                   return res.status(400).json({ error: "お名前を入力してください。" });
  if (name.length > 40)        return res.status(400).json({ error: "お名前が長すぎます（40文字まで）。" });
  if (!LOGIN_ID_RE.test(loginId)) {
    return res.status(400).json({ error: "ユーザーIDは英小文字・数字・ハイフン・下線で3〜32文字にしてください。" });
  }
  if (password.length < 8)     return res.status(400).json({ error: "パスワードは8文字以上にしてください。" });

  try {
    // ── 2. 作成レートの上限 ─────────────────────────────────
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const rate = await fetch(
      `${PROJECT_URL}/rest/v1/organizations?created_at=gte.${encodeURIComponent(since)}&select=id`,
      { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } },
    );
    if (rate.ok) {
      const total = Number((rate.headers.get("content-range") ?? "").split("/")[1]);
      if (Number.isFinite(total) && total >= SIGNUP_RATE_LIMIT_PER_HOUR) {
        return res.status(429).json({ error: "登録が混み合っています。時間をおいてお試しください。" });
      }
    }
    // 数えられなかったときは通す。数える側の不調で登録が全滅するほうが損害が大きい
    // （_auth.ts の checkDailyLimit と同じ fail-open の判断）

    // ── 3. ユーザーIDの重複確認 ─────────────────────────────
    // login_id は組織横断で一意（2026-07-22 決定）。Auth ユーザーを作る前に弾く
    const dup = await fetch(
      `${PROJECT_URL}/rest/v1/users?login_id=eq.${encodeURIComponent(loginId)}&select=id`,
      { headers },
    );
    if (!dup.ok) return res.status(503).json({ error: "登録できませんでした。時間をおいてお試しください。" });
    const dupRows = await dup.json();
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      return res.status(409).json({ error: "このユーザーIDは既に使われています。別のIDにしてください。" });
    }

    // ── 4. 組織を作る ──────────────────────────────────────
    // org_key はレガシーの org 文字列と対応する一意キー。login_id から作ると
    // 利用者IDが組織キーとして外から見えるので、推測できない値にする
    const orgKey = `farm-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const orgRes = await fetch(`${PROJECT_URL}/rest/v1/organizations`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ org_key: orgKey, name: farmName }),
    });
    if (!orgRes.ok) {
      console.error("signup: organizations insert failed", await orgRes.text());
      return res.status(500).json({ error: "農場を登録できませんでした。時間をおいてお試しください。" });
    }
    const orgRows: ExternalJson = await orgRes.json();
    const organizationId = Array.isArray(orgRows) && orgRows.length > 0 ? orgRows[0].id : null;
    if (!organizationId) {
      return res.status(500).json({ error: "農場を登録できませんでした。時間をおいてお試しください。" });
    }

    /** 途中で失敗したときに、作りかけを残さないための後片付け */
    const rollbackOrg = async () => {
      await fetch(`${PROJECT_URL}/rest/v1/organizations?id=eq.${organizationId}`, {
        method: "DELETE", headers,
      }).catch(() => {});
    };

    // ── 5. Auth ユーザーを作る ──────────────────────────────
    // メールは set-user-auth と同じ規則（login_id だけでログインできるようにするための内部値）
    const email = `${loginId}@kishu-farm.system`;
    const authRes = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
      method: "POST", headers,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const authData: ExternalJson = await authRes.json();
    if (!authRes.ok || !authData?.id) {
      await rollbackOrg();
      console.error("signup: auth user create failed", authData?.msg ?? authData?.message);
      return res.status(500).json({ error: "登録できませんでした。時間をおいてお試しください。" });
    }

    // ── 6. users 行を作る（最初の1人は管理者）─────────────────
    const userRes = await fetch(`${PROJECT_URL}/rest/v1/users`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        name, role: "admin", login_id: loginId, auth_id: authData.id,
        email, org: orgKey, organization_id: organizationId,
      }),
    });
    if (!userRes.ok) {
      // Auth ユーザーだけ残すと、同じIDで作り直せなくなる
      await fetch(`${PROJECT_URL}/auth/v1/admin/users/${authData.id}`, { method: "DELETE", headers })
        .catch(() => {});
      await rollbackOrg();
      console.error("signup: users insert failed", await userRes.text());
      return res.status(500).json({ error: "登録できませんでした。時間をおいてお試しください。" });
    }

    // email はクライアントが signInWithPassword に使う（login_id からの逆引きを省く）
    return res.status(200).json({ ok: true, email });
  } catch (e) {
    console.error("signup: unexpected", e);
    return res.status(503).json({ error: "登録できませんでした。時間をおいてお試しください。" });
  }
}
