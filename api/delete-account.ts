import type { ApiRequest, ApiResponse, ExternalJson } from "./types.js";
import { requireAppUser, denied } from "./_auth.js";

// アカウントの削除。
//
// ── なぜ要るか ───────────────────────────────────────────────
//
// App Store ガイドライン 5.1.1(v)：**アプリ内でアカウント作成を提供するなら、
// アプリ内からのアカウント削除も提供しなければならない。** 招待制だった間は
// 発生していない要件で、api/signup.ts を足した時点で申請物になった
// （docs/decisions/20260922-onboarding-and-signup.md）。
//
// ── 3つの場合に分ける ────────────────────────────────────────
//
// | 状況 | 何をするか |
// |---|---|
// | 組織に自分しかいない | **組織ごと消す。** 残すと誰も入れない組織と宙に浮いた記録が残る |
// | 他に利用者がいる／自分が最後の管理者 | 他の最古参を管理者に引き継いでから、下記の匿名化 |
// | 他に利用者がいる | **匿名化する。** Auth ユーザーを消し、氏名・ログインID・メールを落とす |
//
// **匿名化であって行の削除ではない。** reports.user_id が users(id) を参照しているため
// 行を消すと記録まで道連れになる。農薬の使用回数の集計（法的義務である使用基準の
// 遵守支援）が欠けるので、**人が抜けても記録は組織に残す**。消えるのは
// ログイン手段と個人を指す情報で、Apple が求めているのはそちら。

