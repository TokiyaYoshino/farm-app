import type { ApiRequest, ApiResponse } from "./types";
import { requireAppUser, denied } from "./_auth.js";

/**
 * アカウント削除。App Store Guideline 5.1.1(v) がアプリ内の削除導線を求めるため新設した。
 * 経緯と仕様: docs/decisions/20260905-account-deletion.md
 *
 * 2経路を兼ねる:
 *   - 本人による削除（user_id 省略）
 *   - 管理者による同一組織の利用者の削除（user_id 指定）
 *
 * 消すのは Auth ユーザーと users 行の2つ。device_tokens は users(id) の
 * on delete cascade で一緒に消えるため個別処理は要らない。
 * 作業記録（reports/schedules/comments）は組織の記録として残す。
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const auth = await requireAppUser(req);
  if (!auth.ok) return denied(res, auth);
  const me = auth.user;

  const { user_id } = (req.body ?? {}) as { user_id?: number };
  const targetId = user_id ?? me.userId;
  const isSelf = targetId === me.userId;

  // 他人を消せるのは管理者だけ
  if (!isSelf && me.role !== "admin") {
    return res.status(403).json({ error: "他の利用者を削除できるのは管理者のみです。" });
  }
  if (!me.organizationId) {
    return res.status(403).json({ error: "所属組織が特定できません。" });
  }

  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const PROJECT_URL  = process.env.VITE_SUPABASE_URL!;
  const headers = { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE };

  try {
    // 対象の実在と所属を確認する。ID を差し替えて他組織の利用者を消せないようにする
    const targetRes = await fetch(
      `${PROJECT_URL}/rest/v1/users?id=eq.${encodeURIComponent(String(targetId))}&select=id,role,auth_id,organization_id`,
      { headers },
    );
    const rows = targetRes.ok ? await targetRes.json() : null;
    const target = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!target) return res.status(404).json({ error: "対象の利用者が見つかりません。" });
    if (target.organization_id !== me.organizationId) {
      return res.status(403).json({ error: "他の組織の利用者は削除できません。" });
    }

    // 最後の管理者を消すと組織が管理不能になる（利用者の追加も権限変更もできなくなる）
    if (target.role === "admin") {
      const adminsRes = await fetch(
        `${PROJECT_URL}/rest/v1/users?organization_id=eq.${encodeURIComponent(me.organizationId)}`
          + `&role=eq.admin&select=id`,
        { headers },
      );
      const admins = adminsRes.ok ? await adminsRes.json() : null;
      if (!Array.isArray(admins)) {
        return res.status(503).json({ error: "管理者の人数を確認できませんでした。時間をおいてお試しください。" });
      }
      if (admins.length <= 1) {
        return res.status(409).json({
          error: "組織で最後の管理者のため削除できません。先に別の管理者を登録してください。",
        });
      }
    }

    // Auth ユーザーを先に消す。逆順にすると users 行が無いのに認証だけ通る状態が残り、
    // その JWT で _auth.ts の requireUser を通過できてしまう（一番避けたい失敗の形）
    if (target.auth_id) {
      const delAuth = await fetch(
        `${PROJECT_URL}/auth/v1/admin/users/${encodeURIComponent(String(target.auth_id))}`,
        { method: "DELETE", headers },
      );
      // 既に存在しない場合（404）は消えているので続行してよい
      if (!delAuth.ok && delAuth.status !== 404) {
        return res.status(500).json({ error: "認証情報の削除に失敗しました。時間をおいてお試しください。" });
      }
    }

    const delRow = await fetch(`${PROJECT_URL}/rest/v1/users?id=eq.${encodeURIComponent(String(targetId))}`, {
      method: "DELETE",
      headers: { ...headers, "Prefer": "return=minimal" },
    });
    if (!delRow.ok) {
      // Auth 側は消えているのでログインはできない。行だけ残る状態を管理者が拾えるよう明示する
      return res.status(500).json({
        error: "利用者情報の削除に失敗しました。ログインは既に無効になっています。時間をおいて再実行してください。",
      });
    }

    return res.status(200).json({ ok: true, deleted_user_id: targetId, self: isSelf });
  } catch {
    return res.status(503).json({ error: "通信に失敗しました。時間をおいてお試しください。" });
  }
}
