// アプリ内アカウント削除（Apple ガイドライン 5.1.1(v)）。
//
// 決定: docs/decisions/20261003-adr-signup-billing-deletion.md 5節
// 契約: scripts/test-delete-account.mjs
//
// body: { scope: "self" | "farm", confirm?: "delete-farm" }
//   - 利用者・組織は body から受け取らない。消す相手は呼び出した本人（とその農場）に固定する
//     （受け取ると、他人や他の農場を消せてしまう。set-user-auth / notify-line と同じ方針）
//
// scope=self: 本人だけ消す
//   - Auth ユーザーと端末トークンを消す。users 行は氏名を残し、login_id・email・auth_id を空にする
//     （農場の記録の記入者として氏名は残す。2026-10-03 オーナー決定。privacy.html に明記が要る）
//   - 他に利用者がいる農場の唯一の管理者は 409 last_admin（管理者がいない農場を作らない）
//   - 農場に1人だけなら 409 sole_member（農場ごと消す確認へ進ませる）
//
// scope=farm: 農場ごと消す（管理者のみ・confirm 必須）
//   - 行の削除は DB 関数 delete_organization_data で1トランザクション
//     （scripts/migrations/2026-10-04-delete-organization-data.sql。途中で失敗して半分だけ残るのを防ぐ）
//   - 行を消せてから、写真（Storage）と全員の Auth ユーザーを消す。順序を逆にすると、
//     ログインできないのに記録が残る農場ができてしまう
//
// 購読（App Store の定期購読）はここでは止まらない。止められるのは本人の App Store の設定だけなので、
// アプリの削除画面で解約の案内を出す。

import type { ApiRequest, ApiResponse } from "./types.js";
import { requireAppUser, denied } from "./_auth.js";

type Member = { id: number; role: string; auth_id: string | null };

const BUCKET = "report-images";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const auth = await requireAppUser(req);
  if (!auth.ok) return denied(res, auth);
  const me = auth.user;
  const org = me.organizationId;
  if (!org) return res.status(403).json({ error: "所属する農場が見つかりません。" });

  const { scope, confirm } = (req.body ?? {}) as { scope?: string; confirm?: string };

  const PROJECT_URL = process.env.VITE_SUPABASE_URL!;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, "Content-Type": "application/json" };
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${PROJECT_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });

  const membersRes = await rest(`users?organization_id=eq.${encodeURIComponent(org)}&select=id,role,auth_id`);
  if (!membersRes.ok) return res.status(503).json({ error: "利用者を確認できませんでした。時間をおいてお試しください。" });
  const members = (await membersRes.json()) as Member[];

  const deleteAuthUser = async (authId: string) => {
    const r = await fetch(`${PROJECT_URL}/auth/v1/admin/users/${encodeURIComponent(authId)}`, { method: "DELETE", headers });
    // 既に無い（404）なら目的は果たせている
    if (!r.ok && r.status !== 404) throw new Error(`auth delete failed: ${r.status}`);
  };

  if (scope === "self") {
    const others = members.filter(m => m.id !== me.userId);
    if (others.length === 0) {
      return res.status(409).json({
        code: "sole_member",
        error: "この農場の利用者はあなただけです。アカウントを削除すると、農場の記録もすべて削除されます。",
      });
    }
    if (me.role === "admin" && !others.some(m => m.role === "admin")) {
      return res.status(409).json({
        code: "last_admin",
        error: "あなたはこの農場の唯一の管理者です。他の人を管理者にしてから削除するか、農場ごと削除してください。",
      });
    }

    try {
      const tok = await rest(`device_tokens?user_id=eq.${me.userId}`, { method: "DELETE" });
      if (!tok.ok) throw new Error(`device_tokens delete failed: ${tok.status}`);
      const u = await rest(`users?id=eq.${me.userId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ login_id: null, email: null, auth_id: null }),
      });
      if (!u.ok) throw new Error(`users patch failed: ${u.status}`);
      await deleteAuthUser(me.authId);
      return res.status(200).json({ ok: true, scope: "self" });
    } catch (e) {
      console.error("delete-account(self):", e);
      return res.status(500).json({ error: "削除できませんでした。時間をおいてお試しください。" });
    }
  }

  if (scope === "farm") {
    if (me.role !== "admin") return res.status(403).json({ error: "農場の削除は管理者のみ実行できます。" });
    if (confirm !== "delete-farm") return res.status(400).json({ error: "確認が取れていないため削除しませんでした。" });

    // 写真のファイル名は先に控える（行を消すと引けなくなる）。自分の Storage のものだけ
    const prefix = `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/`;
    const repRes = await rest(`reports?organization_id=eq.${encodeURIComponent(org)}&image_url=not.is.null&select=image_url`);
    if (!repRes.ok) return res.status(503).json({ error: "記録を確認できませんでした。時間をおいてお試しください。" });
    const images = ((await repRes.json()) as { image_url: string | null }[])
      .map(r => r.image_url)
      .filter((u): u is string => !!u && u.startsWith(prefix))
      .map(u => decodeURIComponent(u.slice(prefix.length)));

    const rpc = await rest("rpc/delete_organization_data", { method: "POST", body: JSON.stringify({ p_org: org }) });
    if (!rpc.ok) {
      console.error("delete-account(farm): rpc failed", rpc.status, await rpc.text().catch(() => ""));
      return res.status(500).json({ error: "削除できませんでした。記録は残っています。時間をおいてお試しください。" });
    }

    // ここから先は行がもう無いので、失敗しても止めずに残りを続け、記録だけ残す
    const leftovers: string[] = [];
    if (images.length > 0) {
      const rm = await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}`, {
        method: "DELETE", headers, body: JSON.stringify({ prefixes: images }),
      }).catch(() => null);
      if (!rm?.ok) leftovers.push(`storage:${images.length}`);
    }
    for (const m of members) {
      if (!m.auth_id) continue;
      try { await deleteAuthUser(m.auth_id); } catch { leftovers.push(`auth:${m.auth_id}`); }
    }
    if (leftovers.length) console.error("delete-account(farm): leftovers", org, leftovers);
    return res.status(200).json({ ok: true, scope: "farm" });
  }

  return res.status(400).json({ error: "scope は self か farm を指定してください。" });
}
