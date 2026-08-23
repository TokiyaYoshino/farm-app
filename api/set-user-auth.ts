import type { ApiRequest, ApiResponse } from "./types";
import { requireAdmin, denied } from "./_auth";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // このエンドポイントは service_role で Auth ユーザーと users 行を作る。
  // 2026-08-23 まで無認証だったため、organization_id さえ分かれば誰でも任意の組織に
  // admin を作れる状態だった（RLS が allow_all で organizations を anon から読めるため
  // その値も入手できた）。管理者に限定し、所属組織は呼び出し元のものに固定する。
  const auth = await requireAdmin(req);
  if (!auth.ok) return denied(res, auth);

  const { user_id, name, role, login_id, password, org } = (req.body ?? {}) as {
    user_id?: number; name?: string; role?: string; login_id?: string; password?: string; org?: string;
  };
  // organization_id は body から受け取らない。呼び出した管理者の所属で固定する
  // （受け取ると他組織にユーザーを作れてしまい、認証を足した意味が消える）
  const organization_id = auth.user.organizationId;
  if (!login_id || !password) return res.status(400).json({ error: "login_id と password は必須です" });
  if (password.length < 6) return res.status(400).json({ error: "パスワードは6文字以上にしてください" });

  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const PROJECT_URL  = process.env.VITE_SUPABASE_URL!;
  const email = `${login_id}@kishu-farm.system`;

  // 既存ユーザーの更新は、対象が自組織の利用者であることを先に確かめる。
  // ID を差し替えれば他組織のユーザーのログインIDとパスワードを奪えてしまうため、
  // Auth ユーザーを作る前に弾く（作ってから失敗すると孤児の Auth ユーザーが残る）。
  if (user_id) {
    const owns = await fetch(
      `${PROJECT_URL}/rest/v1/users?id=eq.${encodeURIComponent(String(user_id))}&select=id,organization_id`,
      { headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE } },
    );
    const rows = owns.ok ? await owns.json() : null;
    const target = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!target) return res.status(404).json({ error: "対象の利用者が見つかりません。" });
    if (!organization_id || target.organization_id !== organization_id) {
      return res.status(403).json({ error: "他の組織の利用者は変更できません。" });
    }
  }

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
    if (!organization_id) return res.status(400).json({ error: "organization_id は必須です" });
    const dbRes = await fetch(`${PROJECT_URL}/rest/v1/users`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify({ name, role, login_id, auth_id: authData.id, email, org: org ?? "kishu", organization_id }),
    });
    if (!dbRes.ok) return res.status(500).json({ error: await dbRes.text() });
    const newUser = await dbRes.json();
    return res.status(200).json({ ok: true, user: newUser[0], auth_id: authData.id });
  }
}
