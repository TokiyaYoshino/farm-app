export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { user_id, login_id, password } = req.body ?? {};
  if (!user_id || !login_id || !password) return res.status(400).json({ error: "missing fields" });
  if (password.length < 6) return res.status(400).json({ error: "password too short" });

  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const PROJECT_URL  = process.env.VITE_SUPABASE_URL!;

  // 内部メールアドレスを login_id から生成
  const email = `${login_id}@kishu-farm.system`;

  // Supabase Auth に管理者権限でユーザー作成
  const authRes = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const authData = await authRes.json();
  if (!authRes.ok) return res.status(500).json({ error: authData.msg ?? authData.message });

  // users テーブルを更新
  const dbRes = await fetch(`${PROJECT_URL}/rest/v1/users?id=eq.${user_id}`, {
    method:  "PATCH",
    headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ login_id, auth_id: authData.id, email }),
  });
  if (!dbRes.ok) {
    const e = await dbRes.text();
    return res.status(500).json({ error: e });
  }

  return res.status(200).json({ ok: true, auth_id: authData.id });
}
