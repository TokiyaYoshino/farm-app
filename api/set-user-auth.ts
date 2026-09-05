import type { ApiRequest, ApiResponse } from "./types";
import { requireAdmin, denied } from "./_auth.js";

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
  let existingAuthId: string | null = null;
  if (user_id) {
    const owns = await fetch(
      `${PROJECT_URL}/rest/v1/users?id=eq.${encodeURIComponent(String(user_id))}&select=id,organization_id,auth_id`,
      { headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE } },
    );
    const rows = owns.ok ? await owns.json() : null;
    const target = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!target) return res.status(404).json({ error: "対象の利用者が見つかりません。" });
    if (!organization_id || target.organization_id !== organization_id) {
      return res.status(403).json({ error: "他の組織の利用者は変更できません。" });
    }
    existingAuthId = typeof target.auth_id === "string" && target.auth_id ? target.auth_id : null;
  }

  // Auth ユーザーの作成 or 更新。
  // 既に auth_id がある利用者は必ず更新する。以前はここで常に新規作成していたため、
  //   - ログインIDを変えずにパスワードだけ変更 → 同じ email が既に存在して 500
  //     （＝パスワードの再設定ができない。忘れた作業者を救済できない）
  //   - ログインIDを変えて再設定 → 古い Auth ユーザーが消えずに残り、旧パスワードで
  //     有効なJWTを取得できる（api/_auth.ts の requireUser を通ってしまう）
  // という2つの問題があった。email は login_id から決まるので、更新側でも書き換える。
  const authRes = existingAuthId
    ? await fetch(`${PROJECT_URL}/auth/v1/admin/users/${encodeURIComponent(existingAuthId)}`, {
        method:  "PUT",
        headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
    : await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
        method:  "POST",
        headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
  const authData = await authRes.json();
  if (!authRes.ok) {
    const detail = String(authData.msg ?? authData.message ?? "");
    // auth_id を持たない古い users 行に、同じ email の Auth ユーザーが既に存在する場合。
    // 上記の不具合が作った孤児が該当する。原因が分かる文言にして手当てできるようにする
    if (/already|exist|registered/i.test(detail)) {
      return res.status(409).json({
        error: `このログインID（${login_id}）は Supabase Auth 側に既に登録されています。`
          + "別のIDにするか、Supabase ダッシュボード > Authentication で該当ユーザーを削除してください。",
      });
    }
    return res.status(500).json({ error: detail || "Auth ユーザーの登録に失敗しました。" });
  }
  // 更新経路でも id は返るが、返らない実装差に備えて既存の値へフォールバックする
  const authId: string = authData.id ?? existingAuthId;

  if (user_id) {
    // 既存ユーザーへの紐付け（ID・パスワード変更）
    const dbRes = await fetch(`${PROJECT_URL}/rest/v1/users?id=eq.${user_id}`, {
      method:  "PATCH",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ login_id, auth_id: authId, email }),
    });
    if (!dbRes.ok) return res.status(500).json({ error: await dbRes.text() });
    return res.status(200).json({ ok: true, auth_id: authId });
  } else {
    // 新規ユーザー作成
    if (!name || !role) return res.status(400).json({ error: "name と role は必須です" });
    if (!organization_id) return res.status(400).json({ error: "organization_id は必須です" });
    const dbRes = await fetch(`${PROJECT_URL}/rest/v1/users`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify({ name, role, login_id, auth_id: authId, email, org: org ?? "kishu", organization_id }),
    });
    if (!dbRes.ok) return res.status(500).json({ error: await dbRes.text() });
    const newUser = await dbRes.json();
    return res.status(200).json({ ok: true, user: newUser[0], auth_id: authId });
  }
}
