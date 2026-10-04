// 30日を過ぎた削除の控えを完全に消す（Vercel Cron から毎日1回）。
//
// 決定: docs/decisions/20261003-adr-signup-billing-deletion.md 5節（控え30日・2026-10-04 オーナー決定）
// 契約: scripts/test-purge-deleted.mjs
// 控えの表: scripts/migrations/2026-10-04-delete-organization-data.sql
//
// 呼べるのは Vercel Cron だけ。Vercel は環境変数 CRON_SECRET を Authorization: Bearer に入れて呼ぶ。
// CRON_SECRET が未設定なら誰も通さない（未設定のまま誰でも叩ける状態にしない）。
//
// 写真を先に消し、消せた控えの行だけを消す。行を先に消すと、写真のパスが分からなくなり二度と消せない。

import type { ApiRequest, ApiResponse } from "./types.js";

const BUCKET = "report-images";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const secret = process.env.CRON_SECRET;
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  const given = Array.isArray(raw) ? raw[0] : raw;
  if (!secret || given !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });

  const PROJECT_URL = process.env.VITE_SUPABASE_URL!;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, "Content-Type": "application/json" };

  const now = new Date().toISOString();
  const sel = await fetch(
    `${PROJECT_URL}/rest/v1/deleted_data_archive?purge_after=lt.${encodeURIComponent(now)}&select=id,storage_paths&limit=100`,
    { headers },
  );
  if (!sel.ok) return res.status(503).json({ error: "archive read failed" });
  const expired = (await sel.json()) as { id: string; storage_paths: string[] | null }[];

  const done: string[] = [];
  for (const row of expired) {
    const paths = row.storage_paths ?? [];
    if (paths.length > 0) {
      const rm = await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}`, {
        method: "DELETE", headers, body: JSON.stringify({ prefixes: paths }),
      }).catch(() => null);
      if (!rm?.ok) {
        console.error("purge-deleted: storage delete failed", row.id, rm?.status);
        continue; // 行は残して翌日やり直す
      }
    }
    done.push(row.id);
  }

  if (done.length > 0) {
    const del = await fetch(`${PROJECT_URL}/rest/v1/deleted_data_archive?id=in.(${done.join(",")})`, {
      method: "DELETE", headers,
    });
    if (!del.ok) return res.status(503).json({ error: "archive delete failed" });
  }
  return res.status(200).json({ ok: true, purged: done.length, remaining: expired.length - done.length });
}
