import type { ApiRequest, ApiResponse } from "./types";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { user_id, name, role, login_id, password, org } = (req.body ?? {}) as {
    user_id?: number; name?: string; role?: string; login_id?: string; password?: string; org?: string;
  };
  if (!login_id || !password) return res.status(400).json({ error: "login_id と password は必須です" });
  if (password.length < 6) return res.status(400).json({ error: "パスワードは6文字以上にしてください" });

  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const PROJECT_URL  = process.env.VITE_SUPABASE_URL!;
  const email = `${login_id}@kishu-farm.system`;

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
      body: JSON.stringify({ name, role, login_id, auth_id: authData.id, email, org: org ?? "kishu" }),
    });
    if (!dbRes.ok) return res.status(500).json({ error: await dbRes.text() });
    const newUser = await dbRes.json();
    return res.status(200).json({ ok: true, user: newUser[0], auth_id: authData.id });
  }
}
