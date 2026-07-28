// マルチテナント化: LINE通知先を organizations テーブルの組織別設定から取得できるようにする。
// organization_id が渡され、かつ organizations テーブル/該当行が存在する場合はそちらを優先し、
// 取得できない場合（未マイグレーション・未設定・取得失敗）は既存の環境変数にフォールバックする。
// 詳細: docs/adr-001-multitenancy-and-ai.md
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { message, organization_id } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message required" });

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
          const rows = await orgRes.json();
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
