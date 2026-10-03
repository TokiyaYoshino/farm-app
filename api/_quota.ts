// 農場（organization）ごとの回数の枠。料金の無料／有料の差はここで付ける。
//
// 決定: docs/decisions/20261001-pricing-freemium.md（枠の数字）
//       docs/decisions/20261003-adr-signup-billing-deletion.md 6節（作り方）
// 契約: scripts/test-org-quota.mjs
//
// _auth.ts の checkDailyLimit（人ごと・1日・暴走止め）とは目的が違う。あちらは支出の歯止めで、
// こちらは料金の線引き。**数える単位を人ではなく農場にする**のは、売上が農場ごとなので
// 原価の上限も農場ごとに決めるため。
//
// まだどのエンドポイントにもつないでいない（2026-10-04）。購読状態の表
// （organization_subscriptions）が無いうちにつなぐと、全農場が無料扱いになり
// 既存の農場の相談が週3件に絞られる。つなぐのは購読の表と同時。

type Fail = { ok: false; status: number; error: string };

export type Plan = "free" | "paid";
export type QuotaGroup = "consult" | "photo";
type Period = "day" | "week";

export const QUOTA: Record<QuotaGroup, Record<Plan, { limit: number; period: Period }>> = {
  consult: { free: { limit: 3, period: "week" }, paid: { limit: 8, period: "day" } },
  photo:   { free: { limit: 1, period: "week" }, paid: { limit: 3, period: "day" } },
};

/** 枠ごとに数える ai_outputs.kind。「記録に聞く」（search_chat）は相談に含める（料金の決定） */
const KINDS: Record<QuotaGroup, string[]> = {
  consult: ["advice", "search_chat"],
  photo: ["diagnosis"],
};

const LABEL: Record<QuotaGroup, string> = { consult: "相談", photo: "写真で調べる" };
const UNIT: Record<QuotaGroup, string> = { consult: "件", photo: "回" };

/** 枠の対象外（日報・次の散布時期・音声の整理など）は null。それらは料金の差を付けない */
export function groupOfKind(kind: string): QuotaGroup | null {
  for (const g of Object.keys(KINDS) as QuotaGroup[]) {
    if (KINDS[g].includes(kind)) return g;
  }
  return null;
}

const JST_MS = 9 * 3600 * 1000;

/**
 * 枠の区切りの始まり。日は日本時間の0時、週は日本時間の月曜0時。
 * UTC の日付で切ると、日本の朝（UTC では前日）に前日の枠が続いてしまう。
 */
export function windowStart(period: Period, now: Date = new Date()): Date {
  const jst = new Date(now.getTime() + JST_MS); // getUTC* が日本時間の暦を返す
  let y = jst.getUTCFullYear(), m = jst.getUTCMonth(), d = jst.getUTCDate();
  if (period === "week") {
    const daysSinceMonday = (jst.getUTCDay() + 6) % 7; // 月=0 … 日=6
    d -= daysSinceMonday;
  }
  return new Date(Date.UTC(y, m, d) - JST_MS);
}

/**
 * 農場の枠を超えていたら止める。超えていなければ null。
 *
 * **数えられなかったときは通す（fail-open）。** 数える側の不調で有料の農場まで
 * 止めるほうが、枠を一時的にすり抜けるより損害が大きい（_auth.ts の方針と同じ）。
 */
export async function checkOrgQuota(
  organizationId: string | null,
  kind: string,
  plan: Plan,
  now: Date = new Date(),
): Promise<Fail | null> {
  const group = groupOfKind(kind);
  if (!group || !organizationId) return null;

  const PROJECT_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!PROJECT_URL || !SERVICE_ROLE) return null;

  const { limit, period } = QUOTA[group][plan];
  const since = windowStart(period, now).toISOString();

  try {
    const r = await fetch(
      `${PROJECT_URL}/rest/v1/ai_outputs`
      + `?organization_id=eq.${encodeURIComponent(organizationId)}`
      + `&kind=in.(${KINDS[group].join(",")})`
      + `&created_at=gte.${encodeURIComponent(since)}&select=id`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    );
    if (!r.ok) {
      console.error(`_quota: count failed status=${r.status}`);
      return null;
    }
    // Content-Range: "0-0/12" の分母が総件数
    const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
    if (!Number.isFinite(total)) return null;
    if (total < limit) return null;

    const label = LABEL[group], unit = UNIT[group];
    const error = period === "week"
      ? `今週の${label}の回数（${limit}${unit}）に達しました。毎週月曜に戻ります。有料プランでは1日${QUOTA[group].paid.limit}${unit}まで使えます。`
      : `今日の${label}の回数（${limit}${unit}）に達しました。明日また使えます。`;
    return { ok: false, status: 429, error };
  } catch (e) {
    console.error("_quota: count threw", e);
    return null;
  }
}