/** 組織ごと消すときの削除順。子から親へ。FK に cascade が無いので明示的に並べる */
const ORG_TABLES_IN_ORDER = [
  "crop_advice_actions",
  "crop_advice_messages",
  "advice_threads",
  "ai_outputs",
  "tickets",
  "projects",
  "comments",
  "schedules",
  "reports",
  "pesticide_registrations",
  "pesticides",
  "crops",
  "fields",
  "settings",
  "daily_weather",
  "device_tokens",
] as const;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const auth = await requireAppUser(req);
  if (!auth.ok) return denied(res, auth);
  const me = auth.user;

  const PROJECT_URL  = process.env.VITE_SUPABASE_URL!;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = {
    "Authorization": `Bearer ${SERVICE_ROLE}`,
    "apikey": SERVICE_ROLE,
    "Content-Type": "application/json",
  };

  if (!me.organizationId) {
    return res.status(400).json({ error: "所属する農場が分かりません。サポートにご連絡ください。" });
  }

  try {
    // 同じ組織の利用者を集める。誰が残るかで処理が変わる
    const listRes = await fetch(
      `${PROJECT_URL}/rest/v1/users?organization_id=eq.${encodeURIComponent(me.organizationId)}`
      + `&select=id,role,auth_id,login_id&order=id.asc`,
      { headers },
    );
    if (!listRes.ok) return res.status(503).json({ error: "削除できませんでした。時間をおいてお試しください。" });
    const members: ExternalJson = await listRes.json();
    if (!Array.isArray(members)) return res.status(503).json({ error: "削除できませんでした。時間をおいてお試しください。" });

    // 匿名化済みの行（ログイン手段が無い）は「残る利用者」に数えない
    const active = members.filter((m: ExternalJson) => m.auth_id);
    const others = active.filter((m: ExternalJson) => m.id !== me.userId);

    // ── 1. 自分しかいない → 組織ごと消す ─────────────────────
    if (others.length === 0) {
      // 取り返しがつかないので、自分のユーザーIDを打ってもらう
      const typed = typeof req.body?.confirm_login_id === "string" ? req.body.confirm_login_id.trim() : "";
      if (!me.loginId || typed.toLowerCase() !== me.loginId.toLowerCase()) {
        return res.status(400).json({ error: "確認のため、ご自分のユーザーIDを入力してください。" });
      }

      const memberIds = members.map((m: ExternalJson) => m.id).filter((v: unknown): v is number => typeof v === "number");
      // sessions は organization_id を持たない（user_id のみ）ので利用者で消す
      if (memberIds.length > 0) {
        const r = await fetch(
          `${PROJECT_URL}/rest/v1/sessions?user_id=in.(${memberIds.join(",")})`,
          { method: "DELETE", headers },
        );
        if (!r.ok) {
          console.error("delete-account: sessions delete failed", await r.text());
          return res.status(500).json({ error: "削除の途中で失敗しました。サポートにご連絡ください。" });
        }
      }

      for (const table of ORG_TABLES_IN_ORDER) {
        const r = await fetch(
          `${PROJECT_URL}/rest/v1/${table}?organization_id=eq.${encodeURIComponent(me.organizationId)}`,
          { method: "DELETE", headers },
        );
        // 途中で止まると中途半端な組織が残る。どこで落ちたかを残して止める
        if (!r.ok) {
          console.error(`delete-account: ${table} delete failed`, await r.text());
          return res.status(500).json({ error: "削除の途中で失敗しました。サポートにご連絡ください。" });
        }
      }

      const uRes = await fetch(
        `${PROJECT_URL}/rest/v1/users?organization_id=eq.${encodeURIComponent(me.organizationId)}`,
        { method: "DELETE", headers },
      );
      if (!uRes.ok) {
        console.error("delete-account: users delete failed", await uRes.text());
        return res.status(500).json({ error: "削除の途中で失敗しました。サポートにご連絡ください。" });
      }

      const oRes = await fetch(
        `${PROJECT_URL}/rest/v1/organizations?id=eq.${encodeURIComponent(me.organizationId)}`,
        { method: "DELETE", headers },
      );
      if (!oRes.ok) {
        console.error("delete-account: organizations delete failed", await oRes.text());
        return res.status(500).json({ error: "削除の途中で失敗しました。サポートにご連絡ください。" });
      }

      // Auth ユーザーは最後に消す。先に消すと途中で失敗したとき本人が入れなくなる
      for (const m of members) {
        if (!m.auth_id) continue;
        await fetch(`${PROJECT_URL}/auth/v1/admin/users/${m.auth_id}`, { method: "DELETE", headers })
          .catch(() => {});
      }
      return res.status(200).json({ ok: true, deleted: "organization" });
    }

    // ── 2. 自分が最後の管理者なら、最古参へ引き継ぐ ───────────
    // 引き継がないと、誰も作物・圃場・農薬を追加できない組織が残る
    let handedOverTo: string | null = null;
    if (me.role === "admin" && !others.some((m: ExternalJson) => m.role === "admin")) {
      const heir = others[0]; // id 昇順で取っているので最も古い利用者
      const r = await fetch(`${PROJECT_URL}/rest/v1/users?id=eq.${heir.id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ role: "admin" }),
      });
      if (!r.ok) {
        console.error("delete-account: admin handover failed", await r.text());
        return res.status(500).json({ error: "管理者の引き継ぎに失敗しました。時間をおいてお試しください。" });
      }
      handedOverTo = typeof heir.login_id === "string" ? heir.login_id : null;
    }

    // ── 3. 匿名化する（記録は組織に残す）─────────────────────
    const anon = await fetch(`${PROJECT_URL}/rest/v1/users?id=eq.${me.userId}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        name: "退会した利用者",
        // login_id は組織横断で一意。null にすることで同じIDを再び使えるようにする
        login_id: null,
        auth_id: null,
        email: null,
        role: "worker",
      }),
    });
    if (!anon.ok) {
      console.error("delete-account: anonymize failed", await anon.text());
      return res.status(500).json({ error: "削除できませんでした。時間をおいてお試しください。" });
    }

    // 自分の作業セッション（圃場・音声メモを含む）は個人の行動履歴なので消す
    await fetch(`${PROJECT_URL}/rest/v1/sessions?user_id=eq.${me.userId}`, { method: "DELETE", headers })
      .catch(() => {});
    await fetch(`${PROJECT_URL}/auth/v1/admin/users/${me.authId}`, { method: "DELETE", headers })
      .catch(() => {});

    return res.status(200).json({ ok: true, deleted: "account", handed_over_to: handedOverTo });
  } catch (e) {
    console.error("delete-account: unexpected", e);
    return res.status(503).json({ error: "削除できませんでした。時間をおいてお試しください。" });
  }
}
