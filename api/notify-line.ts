import type { ApiRequest, ApiResponse, ExternalJson } from "./types.js";
import { requireAppUser, denied, checkAndRecordNotifyLimit } from "./_auth.js";

const MESSAGE_MAX_LENGTH = 1000;

// マルチテナント化: LINE通知先を organizations テーブルの組織別設定から取得する。
// 取得できない場合（所属なし・未設定・取得失敗）は既存の環境変数にフォールバックする。
// 詳細: docs/adr-001-multitenancy-and-ai.md
//
// **組織は body から受け取らない（2026-09-13）。** 以前は呼び出し元が名乗った
// organization_id でそのまま organizations を引いていたため、ログイン済みなら誰でも
// 他組織の LINE トークンを引かせ、その組織のグループに任意のメッセージを送れた。
// set-user-auth が同じ穴を「呼び出した管理者の所属で固定する」で塞いでいるのに、
// ここだけ残っていた。契約は scripts/test-api-auth-boundaries.mjs で固定してある。
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // 無認証だと踏み台にされるため、ログイン済みユーザーに限定する。
  // さらに users 行まで解決して、通知先を**呼び出した人の所属**で決める（api/_auth.ts）
  const auth = await requireAppUser(req);
  if (!auth.ok) return denied(res, auth);

  // body の organization_id は受け取らない。渡されても無視する
  const { message } = (req.body ?? {}) as { message?: string };
  if (!message) return res.status(400).json({ error: "message required" });
  if (message.length > MESSAGE_MAX_LENGTH) {
    return res.status(400).json({ error: `メッセージが長すぎます（${MESSAGE_MAX_LENGTH}文字以内）。` });
  }
  const organization_id = auth.user.organizationId;

  // レート制限（セキュリティ監査で「認証さえ通れば無制限に送れる」ことが判明したため追加）。
  // admin限定ではなく、ログイン済みの誰でも呼べるエンドポイントなので、
  // 誤爆・悪用いずれでも組織のLINEグループへのスパムを防ぐ。
  const over = await checkAndRecordNotifyLimit(auth.user.userId, organization_id);
  if (over) return denied(res, over);

  let token   = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let groupId = process.env.LINE_GROUP_ID;

  if (organization_id) {
    try {
      const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const PROJECT_URL  = process.env.VITE_SUPABASE_URL;
      if (SERVICE_ROLE && PROJECT_URL) {
        const orgRes = await fetch(
          `${PROJECT_URL}/rest/v1/organizations?id=eq.${organization_id}&select=line_channel_token,line_group_id`,
          { headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "apikey": SERVICE_ROLE } }
        );
        if (orgRes.ok) {
          const rows: ExternalJson = await orgRes.json();
          const orgConf = rows?.[0];
          if (orgConf?.line_channel_token) token = orgConf.line_channel_token;
          if (orgConf?.line_group_id)      groupId = orgConf.line_group_id;
        }
        // orgRes が失敗する場合（organizations テーブル未作成＝マイグレーション未適用など）は
        // 例外を投げず既存の環境変数フォールバックへ自然に流れる
      }
    } catch (e) {
      console.error("organizations のLINE設定取得に失敗（環境変数にフォールバック）:", e);
    }
  }

  if (!token || !groupId) return res.status(500).json({ error: "missing env" });

  console.log("LINE message:", message);

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("LINE API error:", body);
    return res.status(500).json({ error: body });
  }
  return res.status(200).json({ ok: true });
}
