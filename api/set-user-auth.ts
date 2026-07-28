// マルチテナント化: 単一組織("kishu")前提のハードコードを撤廃し、呼び出し元から
// org / organization_id をパラメータとして受け取る。未指定時は既存の単一組織にフォールバックし、
// 挙動を変えない（organization_id 列がまだ無い/バックフィル前でも動くように、値がある時だけ書き込みに含める）。
// 詳細: docs/adr-001-multitenancy-and-ai.md, docs/decision-log.md
const FALLBACK_ORG = "kishu";
const AUTH_EMAIL_DOMAIN = "kishu-farm.system"; // Supabase Auth用の合成ドメイン（実メールボックスではない）

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { user_id, name, role, login_id, password, org, organization_id } = req.body ?? {};
  if (!login_id || !password) return res.status(400).json({ error: "login_id と password は必須です" });
  if (password.length < 6) return res.status(400).json({ error: "パスワードは6文字以上にしてください" });

  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const PROJECT_URL  = process.env.VITE_SUPABASE_URL!;
  const orgKey = org ?? FALLBACK_ORG;
  // login_id は org 横断で一意にする方針（docs/decision-log.md）のため、email もそれだけで一意になる
  const email = `${login_id}@${AUTH_EMAIL_DOMAIN}`;

  // Auth ユーザー作成
  const authRes = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const authData = await authRes.json();
  if (!authRes.ok) return res.status(500).json({ error: authData.msg ?? authData.message });

  if (user_id) {
    // 既存ユーザーへの紐付け（ID・パスワード変更）
    const dbRes = await fetch(`${PROJECT_URL}/rest/v1/users?id=eq.${user_id}`, {
      method:  "PATCH",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ login_id, auth_id: authData.id, email }),
    });
    if (!dbRes.ok) return res.status(500).json({ error: await dbRes.text() });
    return res.status(200).json({ ok: true, auth_id: authData.id });
  } else {
    // 新規ユーザー作成
    if (!name || !role) return res.status(400).json({ error: "name と role は必須です" });
    const dbRes = await fetch(`${PROJECT_URL}/rest/v1/users`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify({
        name, role, login_id, auth_id: authData.id, email, org: orgKey,
        // organization_id 列はマイグレーション適用後にのみ存在するため、値がある時だけ含める
        // （列が無い状態で余分なキーを送ると PostgREST がエラーを返すため）
        ...(organization_id ? { organization_id } : {}),
      }),
    });
    if (!dbRes.ok) return res.status(500).json({ error: await dbRes.text() });
    const newUser = await dbRes.json();
    return res.status(200).json({ ok: true, user: newUser[0], auth_id: authData.id });
  }
}
