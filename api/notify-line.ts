export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message required" });

  const token   = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;
  if (!token || !groupId) return res.status(500).json({ error: "missing env" });

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
