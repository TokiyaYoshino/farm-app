// ─── コメント通知の送信（Supabase Edge Function / Deno）────────────────
// comments テーブルの INSERT を Database Webhook で受け、通知対象ユーザーの
// 端末に Expo Push を送る。宛先の判定基準はアプリ側 lib/store.tsx の myNotifs と同一:
//   1. メッセージに @自分の名前 が含まれる（メンション）
//   2. 自分の作業記録へのコメント
//   3. 自分が担当（assigned_user_id、無ければ作成者 user_id）の予定へのコメント
// いずれも投稿者自身は除外する。
//
// デプロイ: supabase functions deploy push-comment --no-verify-jwt
// 設定手順とWebhookの登録は docs/push-notifications.md を参照。

interface CommentRow {
  id: string;
  target_type: "report" | "schedule";
  target_id: string;
  user_id: number;
  message: string;
  organization_id: string;
}

interface WebhookBody {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: CommentRow | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Webhook のヘッダに載せる共有シークレット（誰でも叩ける関数のため必須）
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`REST ${path} failed: ${res.status} ${await res.text()}`);
  return await res.json() as T;
}

/** 通知すべき user_id を決める（投稿者は含めない） */
async function resolveRecipients(c: CommentRow): Promise<number[]> {
  const users = await rest<{ id: number; name: string }[]>(
    `users?organization_id=eq.${c.organization_id}&select=id,name`,
  );

  const ids = new Set<number>();

  for (const u of users) {
    if (u.id !== c.user_id && u.name && c.message.includes(`@${u.name}`)) ids.add(u.id);
  }

  if (c.target_type === "report") {
    const rows = await rest<{ user_id: number }[]>(
      `reports?id=eq.${c.target_id}&select=user_id`,
    );
    const owner = rows[0]?.user_id;
    if (owner != null) ids.add(owner);
  } else {
    const rows = await rest<{ user_id: number; assigned_user_id: number | null }[]>(
      `schedules?id=eq.${c.target_id}&select=user_id,assigned_user_id`,
    );
    const sc = rows[0];
    const owner = sc?.assigned_user_id ?? sc?.user_id;
    if (owner != null) ids.add(owner);
  }

  ids.delete(c.user_id);
  return [...ids];
}

/** 通知本文（アプリ内の通知一覧の見え方に寄せる） */
function buildBody(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 119)}…` : oneLine;
}

/** Expo が返した DeviceNotRegistered のトークンを削除する */
async function pruneTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const list = tokens.map(t => `"${t}"`).join(",");
  await fetch(`${SUPABASE_URL}/rest/v1/device_tokens?token=in.(${list})`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const c = body.record;
  if (body.type !== "INSERT" || body.table !== "comments" || !c) {
    return Response.json({ skipped: true });
  }

  try {
    const recipients = await resolveRecipients(c);
    if (recipients.length === 0) return Response.json({ sent: 0, reason: "no recipients" });

    const tokenRows = await rest<{ token: string; user_id: number }[]>(
      `device_tokens?user_id=in.(${recipients.join(",")})&select=token,user_id`,
    );
    if (tokenRows.length === 0) return Response.json({ sent: 0, reason: "no tokens" });

    const senders = await rest<{ name: string }[]>(`users?id=eq.${c.user_id}&select=name`);
    const senderName = senders[0]?.name ?? "メンバー";

    const messages = tokenRows.map(t => ({
      to: t.token,
      title: `${senderName}さんのコメント`,
      body: buildBody(c.message),
      sound: "default" as const,
      data: { target_type: c.target_type, target_id: c.target_id, comment_id: c.id },
    }));

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    const pushJson = await pushRes.json().catch(() => ({})) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    if (!pushRes.ok) {
      console.error("Expo push error:", JSON.stringify(pushJson));
      return Response.json({ error: "push failed" }, { status: 500 });
    }

    // 失効したトークンを掃除（アプリ削除・再インストールで発生する）
    const dead = (pushJson.data ?? [])
      .map((r, i) => (r.details?.error === "DeviceNotRegistered" ? messages[i].to : null))
      .filter((t): t is string => t !== null);
    await pruneTokens(dead);

    return Response.json({ sent: messages.length, pruned: dead.length });
  } catch (e) {
    console.error("push-comment failed:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
